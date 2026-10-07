import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGatewayServer } from '../../apps/gateway/src/index.js';
import { encodeFrame, decodeFrame, BUTTONS, encodeSnapshot } from '../../packages/protocol/src/index.js';
import { InputState } from '../../packages/profiles/src/input-state.js';
import { PedalControl } from '../../apps/controller-web/public/src/pedals.js';

function createMessageCollector(ws) {
  const messages = [];
  ws.on('message', (d) => {
    try { messages.push(JSON.parse(d.toString())); } catch {}
  });
  const waitMsg = async (predicate, timeout = 3000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const idx = messages.findIndex(predicate);
      if (idx !== -1) return messages.splice(idx, 1)[0];
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`Timed out waiting for message; received: ${JSON.stringify(messages)}`);
  };
  return { messages, waitMsg };
}

test('Step 1.1: Resume preconditions (disconnected, ready=false, configured=false, revision mismatch, and success)', async () => {
  const instance = createGatewayServer({ detect: false });
  const { server, pairing, pipeClient } = instance;

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise((resolve) => ws.on('open', resolve));

  const { waitMsg } = createMessageCollector(ws);
  const { nonce } = pairing.generateNonce();
  ws.send(JSON.stringify({ type: 'pair', nonce, name: 'Phone1' }));
  await waitMsg((m) => m.type === 'paired');

  // Case 1: Pipe is disconnected
  pipeClient.isConnected = false;
  pipeClient.ready = false;
  ws.send(JSON.stringify({ type: 'resume', revision: 1 }));
  const rej1 = await waitMsg((m) => m.type === 'resume_rejected');
  assert.equal(rej1.reason, 'bridge_disconnected');
  assert.equal(instance.gateway.status().armed, false);

  // Case 2: Pipe is connected, but ready = false
  pipeClient.isConnected = true;
  pipeClient.ready = false;
  pipeClient.socket = { writableLength: 0, write: () => true, end: () => {} };
  ws.send(JSON.stringify({ type: 'resume', revision: 1 }));
  const rej2 = await waitMsg((m) => m.type === 'resume_rejected');
  assert.equal(rej2.reason, 'bridge_not_ready');
  assert.equal(instance.gateway.status().armed, false);

  // Case 3: Pipe ready = true, but configured = false
  pipeClient.ready = true;
  ws.send(JSON.stringify({ type: 'resume', revision: 1 }));
  const rej3 = await waitMsg((m) => m.type === 'resume_rejected');
  assert.equal(rej3.reason, 'configuration_pending');
  assert.equal(instance.gateway.status().armed, false);

  // Apply configuration for revision 1
  pipeClient.emit('connected');
  pipeClient.emit('status', { type: 'configured', connected: true });
  assert.equal(instance.gateway.status().configured, true);
  assert.equal(instance.gateway.status().appliedRevision, 1);

  // Case 4: Revision mismatch (requested 999 instead of 1)
  ws.send(JSON.stringify({ type: 'resume', revision: 999 }));
  const rej4 = await waitMsg((m) => m.type === 'resume_rejected');
  assert.equal(rej4.reason, 'revision_mismatch');
  assert.equal(instance.gateway.status().armed, false);

  // Case 5: All preconditions met -> resume succeeds!
  ws.send(JSON.stringify({ type: 'resume', revision: 1 }));
  const ok = await waitMsg((m) => m.type === 'resumed');
  assert.equal(ok.type, 'resumed');
  assert.equal(ok.revision, 1);
  assert.equal(instance.gateway.status().armed, true);

  ws.terminate();
  await instance.close();
});

test('Step 1.2: Rapid profile changes serialize and do not misassign late configured ACK', async () => {
  const instance = createGatewayServer({ detect: false });
  const { server, pairing, pipeClient } = instance;

  let dispatchedBatches = [];
  pipeClient.isConnected = true;
  pipeClient.ready = true;
  pipeClient.socket = { writableLength: 0, write: () => true, end: () => {} };
  pipeClient.sendFrames = (frames) => {
    dispatchedBatches.push(frames);
    return true;
  };

  // Initial connect configures revision 1
  pipeClient.emit('connected');
  assert.equal(dispatchedBatches.length, 1);
  pipeClient.emit('status', { type: 'configured', connected: true });
  assert.equal(instance.gateway.status().configured, true);
  assert.equal(instance.gateway.status().appliedRevision, 1);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise((resolve) => ws.on('open', resolve));

  const { waitMsg } = createMessageCollector(ws);
  const { nonce } = pairing.generateNonce();
  ws.send(JSON.stringify({ type: 'pair', nonce }));
  await waitMsg((m) => m.type === 'paired');

  dispatchedBatches = [];
  // Send 2 profile changes rapidly: beamng (rev 2) then ets2 (rev 3)
  ws.send(JSON.stringify({ type: 'profile', gameId: 'beamng' }));
  ws.send(JSON.stringify({ type: 'profile', gameId: 'ets2' }));
  await new Promise((r) => setTimeout(r, 60));

  // Exactly ONE batch dispatched to pipe (for beamng), ets2 is queued!
  assert.equal(dispatchedBatches.length, 1, 'Profile 2 should not interleave before Profile 1 is ACKed');
  assert.equal(instance.runtime.revision, 3);
  assert.equal(instance.gateway.status().appliedRevision, 1);
  assert.equal(instance.gateway.status().configured, false);
  assert.equal(instance.gateway.status().profilePending, true);

  // Late ACK arrives for beamng (rev 2)
  pipeClient.emit('status', { type: 'configured', connected: true });

  // Applied revision must now be 2, NOT 3! And configured must still be false because rev 3 is in flight!
  assert.equal(instance.gateway.status().appliedRevision, 2);
  assert.equal(instance.gateway.status().configured, false);
  assert.equal(dispatchedBatches.length, 2, 'Second batch (ets2) dispatched upon receiving first ACK');

  // Attempting resume now with revision 3 must be rejected because rev 3 is still pending!
  ws.send(JSON.stringify({ type: 'resume', revision: 3 }));
  const rej = await waitMsg((m) => m.type === 'resume_rejected');
  assert.equal(rej.reason, 'configuration_pending');

  // Second ACK arrives for ets2 (rev 3)
  pipeClient.emit('status', { type: 'configured', connected: true });
  assert.equal(instance.gateway.status().appliedRevision, 3);
  assert.equal(instance.gateway.status().configured, true);

  // Now resume with revision 3 succeeds!
  ws.send(JSON.stringify({ type: 'resume', revision: 3 }));
  const resumed = await waitMsg((m) => m.type === 'resumed');
  assert.equal(resumed.revision, 3);

  ws.terminate();
  await instance.close();
});

test('Step 1.3: Holding throttle and require_neutral resets input lifecycle and neutralizes output', async () => {
  const instance = createGatewayServer({ detect: false });
  const { server, pairing, pipeClient } = instance;

  let neutralsSent = 0;
  pipeClient.isConnected = true;
  pipeClient.ready = true;
  pipeClient.socket = { writableLength: 0, write: () => true, end: () => {} };
  const origNeutral = pipeClient.sendNeutral.bind(pipeClient);
  pipeClient.sendNeutral = () => { neutralsSent++; return origNeutral(); };
  pipeClient.emit('connected');
  pipeClient.emit('status', { type: 'configured', connected: true });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise((resolve) => ws.on('open', resolve));

  const { waitMsg } = createMessageCollector(ws);
  const { nonce } = pairing.generateNonce();
  ws.send(JSON.stringify({ type: 'pair', nonce }));
  await waitMsg((m) => m.type === 'paired');

  ws.send(JSON.stringify({ type: 'resume', revision: 1 }));
  await waitMsg((m) => m.type === 'resumed');

  // 1. Send non-neutral frame while neutral gate is active
  const throttleFrame = encodeFrame({ sequence: 1, throttle: 255 });
  ws.send(throttleFrame);

  const reqNeutral = await waitMsg((m) => m.type === 'require_neutral');
  assert.equal(reqNeutral.type, 'require_neutral');
  assert.ok(neutralsSent > 0, 'PipeClient must have received neutral command');

  // If client tries to send another active throttle frame without unlocking neutral:
  ws.send(encodeFrame({ sequence: 2, throttle: 255 }));
  const reqNeutral2 = await waitMsg((m) => m.type === 'require_neutral');
  assert.equal(reqNeutral2.type, 'require_neutral');

  // Genuine neutral frame arrives
  ws.send(encodeFrame({ sequence: 3 }));
  const ack = await waitMsg((m) => m.type === 'ack');
  assert.equal(ack.sequence, 3);

  // Now active frame is accepted
  ws.send(encodeFrame({ sequence: 4, throttle: 200 }));
  const ack2 = await waitMsg((m) => m.type === 'ack');
  assert.equal(ack2.sequence, 4);

  // Disconnect while throttle was active
  const neutralsBeforeDisconnect = neutralsSent;
  ws.terminate();
  await new Promise((r) => setTimeout(r, 60));

  assert.ok(neutralsSent > neutralsBeforeDisconnect, 'Disconnect must neutralize virtual output');
  assert.equal(instance.gateway.status().armed, false);

  await instance.close();
});

test('Step 1.4: Pause and resume invalidates previous pointer drag session', async () => {
  // Setup minimal DOM environment expected by PedalControl
  const origWindow = globalThis.window;
  const origDocument = globalThis.document;
  globalThis.window = { app: { armed: true, layoutEditor: { editing: false } } };
  globalThis.document = { getElementById: () => null };

  try {
    function createMockElement() {
      const listeners = {};
      return {
        style: { setProperty: () => {} },
        classList: { contains: () => false },
        querySelector: () => null,
        getBoundingClientRect: () => ({ top: 100, bottom: 300, height: 200, left: 10, right: 110, width: 100 }),
        addEventListener(name, fn) {
          listeners[name] = listeners[name] || [];
          listeners[name].push(fn);
        },
        removeEventListener() {},
        dispatch(name, event) {
          for (const fn of listeners[name] || []) fn(event);
        },
        hasPointerCapture: () => false,
        setPointerCapture: () => {},
        releasePointerCapture: () => {}
      };
    }

    const container = createMockElement();
    const fill = createMockElement();
    const val = { textContent: '' };
    let observedTravel = 0;

    // Instantiate real production PedalControl
    const pedal = new PedalControl(container, fill, val, (v) => { observedTravel = v; });

    // 1. Initial state
    assert.equal(pedal.travel, 0);
    assert.equal(pedal.pointerId, null);

    // 2. Active pointerdown sets pointerId and computes travel
    container.dispatch('pointerdown', { pointerId: 42, clientY: 200 });
    assert.ok(pedal.travel > 0, 'Pointerdown must activate pedal travel');
    assert.equal(pedal.pointerId, 42);
    assert.equal(observedTravel, pedal.travel);

    // 3. Pedal reset occurs (e.g. from pause(), require_neutral, or reconnect)
    pedal.reset();
    assert.equal(pedal.travel, 0);
    assert.equal(pedal.pointerId, null);
    assert.equal(observedTravel, 0);

    // 4. Moving old finger (pointerId 42) WITHOUT new pointerdown must be ignored!
    container.dispatch('pointermove', { pointerId: 42, clientY: 150 });
    assert.equal(pedal.travel, 0, 'Old pointermove must be ignored after reset');
    assert.equal(observedTravel, 0);

    // 5. A fresh pointerdown with new pointerId starts a new valid session
    container.dispatch('pointerdown', { pointerId: 43, clientY: 180 });
    assert.ok(pedal.travel > 0, 'Fresh pointerdown starts valid session');
    assert.equal(pedal.pointerId, 43);
    assert.equal(observedTravel, pedal.travel);
  } finally {
    globalThis.window = origWindow;
    globalThis.document = origDocument;
  }
});

test('Step 1.5: Target game focus loss pauses driving and neutralizes output; return does not auto-resume', async () => {
  const instance = createGatewayServer({ detect: false });
  const { server, pairing, pipeClient, runtime } = instance;

  let neutralsSent = 0;
  pipeClient.isConnected = true;
  pipeClient.ready = true;
  pipeClient.socket = { writableLength: 0, write: () => true, end: () => {} };
  const origNeutral = pipeClient.sendNeutral.bind(pipeClient);
  pipeClient.sendNeutral = () => { neutralsSent++; return origNeutral(); };
  pipeClient.emit('connected');
  pipeClient.emit('status', { type: 'configured', connected: true });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise((resolve) => ws.on('open', resolve));

  const { waitMsg } = createMessageCollector(ws);
  const { nonce } = pairing.generateNonce();
  ws.send(JSON.stringify({ type: 'pair', nonce }));
  await waitMsg((m) => m.type === 'paired');

  ws.send(JSON.stringify({ type: 'resume', revision: 1 }));
  await waitMsg((m) => m.type === 'resumed');
  assert.equal(instance.gateway.status().armed, true);

  // Simulate active game with targetPid
  runtime.targetPid = 4321;
  runtime.focused = true;

  // Game loses focus (Alt-Tab)
  const neutralsBefore = neutralsSent;
  runtime.emit('focus', false);

  // Must receive paused notification
  const pauseMsg = await waitMsg((m) => m.type === 'paused');
  assert.match(pauseMsg.reason, /focus/i);
  assert.equal(instance.gateway.status().armed, false);
  assert.ok(neutralsSent > neutralsBefore, 'Must neutralize virtual controller output on focus loss');

  // Focus returns to game
  runtime.emit('focus', true);
  // Session MUST REMAIN disarmed (not auto-resumed)
  assert.equal(instance.gateway.status().armed, false);

  ws.terminate();
  await instance.close();
});

test('Step 1.6: Second controller cannot take over an active driving session', async () => {
  const instance = createGatewayServer({ detect: false });
  const { server, pairing, pipeClient } = instance;

  pipeClient.isConnected = true;
  pipeClient.ready = true;
  pipeClient.socket = { writableLength: 0, write: () => true, end: () => {} };
  pipeClient.emit('connected');
  pipeClient.emit('status', { type: 'configured', connected: true });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const ws1 = new WebSocket('ws://127.0.0.1:' + port + '/ws');
  await new Promise((resolve) => ws1.on('open', resolve));

  const msgs1 = [];
  ws1.on('message', (d) => {
    try { msgs1.push(JSON.parse(d.toString())); } catch {}
  });

  const { nonce: n1 } = pairing.generateNonce();
  ws1.send(JSON.stringify({ type: 'pair', nonce: n1, name: 'Phone1' }));
  while (!msgs1.some((m) => m.type === 'paired')) await new Promise((r) => setTimeout(r, 10));

  ws1.send(JSON.stringify({ type: 'resume', revision: 1 }));
  while (!msgs1.some((m) => m.type === 'resumed')) await new Promise((r) => setTimeout(r, 10));

  assert.equal(instance.gateway.status().armed, true);
  assert.equal(instance.gateway.hasActiveController, true);

  const ws2 = new WebSocket('ws://127.0.0.1:' + port + '/ws');
  await new Promise((resolve) => ws2.on('open', resolve));

  const msgs2 = [];
  ws2.on('message', (d) => {
    try { msgs2.push(JSON.parse(d.toString())); } catch {}
  });

  const pair1 = msgs1.find((m) => m.type === 'paired');
  ws2.send(JSON.stringify({ type: 'auth', token: pair1.token }));

  const start = Date.now();
  while (!msgs2.some((m) => m.type === 'error') && Date.now() - start < 3000) {
    await new Promise((r) => setTimeout(r, 10));
  }

  const err2 = msgs2.find((m) => m.type === 'error');
  assert.ok(err2, 'Controller 2 must receive error response');
  assert.match(err2.message, /Another controller/i);

  assert.equal(instance.gateway.hasActiveController, true);
  assert.equal(instance.gateway.status().armed, true);

  ws1.terminate();
  ws2.terminate();
  await instance.close();
});
