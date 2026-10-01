import test from 'node:test';
import assert from 'node:assert/strict';
import { PairingManager } from '../src/pairing.js';

test('PairingManager - Nonce Generation & 120s Single-Use Token Exchange', () => {
  const pairing = new PairingManager();

  // Generate 6-digit nonce
  const { nonce, expiresInSec } = pairing.generateNonce();
  assert.equal(nonce.length, 6);
  assert.equal(expiresInSec, 120);

  // Exchange nonce for token (BR-SEC-03)
  const exchange = pairing.exchangeNonce(nonce);
  assert.equal(exchange.success, true);
  assert.equal(typeof exchange.token, 'string');
  assert.equal(exchange.token.length, 64); // 32 bytes hex

  // Verify token is valid
  assert.equal(pairing.validateToken(exchange.token), true);

  // Nonce cannot be reused (BR-SEC-02)
  const reuse = pairing.exchangeNonce(nonce);
  assert.equal(reuse.success, false);

  // Invalid token check
  assert.equal(pairing.validateToken('invalid_token_123'), false);

  // Revoke token
  pairing.revokeToken(exchange.token);
  assert.equal(pairing.validateToken(exchange.token), false);
});
