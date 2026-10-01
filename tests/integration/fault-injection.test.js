import test from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createGatewayServer } from '../../apps/gateway/src/index.js';
import { encodeFrame, decodeFrame, compareSequence, BUTTONS, FRAME_HEADER } from '../../packages/protocol/src/index.js';
import { normalizeSteering, normalizePedal, TransmissionController } from '../../packages/control-math/src/index.js';

test('Safety & Fault-Injection: Mandatory Pairing & Token Rejection (BR-SEC-01, BR-SEC-03)', async () => {
  const instance = createGatewayServer();
  const { server, pairing } = instance;
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise((resolve) => ws.on('open', resolve));

  // 1. Attempt sending binary frame before authentication -> Must be ignored
  const unauthFrame = encodeFrame({ sequence: 1, steering: 30000, throttle: 255 });
  ws.send(unauthFrame);
  await new Promise((r) => setTimeout(r, 40));

  // 2. Attempt auth with invalid token -> Must return error
  ws.send(JSON.stringify({ type: 'auth', token: 'invalid_malicious_token' }));
  const authErr = await new Promise((resolve) => {
    ws.once('message', (data) => resolve(JSON.parse(data.toString())));
  });
  assert.equal(authErr.type, 'error');
  assert.match(authErr.message, /Invalid or revoked/);

  // 3. Attempt pair with expired or non-existent nonce -> Must return error
  ws.send(JSON.stringify({ type: 'pair', nonce: '000000' }));
  const pairErr = await new Promise((resolve) => {
    ws.once('message', (data) => resolve(JSON.parse(data.toString())));
  });
  assert.equal(pairErr.type, 'error');

  ws.terminate();
  await instance.close();
});

test('Safety & Fault-Injection: Session Exclusivity & Takeover Prevention (BR-CON-01, BR-CON-03)', async () => {
  const instance = createGatewayServer();
  const { server, pairing } = instance;
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const { nonce: nonce1 } = pairing.generateNonce();
  const ws1 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise((resolve) => ws1.on('open', resolve));
  ws1.send(JSON.stringify({ type: 'pair', nonce: nonce1 }));

  const res1 = await new Promise((resolve) => {
    ws1.once('message', (data) => resolve(JSON.parse(data.toString())));
  });
  assert.equal(res1.type, 'paired');

  // Device 2 attempts to connect and auth while Device 1 is active
  const ws2 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  await new Promise((resolve) => ws2.on('open', resolve));
  ws2.send(JSON.stringify({ type: 'auth', token: res1.token }));

  const res2 = await new Promise((resolve) => {
    ws2.once('message', (data) => resolve(JSON.parse(data.toString())));
  });
  assert.equal(res2.type, 'error');
  assert.match(res2.message, /Another controller/);

  // Clean disconnect of Device 1 unlocks session for Device 2
  ws1.close();
  await new Promise((r) => setTimeout(r, 60));

  ws2.send(JSON.stringify({ type: 'auth', token: res1.token }));
  const res2_retry = await new Promise((resolve) => {
    ws2.once('message', (data) => resolve(JSON.parse(data.toString())));
  });
  assert.equal(res2_retry.type, 'auth_ok');

  ws2.terminate();
  await instance.close();
});

test('Safety & Fault-Injection: Malformed, Short, and Corrupted Packets (BR-SEC-05)', async () => {
  // Test packet validation at decoder level
  assert.equal(decodeFrame(new Uint8Array(0)), null);
  assert.equal(decodeFrame(new Uint8Array(7)), null); // 7 bytes
  assert.equal(decodeFrame(new Uint8Array(9)), null); // 9 bytes
  assert.equal(decodeFrame(new Uint8Array([0x10, 0, 0, 0, 0, 0, 0, 0])), null); // Header != 0x11
  assert.equal(decodeFrame(new Uint8Array([0x21, 0, 0, 0, 0, 0, 0, 0])), null); // Header != 0x11
  assert.equal(decodeFrame(null), null);
  assert.equal(decodeFrame(undefined), null);
});

test('Safety & Fault-Injection: Sequence Rollover & Stale Out-of-Order Packets (BR-STATE-03)', () => {
  // Progression
  assert.equal(compareSequence(1, 0).isNewer, true);
  assert.equal(compareSequence(0, 255).isNewer, true); // Wrap around 255 -> 0
  assert.equal(compareSequence(5, 250).isNewer, true); // Wrap around 250 -> 5

  // Duplicate (same sequence) -> Dropped
  assert.equal(compareSequence(42, 42).isDuplicate, true);
  assert.equal(compareSequence(42, 42).isNewer, false);

  // Stale (old frame arriving late) -> Dropped
  assert.equal(compareSequence(255, 0).isStale, true);
  assert.equal(compareSequence(255, 0).isNewer, false);
  assert.equal(compareSequence(10, 15).isStale, true);
});

test('Safety & Fault-Injection: Numeric Safety NaN & Infinite Inputs (BR-INP-06)', () => {
  // Steering with NaN, Infinity, -Infinity, undefined
  assert.equal(normalizeSteering(NaN), 0);
  assert.equal(normalizeSteering(Infinity), 0);
  assert.equal(normalizeSteering(-Infinity), 0);
  assert.equal(normalizeSteering(null), 0);
  assert.equal(normalizeSteering(undefined), 0);

  // Pedal with NaN, Infinity, -Infinity, undefined
  assert.equal(normalizePedal(NaN), 0);
  assert.equal(normalizePedal(Infinity), 0);
  assert.equal(normalizePedal(-Infinity), 0);
  assert.equal(normalizePedal(null), 0);
  assert.equal(normalizePedal(undefined), 0);
});

test('Transmission Safety: MT to AT transition releases all clutch/gears (BR-MODE-03)', () => {
  const tx = new TransmissionController({ mode: 'MT' });
  tx.setClutchTravel(1.0);
  tx.pressShiftUp(Date.now());
  tx.pressShiftDown(Date.now());

  assert.notEqual(tx.getButtonMask() & BUTTONS.CLUTCH, 0);
  assert.notEqual(tx.getButtonMask() & BUTTONS.SHIFT_UP, 0);
  assert.notEqual(tx.getButtonMask() & BUTTONS.SHIFT_DOWN, 0);

  // Switch to AT
  tx.setMode('AT');

  // Must instantly be 0
  assert.equal(tx.getButtonMask() & BUTTONS.CLUTCH, 0);
  assert.equal(tx.getButtonMask() & BUTTONS.SHIFT_UP, 0);
  assert.equal(tx.getButtonMask() & BUTTONS.SHIFT_DOWN, 0);
});
