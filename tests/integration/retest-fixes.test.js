import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PipeClient } from '../../apps/gateway/src/pipe-client.js';
import { InputState } from '../../packages/profiles/src/input-state.js';
import { createGatewayServer } from '../../apps/gateway/src/index.js';
import { WebSocket } from 'ws';
import { FRAME_HEADER, EXT_A, EXT_B } from '@lan-racing-wheel/protocol';

// Mock localStorage for settingsMgr test
class MockStorage {
  constructor() { this.store = {}; }
  getItem(key) { return this.store[key] || null; }
  setItem(key, value) { this.store[key] = String(value); }
  removeItem(key) { delete this.store[key]; }
  clear() { this.store = {}; }
}

test('UI-00: SettingsManager setPairingToken and getPairingToken per host', async () => {
  globalThis.localStorage = new MockStorage();
  const { settingsMgr } = await import('../../apps/controller-web/public/src/settings.js');
  
  assert.equal(typeof settingsMgr.setPairingToken, 'function', 'setPairingToken must be a function');
  assert.equal(typeof settingsMgr.getPairingToken, 'function', 'getPairingToken must be a function');

  settingsMgr.setPairingToken('tok_host_1', '192.168.1.5:32178');
  settingsMgr.setPairingToken('tok_host_2', '127.0.0.1:32178');

  assert.equal(settingsMgr.getPairingToken('192.168.1.5:32178'), 'tok_host_1');
  assert.equal(settingsMgr.getPairingToken('127.0.0.1:32178'), 'tok_host_2');
  assert.equal(settingsMgr.getPairingToken('unknown_host'), null);

  // Clearing token
  settingsMgr.setPairingToken(null, '192.168.1.5:32178');
  assert.equal(settingsMgr.getPairingToken('192.168.1.5:32178'), null);
});

test('RT-01: PipeClient preserves chunk buffer when JSON is split across multiple data events', () => {
  const client = new PipeClient();
  const mockSocket = new EventEmitter();
  mockSocket.destroyed = false;
  mockSocket.destroy = () => { mockSocket.destroyed = true; };

  client.bindSocket(mockSocket);

  let statusReceived = null;
  client.on('status', (msg) => { statusReceived = msg; });

  // Send chunk 1: incomplete JSON line
  mockSocket.emit('data', Buffer.from('{"backend":"vjoy","buttons":70,'));
  assert.equal(statusReceived, null, 'Partial JSON must not emit status');

  // Send chunk 2: completion of JSON line
  mockSocket.emit('data', Buffer.from('"connected":true}\n'));
  assert.ok(statusReceived, 'Status must be emitted after line completion');
  assert.equal(statusReceived.backend, 'vjoy');
  assert.equal(statusReceived.buttons, 70);
  assert.equal(client.ready, true);
});

test('RT-02: PipeClient ignores drain and data from stale socket after replacement', () => {
  const client = new PipeClient();
  const oldSocket = new EventEmitter();
  const newSocket = new EventEmitter();
  oldSocket.destroyed = false;
  newSocket.destroyed = false;

  client.bindSocket(oldSocket);
  client.bindSocket(newSocket); // Replace with new socket

  let drainFlushed = false;
  client._flushQueue = () => { drainFlushed = true; };

  // Old socket emits drain
  oldSocket.emit('drain');
  assert.equal(drainFlushed, false, 'Stale socket drain must be ignored');

  // Old socket emits status data
  oldSocket.emit('data', Buffer.from('{"backend":"mock","buttons":16,"connected":true}\n'));
  assert.notEqual(client.capabilities.backend, 'mock', 'Stale socket data must be ignored');
});

test('RT-03 & RT-04: PipeClient pulse gap and expired pulse fail-safe', async () => {
  const client = new PipeClient();
  const written = [];
  const mockSocket = new EventEmitter();
  mockSocket.destroyed = false;
  mockSocket.write = (buf) => { written.push({ buf, time: Date.now() }); return true; };

  client.socket = mockSocket;
  client.isConnected = true;

  let failedReason = null;
  client.on('backpressure_overflow', ({ reason }) => { failedReason = reason; });

  // Enqueue expired pulse item (>100 ms)
  client.queue.push({
    frames: [new Uint8Array(8)],
    isPulse: true,
    enqueuedAt: Date.now() - 150,
    epoch: client.epoch
  });

  client._flushQueue();
  assert.ok(failedReason, 'Expired pulse must trigger failSafe instead of being dropped silently');
});

test('RT-05: InputState.reset(true) preserves sessionEpoch on neutral reset', () => {
  const input = new InputState();
  input.sessionEpoch = 2;

  // Normal neutral reset (preserving epoch)
  input.reset(true);
  assert.equal(input.sessionEpoch, 2, 'Neutral reset with preserveEpoch must keep sessionEpoch intact');

  // Session reset (incrementing epoch)
  input.reset(false);
  assert.equal(input.sessionEpoch, 3, 'Full reset must increment sessionEpoch');
});

test('RT-08: Malformed EXT_B does not fall back to standalone state-only 0x11 frame', async () => {
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
  await new Promise((r) => setTimeout(r, 40));

  ws.send(JSON.stringify({ type: 'resume' }));
  await new Promise((r) => setTimeout(r, 40));

  let lastAck = null;
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'ack') lastAck = msg;
    } catch {}
  });

  const seq = 10;
  // 1. Send valid EXT_A for seq 10 with clutch 255
  const extA = Buffer.alloc(8);
  extA[0] = EXT_A;
  extA[1] = seq;
  extA[2] = 255;
  ws.send(extA);
  await new Promise((r) => setTimeout(r, 20));

  // 2. Send malformed EXT_B for seq 10 (reserved byte 6 = 1, violating protocol)
  const extB = Buffer.alloc(8);
  extB[0] = EXT_B;
  extB[1] = seq;
  extB[6] = 1; // Illegal reserved byte!
  ws.send(extB);
  await new Promise((r) => setTimeout(r, 20));

  // 3. Send state frame for seq 10
  const state = Buffer.alloc(8);
  state[0] = FRAME_HEADER;
  state[1] = seq;
  ws.send(state);
  await new Promise((r) => setTimeout(r, 50));

  // The state frame MUST be rejected because transaction was corrupted!
  assert.equal(lastAck, null, 'State frame following malformed extension must NOT be accepted or ACKed');

  ws.close();
  await instance.close();
});
