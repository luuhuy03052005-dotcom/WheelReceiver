import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import { createGatewayServer } from '../../apps/gateway/src/index.js';
import { encodeFrame, decodeFrame, BUTTONS } from '../../packages/protocol/src/index.js';

test('E2E Full Stack - Pairing, Stream & Neutralization', async (t) => {
  const instance = createGatewayServer();
  const { server, pairing } = instance;

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const wsUrl = `ws://127.0.0.1:${port}/ws`;
  const clientWs = new WebSocket(wsUrl);

  await new Promise((resolve) => clientWs.on('open', resolve));

  // 1. Generate Nonce & Pair
  const { nonce } = pairing.generateNonce();
  clientWs.send(JSON.stringify({ type: 'pair', nonce }));

  const pairResponse = await new Promise((resolve) => {
    clientWs.once('message', (data) => resolve(JSON.parse(data.toString())));
  });

  assert.equal(pairResponse.type, 'paired');
  assert.equal(typeof pairResponse.token, 'string');

  // Resume session explicitly and unlock with neutral frame (BR-CON-04)
  clientWs.send(JSON.stringify({ type: 'resume' }));
  await new Promise((resolve) => {
    clientWs.once('message', (data) => resolve(JSON.parse(data.toString())));
  });
  clientWs.send(encodeFrame({ sequence: 0 }));

  // 2. Send 8-byte Binary Steering & Throttle Frame
  const frame = encodeFrame({
    sequence: 1,
    buttons: BUTTONS.SHIFT_UP,
    steering: 20000,
    brake: 0,
    throttle: 255
  });

  clientWs.send(frame);
  await new Promise((r) => setTimeout(r, 50));

  // 3. Second client attempts connection -> Rejected due to single owner rule (BR-CON-01)
  const secondWs = new WebSocket(wsUrl);
  await new Promise((resolve) => secondWs.on('open', resolve));
  secondWs.send(JSON.stringify({ type: 'auth', token: pairResponse.token }));

  const secondResponse = await new Promise((resolve) => {
    secondWs.once('message', (data) => resolve(JSON.parse(data.toString())));
  });

  assert.equal(secondResponse.type, 'error');
  assert.match(secondResponse.message, /Another controller/);

  // 4. Cleanup
  secondWs.terminate();
  clientWs.terminate();
  await instance.close();
});
