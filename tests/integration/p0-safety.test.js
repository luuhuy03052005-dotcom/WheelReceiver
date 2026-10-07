import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGatewayServer } from '../../apps/gateway/src/index.js';
import { PipeClient } from '../../apps/gateway/src/pipe-client.js';
import { encodeFrame, BUTTONS, encodeSnapshot } from '../../packages/protocol/src/index.js';

test('P0 Safety: Neutral Gate on Resume (BR-CON-04)', async () => {
  const instance = createGatewayServer({ detect: false });
  const { server, pairing, pipeClient } = instance;
  // Mock connected pipe client so sendFrames succeeds without external bridge process
  pipeClient.isConnected = true;
  pipeClient.ready = true;
  pipeClient.socket = { writableLength: 0, write: () => true, end: () => {} };
  pipeClient.emit('connected');
  pipeClient.emit('status', { type: 'configured', connected: true });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise((resolve) => ws.on('open', resolve));

  const messages = [];
  ws.on('message', (d) => {
    try { messages.push(JSON.parse(d.toString())); } catch {}
  });
  const waitMsg = async (type, timeout = 2000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const idx = messages.findIndex((m) => m.type === type);
      if (idx !== -1) return messages.splice(idx, 1)[0];
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`Timed out waiting for message type ${type}`);
  };

  const { nonce } = pairing.generateNonce();
  ws.send(JSON.stringify({ type: 'pair', nonce }));
  await waitMsg('paired');

  // Resume session
  ws.send(JSON.stringify({ type: 'resume' }));
  const resumeMsg = await waitMsg('resumed');
  assert.equal(resumeMsg.type, 'resumed');

  // 1. Send a non-neutral frame immediately (steering: 15000, throttle: 200)
  const nonNeutralFrame = encodeFrame({
    sequence: 1,
    steering: 15000,
    throttle: 200
  });
  ws.send(nonNeutralFrame);

  // Gateway must reject non-neutral frame and demand neutral
  const gateMsg = await waitMsg('require_neutral');
  assert.equal(gateMsg.type, 'require_neutral');
  assert.equal(gateMsg.sequence, 1);

  // 2. Now send a genuine neutral frame (all zeros)
  const neutralFrame = encodeFrame({ sequence: 2 });
  ws.send(neutralFrame);

  const ackMsg = await waitMsg('ack');
  assert.equal(ackMsg.type, 'ack');
  assert.equal(ackMsg.sequence, 2);

  // 3. Subsequent non-neutral frame is now accepted (with sequence > 2)
  const activeFrame = encodeFrame({
    sequence: 3,
    steering: 15000,
    throttle: 200
  });
  ws.send(activeFrame);
  const ackMsg2 = await waitMsg('ack');
  assert.equal(ackMsg2.type, 'ack');
  assert.equal(ackMsg2.sequence, 3);

  ws.terminate();
  await instance.close();
});

test('P0 Safety: Sticky Stop/Pause drops subsequent binary frames', async () => {
  const instance = createGatewayServer({ detect: false });
  const { server, pairing, pipeClient } = instance;
  pipeClient.isConnected = true;
  pipeClient.ready = true;
  pipeClient.socket = { writableLength: 0, write: () => true, end: () => {} };
  pipeClient.emit('connected');
  pipeClient.emit('status', { type: 'configured', connected: true });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise((resolve) => ws.on('open', resolve));

  const messages = [];
  ws.on('message', (d) => {
    try { messages.push(JSON.parse(d.toString())); } catch {}
  });
  const waitMsg = async (type, timeout = 2000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const idx = messages.findIndex((m) => m.type === type);
      if (idx !== -1) return messages.splice(idx, 1)[0];
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`Timed out waiting for message type ${type}`);
  };

  const { nonce } = pairing.generateNonce();
  ws.send(JSON.stringify({ type: 'pair', nonce }));
  await waitMsg('paired');

  ws.send(JSON.stringify({ type: 'resume' }));
  await waitMsg('resumed');

  // Unlock neutral
  ws.send(encodeFrame({ sequence: 1 }));
  await waitMsg('ack');

  // Now user clicks Pause / Stop
  ws.send(JSON.stringify({ type: 'pause' }));
  const pauseMsg = await waitMsg('paused');
  assert.equal(pauseMsg.type, 'paused');

  // Verify that subsequent binary frames are silently dropped while paused (no auto-resume)
  let receivedUnexpectedAck = false;
  const listener = (data) => {
    try {
      const m = JSON.parse(data.toString());
      if (m.type === 'ack' || m.type === 'resumed') receivedUnexpectedAck = true;
    } catch {}
  };
  ws.on('message', listener);

  ws.send(encodeFrame({ sequence: 10, steering: 5000 }));
  await new Promise((r) => setTimeout(r, 100));

  assert.equal(receivedUnexpectedAck, false, 'Binary frames must not be ACKed or trigger auto-resume when stopped');

  ws.off('message', listener);
  ws.terminate();
  await instance.close();
});

test('P0 Safety: PipeClient mailbox coalescing preserves button edges during congestion', () => {
  const client = new PipeClient('dummy_pipe');
  client.isConnected = true;
  client.needDrain = true; // Simulate congestion
  client.socket = {
    writableLength: 100,
    destroyed: false,
    write: () => false
  };

  const frames1 = encodeSnapshot({ sequence: 1, steering: 1000, buttons: BUTTONS.SHIFT_UP });
  const frames2 = encodeSnapshot({ sequence: 2, steering: 2000, buttons: BUTTONS.SHIFT_DOWN });

  assert.equal(client.sendFrames(frames1), true);
  assert.equal(client.sendFrames(frames2), true);

  // Both button presses must be preserved via bitwise OR
  assert.equal(client.pendingSnapshot.buttons, BUTTONS.SHIFT_UP | BUTTONS.SHIFT_DOWN);
  // Analog values must be latest-state-wins
  assert.equal(client.pendingSnapshot.sequence, 2);
  assert.equal(client.pendingSnapshot.steering, 2000);
});

test('P1 Signal Resilience: Momentary lag >150ms neutralizes output without disconnecting session', async () => {
  const instance = createGatewayServer({ detect: false });
  const { server, pairing, pipeClient } = instance;
  let neutralCount = 0;
  pipeClient.isConnected = true;
  pipeClient.ready = true;
  pipeClient.socket = { writableLength: 0, write: () => true, end: () => {} };
  pipeClient.emit('connected');
  pipeClient.emit('status', { type: 'configured', connected: true });
  const origSendNeutral = pipeClient.sendNeutral.bind(pipeClient);
  pipeClient.sendNeutral = () => { neutralCount++; return origSendNeutral(); };

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise((resolve) => ws.on('open', resolve));

  const messages = [];
  ws.on('message', (d) => {
    try { messages.push(JSON.parse(d.toString())); } catch {}
  });
  const waitMsg = async (type, timeout = 2000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const idx = messages.findIndex((m) => m.type === type);
      if (idx !== -1) return messages.splice(idx, 1)[0];
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`Timed out waiting for message type ${type}`);
  };

  const { nonce } = pairing.generateNonce();
  ws.send(JSON.stringify({ type: 'pair', nonce }));
  await waitMsg('paired');

  ws.send(JSON.stringify({ type: 'resume' }));
  await waitMsg('resumed');

  // Unlock neutral gate
  ws.send(encodeFrame({ sequence: 1 }));
  await waitMsg('ack');

  // Send active driving input
  ws.send(encodeFrame({ sequence: 2, steering: 10000, throttle: 200 }));
  await waitMsg('ack');

  const neutralBeforeLag = neutralCount;

  // Simulate network lag of 200ms (>150ms watchdog deadline)
  await new Promise((r) => setTimeout(r, 220));

  // Output must have been neutralized via sendNeutral (BR-SAFE-01)
  assert.ok(neutralCount > neutralBeforeLag, 'Watchdog must neutralize pipe on 150ms lag');

  // Crucial: The session must NOT be paused or killed!
  assert.equal(instance.gateway.status().armed, true, 'Session must remain armed during momentary lag');
  assert.equal(messages.some((m) => m.type === 'paused'), false, 'Must not send paused message on momentary lag');

  // When signal resumes after lag, frames are immediately accepted
  ws.send(encodeFrame({ sequence: 3, steering: 12000, throttle: 255 }));
  const ack3 = await waitMsg('ack');
  assert.equal(ack3.sequence, 3);
  assert.equal(instance.gateway.status().armed, true);

  ws.terminate();
  await instance.close();
});

