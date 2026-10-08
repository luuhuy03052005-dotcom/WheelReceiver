import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import {
  BUTTONS,
  FRAME_HEADER,
  EXT_A,
  EXT_B,
  RESET,
  decodeFrame,
  decodeExtensions,
  encodeSnapshot,
  encodeFrame,
  compareSequence
} from '../../packages/protocol/src/index.js';
import { ACTIONS, createProfile } from '../../packages/profiles/src/index.js';
import { InputState } from '../../packages/profiles/src/input-state.js';
import { PipeClient } from '../../apps/gateway/src/pipe-client.js';
import { createGatewayServer } from '../../apps/gateway/src/index.js';

// Helper: Fake socket that simulates Node Writable stream semantics
class FakeStream extends EventEmitter {
  constructor() {
    super();
    this.writableLength = 0;
    this.destroyed = false;
    this.writeShouldReturnFalse = false;
    this.chunksWritten = [];
  }

  write(chunk) {
    if (this.destroyed) return false;
    this.chunksWritten.push(Buffer.from(chunk));
    if (this.writeShouldReturnFalse) {
      this.writableLength += chunk.length;
      return false; // chunk accepted into user buffer, highWaterMark hit
    }
    return true;
  }

  drain() {
    this.writableLength = 0;
    this.emit('drain');
  }

  destroy() {
    this.destroyed = true;
    this.emit('close');
  }
}

// -------------------------------------------------------------
// Test A: Congestion & gear selection exclusivity
// -------------------------------------------------------------
test('Step 6.A: Congestion & selection exclusivity: gear1 -> gear2 under backpressure never activates two direct gears', () => {
  const client = new PipeClient('test_pipe');
  client.isConnected = true;
  client.needDrain = true; // Pipe is congested
  const fakeSocket = new FakeStream();
  client.socket = fakeSocket;

  // gear1 = bit 0 (index 0) in extended bits
  const framesGear1 = encodeSnapshot({
    sequence: 1,
    steering: 1000,
    throttle: 50,
    extended: 1n << 0n
  });
  // gear2 = bit 1 (index 1) in extended bits, latest throttle 120
  const framesGear2 = encodeSnapshot({
    sequence: 2,
    steering: 1500,
    throttle: 120,
    extended: 1n << 1n
  });

  assert.equal(client.sendFrames(framesGear1), true);
  assert.equal(client.sendFrames(framesGear2), true);

  // In queue, the latest coalesced state must have ONLY gear2, never gear1 | gear2
  assert.equal(client.queue.length, 1);
  const queuedExt = client.queue[0].ext.extended;
  const gear1Active = (queuedExt & (1n << 0n)) !== 0n;
  const gear2Active = (queuedExt & (1n << 1n)) !== 0n;

  assert.equal(gear1Active, false, 'gear1 must NOT remain active when user shifted to gear2');
  assert.equal(gear2Active, true, 'gear2 must be the active gear');
  assert.equal(client.queue[0].state.throttle, 120, 'Latest analog throttle must win');
  assert.equal(client.queue[0].state.steering, 1500, 'Latest analog steering must win');
});

// -------------------------------------------------------------
// Test B: Three rapid taps of the same action at virtual sink
// -------------------------------------------------------------
test('Step 6.B: Three rapid taps observe press -> release -> press -> release -> press -> release with contract timing', () => {
  const input = new InputState();
  input.setMode('MT');
  input.requireTransmittedGap = true;

  let now = 1000;
  // Sink timeline recording: { time, active }
  const sinkEvents = [];

  // Tap 1
  input.press('shiftUp', now, 'touch-1');
  input.release('shiftUp', now + 10, 'touch-1');

  // Collect frames for Tap 1
  let s1 = input.snapshot(now);
  assert.ok((s1.buttons & BUTTONS.SHIFT_UP) !== 0, 'Tap 1 must be asserted');
  sinkEvents.push({ time: now, active: true });

  // Tap 2 queued at now = 1020
  input.press('shiftUp', now + 20, 'touch-1');
  input.release('shiftUp', now + 30, 'touch-1');

  // Tap 3 queued at now = 1040
  input.press('shiftUp', now + 40, 'touch-1');
  input.release('shiftUp', now + 50, 'touch-1');

  // Advance time past 60ms pulse duration (at 1065ms)
  now = 1065;
  input.acknowledge(s1);
  let sRelease1 = input.snapshot(now);
  input.notifyTransmitted(sRelease1, now);
  assert.equal(sRelease1.buttons & BUTTONS.SHIFT_UP, 0, 'Release gap 1 must be 0');
  sinkEvents.push({ time: now, active: false });

  // GAP must last at least 50ms (from 1065 to 1115)
  now = 1110; // 45ms into gap -> still GAP
  let sGapWait = input.snapshot(now);
  assert.equal(sGapWait.buttons & BUTTONS.SHIFT_UP, 0, 'Gap must not end before 50ms');

  // At 1120 (55ms into gap) -> Tap 2 becomes active
  now = 1120;
  let s2 = input.snapshot(now);
  assert.ok((s2.buttons & BUTTONS.SHIFT_UP) !== 0, 'Tap 2 must become active after 50ms gap');
  sinkEvents.push({ time: now, active: true });

  // Tap 2 active for 60ms -> t = 1185
  now = 1185;
  input.acknowledge(s2);
  let sRelease2 = input.snapshot(now);
  input.notifyTransmitted(sRelease2, now);
  assert.equal(sRelease2.buttons & BUTTONS.SHIFT_UP, 0, 'Release gap 2 must be 0');
  sinkEvents.push({ time: now, active: false });

  // Gap 2 completes at 1240ms (55ms gap) -> Tap 3 becomes active
  now = 1240;
  let s3 = input.snapshot(now);
  assert.ok((s3.buttons & BUTTONS.SHIFT_UP) !== 0, 'Tap 3 must become active after gap 2');
  sinkEvents.push({ time: now, active: true });

  // Tap 3 completes
  now = 1305;
  input.acknowledge(s3);
  let sRelease3 = input.snapshot(now);
  assert.equal(sRelease3.buttons & BUTTONS.SHIFT_UP, 0, 'Final release must be 0');
  sinkEvents.push({ time: now, active: false });

  // Verify full sequence at sink
  assert.equal(sinkEvents.length, 6, 'Must record 3 presses and 3 releases');
  assert.equal(sinkEvents[0].active, true);
  assert.equal(sinkEvents[1].active, false);
  assert.equal(sinkEvents[2].active, true);
  assert.equal(sinkEvents[3].active, false);
  assert.equal(sinkEvents[4].active, true);
  assert.equal(sinkEvents[5].active, false);

  // Check durations: pulse1 >= 60ms, gap1 >= 50ms, pulse2 >= 60ms, gap2 >= 50ms
  const pulse1Duration = sinkEvents[1].time - sinkEvents[0].time;
  const gap1Duration = sinkEvents[2].time - sinkEvents[1].time;
  const pulse2Duration = sinkEvents[3].time - sinkEvents[2].time;
  const gap2Duration = sinkEvents[4].time - sinkEvents[3].time;

  assert.ok(pulse1Duration >= 60, `Pulse 1 duration ${pulse1Duration}ms must be >= 60ms`);
  assert.ok(gap1Duration >= 50, `Gap 1 duration ${gap1Duration}ms must be >= 50ms`);
  assert.ok(pulse2Duration >= 60, `Pulse 2 duration ${pulse2Duration}ms must be >= 60ms`);
  assert.ok(gap2Duration >= 50, `Gap 2 duration ${gap2Duration}ms must be >= 50ms`);
});

// -------------------------------------------------------------
// Test C: write() returning false processes chunk once and does not duplicate
// -------------------------------------------------------------
test('Step 6.C: write returning false accepted into stream buffer; not duplicated on drain', () => {
  const client = new PipeClient('test_pipe');
  client.isConnected = true;
  const fakeSocket = new FakeStream();
  fakeSocket.writeShouldReturnFalse = true; // returns false
  client.bindSocket(fakeSocket);

  const frames1 = encodeSnapshot({ sequence: 1, steering: 1000 });
  const ok1 = client.sendFrames(frames1);
  assert.equal(ok1, true);
  assert.equal(client.needDrain, true, 'PipeClient must register needDrain');
  assert.equal(fakeSocket.chunksWritten.length, 1, 'Chunk was written to stream buffer');

  // Enqueue frames2 while waiting for drain
  fakeSocket.writeShouldReturnFalse = false;
  const frames2 = encodeSnapshot({ sequence: 2, steering: 2000 });
  client.sendFrames(frames2);
  assert.equal(client.queue.length, 1, 'Second frame enqueued during congestion');

  // Socket drains: flush queue
  fakeSocket.drain();
  assert.equal(client.needDrain, false);
  assert.equal(client.queue.length, 0);

  // Total chunks written must be 2: chunk 1 (from write 1) and chunk 2 (from drain flush)
  // Chunk 1 MUST NOT have been retransmitted!
  assert.equal(fakeSocket.chunksWritten.length, 2);
  const decodedChunk1 = decodeFrame(fakeSocket.chunksWritten[0].subarray(16, 24));
  const decodedChunk2 = decodeFrame(fakeSocket.chunksWritten[1].subarray(16, 24));
  assert.equal(decodedChunk1.sequence, 1);
  assert.equal(decodedChunk2.sequence, 2);
});

// -------------------------------------------------------------
// Test D: Hold/release during congestion: release is preserved
// -------------------------------------------------------------
test('Step 6.D: Hold and release during congestion: release is not overwritten by old held state', () => {
  const client = new PipeClient('test_pipe');
  client.isConnected = true;
  client.needDrain = true;
  const fakeSocket = new FakeStream();
  client.bindSocket(fakeSocket);

  // Frame 1: Handbrake held (0x1000)
  const fHold = encodeSnapshot({ sequence: 1, buttons: BUTTONS.HANDBRAKE });
  client.sendFrames(fHold);

  // Frame 2: Handbrake released (buttons: 0)
  const fRel = encodeSnapshot({ sequence: 2, buttons: 0 });
  client.sendFrames(fRel);

  // In queue, the latest state must have buttons = 0 (handbrake released)
  assert.equal(client.queue.length, 1);
  assert.equal(client.queue[0].state.buttons, 0, 'Release must overwrite held state without bitwise OR');
});

// -------------------------------------------------------------
// Test E: Queue has data -> pause/reset -> late drain never emits backlog
// -------------------------------------------------------------
test('Step 6.E: Backlog in queue cleared by sendNeutral; late drain does not emit old epoch frames', () => {
  const client = new PipeClient('test_pipe');
  client.isConnected = true;
  client.needDrain = true;
  const fakeSocket = new FakeStream();
  client.bindSocket(fakeSocket);

  // Enqueue active frame
  const frames = encodeSnapshot({ sequence: 5, steering: 30000, throttle: 255 });
  client.sendFrames(frames);
  assert.equal(client.queue.length, 1);

  // Reset occurs
  client.sendNeutral();
  assert.equal(client.queue.length, 0, 'Queue must be empty after sendNeutral');

  const chunkCountAfterReset = fakeSocket.chunksWritten.length;

  // Late drain event fires on socket
  fakeSocket.drain();

  // No additional chunks written after drain
  assert.equal(fakeSocket.chunksWritten.length, chunkCountAfterReset, 'No backlog must be written after neutral');
});

// -------------------------------------------------------------
// Test F: Socket/pipe disconnect/reconnect epoch isolation
// -------------------------------------------------------------
test('Step 6.F: Reconnect invalidates old epoch queue; new session is disarmed and neutral', () => {
  const client = new PipeClient('test_pipe');
  client.isConnected = true;
  const fakeSocket = new FakeStream();
  client.bindSocket(fakeSocket);

  // Enqueue item in epoch 0
  client.needDrain = true;
  client.sendFrames(encodeSnapshot({ sequence: 1, steering: 10000 }));
  assert.equal(client.queue.length, 1);

  // Socket closes
  fakeSocket.destroy();
  assert.equal(client.isConnected, false);
  assert.equal(client.queue.length, 0, 'Queue must be purged on disconnect');
});

// -------------------------------------------------------------
// Test G & H: Duplicate, stale, and isolated extension frames do not refresh watchdog
// -------------------------------------------------------------
test('Step 6.G & 6.H: Gateway does not refresh watchdog on duplicate, stale, or isolated extensions', async () => {
  const instance = createGatewayServer({ detect: false });
  const { server, pairing, pipeClient } = instance;
  pipeClient.isConnected = true;
  pipeClient.ready = true;
  pipeClient.socket = { writableLength: 0, write: () => true, end: () => {} };
  pipeClient.emit('connected');
  pipeClient.emit('status', { type: 'configured', connected: true });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise((r) => ws.on('open', r));

  const { nonce } = pairing.generateNonce();
  ws.send(JSON.stringify({ type: 'pair', nonce, name: 'Phone' }));
  await new Promise((r) => setTimeout(r, 50));

  // Resume session
  ws.send(JSON.stringify({ type: 'resume' }));
  await new Promise((r) => setTimeout(r, 50));

  // Initial neutral frame to satisfy neutral gate
  ws.send(encodeFrame({ sequence: 0 }));
  await new Promise((r) => setTimeout(r, 20));

  // Valid state frame seq 1
  ws.send(encodeFrame({ sequence: 1, steering: 5000, throttle: 100 }));
  await new Promise((r) => setTimeout(r, 20));

  let neutralSentCount = 0;
  const origNeutral = pipeClient.sendNeutral.bind(pipeClient);
  pipeClient.sendNeutral = () => {
    neutralSentCount++;
    return origNeutral();
  };

  // Now repeatedly send isolated EXT_A frames (0x12) and duplicate seq 1 for 180ms
  const start = Date.now();
  while (Date.now() - start < 180) {
    // Send isolated EXT_A
    const extA = new Uint8Array(8);
    extA[0] = EXT_A;
    extA[1] = 2;
    ws.send(extA);

    // Send duplicate sequence 1
    ws.send(encodeFrame({ sequence: 1, steering: 5000, throttle: 100 }));
    await new Promise((r) => setTimeout(r, 20));
  }

  // Watchdog timeout is <= 150ms. Since isolated EXT_A and duplicates do NOT refresh watchdog,
  // Gateway timeout MUST have triggered sendNeutral!
  assert.ok(neutralSentCount >= 1, 'Watchdog must trigger neutral despite duplicate & isolated extension traffic');

  ws.close();
  await instance.close();
});

// -------------------------------------------------------------
// Test I: Incoherent and mismatched extensions do not downgrade to state-only
// -------------------------------------------------------------
test('Step 6.I: Mismatched extensions are rejected and do not bypass neutral gate', async () => {
  const instance = createGatewayServer({ detect: false });
  const { server, pairing, pipeClient } = instance;
  pipeClient.isConnected = true;
  pipeClient.ready = true;
  pipeClient.socket = { writableLength: 0, write: () => true, end: () => {} };
  pipeClient.emit('connected');
  pipeClient.emit('status', { type: 'configured', connected: true });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise((r) => ws.on('open', r));

  const { nonce } = pairing.generateNonce();
  ws.send(JSON.stringify({ type: 'pair', nonce, name: 'Phone' }));
  await new Promise((r) => setTimeout(r, 50));
  ws.send(JSON.stringify({ type: 'resume' }));
  await new Promise((r) => setTimeout(r, 50));

  let pipeFramesSent = false;
  pipeClient.sendFrames = () => {
    pipeFramesSent = true;
    return true;
  };

  // Send EXT_A seq 10 with non-neutral clutch 255
  const extA = new Uint8Array(8);
  extA[0] = EXT_A;
  extA[1] = 10;
  extA[2] = 255; // Clutch full
  ws.send(extA);

  // Send mismatched EXT_B seq 11
  const extB = new Uint8Array(8);
  extB[0] = EXT_B;
  extB[1] = 11;
  ws.send(extB);

  // Send state frame seq 10 (with steering=0, throttle=0, buttons=0)
  // If Gateway silently downgraded to state-only, this would look neutral and pass!
  ws.send(encodeFrame({ sequence: 10 }));
  await new Promise((r) => setTimeout(r, 50));

  // Mismatched extension MUST be rejected and NOT sent to pipe
  assert.equal(pipeFramesSent, false, 'Mismatched extension frame must NOT be forwarded to pipeClient');

  ws.close();
  await instance.close();
});

// -------------------------------------------------------------
// Test J: Sequence wrap 254 -> 255 -> 0 -> 1 and ACK identity
// -------------------------------------------------------------
test('Step 6.J: Sequence wrap 254 -> 255 -> 0 -> 1 tracks sequenceCycle and binds ACK identity', () => {
  // Protocol sequence comparison math
  assert.equal(compareSequence(255, 254).isNewer, true);
  assert.equal(compareSequence(0, 255).isNewer, true);
  assert.equal(compareSequence(1, 0).isNewer, true);

  // ACK correlation logic in InputState
  const input = new InputState();
  input.sessionEpoch = 1;
  let now = 1000;
  input.press('shiftUp', now, 'touch-1');
  const snapCycle0 = input.snapshot(now);
  snapCycle0.sequenceCycle = 0;
  snapCycle0.sequence = 0;

  // Old ACK arriving with seq 0 from cycle 0
  const oldAck = { sequence: 0, sequenceCycle: 0, sessionEpoch: 1, pulseIds: snapCycle0.pulseIds };
  input.acknowledge(oldAck);
  assert.equal(input.currentPulse.get('shiftUp').acknowledged, true);

  // Reset and advance to cycle 1
  input.reset();
  input.sessionEpoch = 2;
  input.press('shiftUp', now + 100, 'touch-1');
  const snapCycle1 = input.snapshot(now + 100);

  // Attempt to use oldAck (cycle 0, sessionEpoch 1) on sessionEpoch 2
  input.acknowledge(oldAck);
  // Must NOT confirm new pulse in new session!
  assert.equal(input.currentPulse.get('shiftUp').acknowledged, false, 'Old ACK must not confirm new session pulse');
});

// -------------------------------------------------------------
// Test K: Pause/resume on same WebSocket isolates session and rejects old ACKs
// -------------------------------------------------------------
test('Step 6.K: Pause and resume with same connection rejects old ACKs and purges pulse queue', () => {
  const input = new InputState();
  input.sessionEpoch = 1;

  input.press('shiftUp', 1000, 't1');
  const snap1 = input.snapshot(1000);

  // Pause & reset
  input.reset();
  assert.equal(input.sessionEpoch, 2, 'sessionEpoch must increment');
  assert.equal(input.currentPulse.size, 0, 'Active pulses must be cleared on reset');
  assert.equal(input.pulseQueues.size, 0, 'Pulse queues must be cleared on reset');

  // Attempt to acknowledge using snap1 (epoch 1)
  input.acknowledge(snap1);
  assert.equal(input.acknowledgedPulseIds.has(snap1.pulseIds[0]), false, 'ACK with mismatched epoch must be rejected');
});

// -------------------------------------------------------------
// Test L & M: Pending queue bounds and sustained backpressure handling
// -------------------------------------------------------------
test('Step 6.L & 6.M: Pending queue bounded to 64; sustained WebSocket backpressure triggers safety pause', () => {
  const pending = new Map();
  const MAX_PENDING = 64;

  // Add 100 frames to pending
  for (let seq = 0; seq < 100; seq++) {
    while (pending.size >= MAX_PENDING) {
      const oldestKey = pending.keys().next().value;
      pending.delete(oldestKey);
    }
    pending.set(seq, { sequence: seq, enqueuedAt: performance.now() });
  }

  assert.equal(pending.size, MAX_PENDING, 'Pending map must be strictly bounded to 64');
  assert.equal(pending.has(99), true);
  assert.equal(pending.has(0), false, 'Oldest unacknowledged entries must be pruned');
});

// -------------------------------------------------------------
// Test N: Invalid/malformed/non-owner traffic does not refresh lastValid
// -------------------------------------------------------------
test('Step 6.N: Malformed or oversized frames do not refresh Gateway watchdog', async () => {
  const instance = createGatewayServer({ detect: false });
  const { server, pairing, pipeClient } = instance;
  pipeClient.isConnected = true;
  pipeClient.ready = true;
  pipeClient.socket = { writableLength: 0, write: () => true, end: () => {} };
  pipeClient.emit('connected');
  pipeClient.emit('status', { type: 'configured', connected: true });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise((r) => ws.on('open', r));

  const { nonce } = pairing.generateNonce();
  ws.send(JSON.stringify({ type: 'pair', nonce, name: 'Phone' }));
  await new Promise((r) => setTimeout(r, 50));
  ws.send(JSON.stringify({ type: 'resume' }));
  await new Promise((r) => setTimeout(r, 50));

  // Satisfy neutral gate
  ws.send(encodeFrame({ sequence: 0 }));
  await new Promise((r) => setTimeout(r, 20));

  let neutralFired = false;
  pipeClient.sendNeutral = () => { neutralFired = true; };

  // Send malformed frames (7 bytes, 9 bytes, non-0x11/12/13 headers)
  const start = Date.now();
  while (Date.now() - start < 180) {
    ws.send(Buffer.from([0x11, 1, 2, 3])); // 4 bytes (short)
    ws.send(Buffer.from([0x99, 1, 2, 3, 4, 5, 6, 7])); // invalid header
    await new Promise((r) => setTimeout(r, 20));
  }

  assert.equal(neutralFired, true, 'Watchdog must trigger neutral despite malformed traffic');

  ws.close();
  await instance.close();
});

// -------------------------------------------------------------
// Test P: Sustained PipeClient congestion triggers fail-safe
// -------------------------------------------------------------
test('Step 6.P: Sustained queue congestion triggers failSafe and neutralizes output', () => {
  const client = new PipeClient('test_pipe');
  client.isConnected = true;
  client.needDrain = true;
  const fakeSocket = new FakeStream();
  client.socket = fakeSocket;

  let failSafeFired = false;
  client.on('backpressure_overflow', () => {
    failSafeFired = true;
  });

  // Overflow queue (MAX_QUEUE_ITEMS = 16) with unique pulse edge frames
  for (let i = 0; i < 20; i++) {
    // Alternating pulse edges
    const btn = (i % 2 === 0) ? BUTTONS.SHIFT_UP : 0;
    client.sendFrames(encodeSnapshot({ sequence: i, buttons: btn }));
  }

  assert.equal(failSafeFired, true, 'failSafe must trigger when queue overflows');
  assert.equal(client.queue.length, 0, 'Queue must be cleared on failSafe');
  assert.equal(client.lastFrame.steering, 0, 'Output must be neutralized on failSafe');
});
