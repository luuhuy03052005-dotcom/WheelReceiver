import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSteering,
  normalizePedal,
  AutoCenterSpring,
  TransmissionController
} from '../src/index.js';
import { BUTTONS } from '@lan-racing-wheel/protocol';

test('Steering Normalization - Deadzone, Limits & NaN Safety', () => {
  // NaN / Infinity returns 0 (BR-INP-06)
  assert.equal(normalizeSteering(NaN), 0);
  assert.equal(normalizeSteering(Infinity), 0);
  assert.equal(normalizeSteering(-Infinity), 0);

  // Center deadzone (default 3% = 5.4 deg out of 180 deg)
  assert.equal(normalizeSteering(0), 0);
  assert.equal(normalizeSteering(4, { maxAngleDeg: 180, deadzone: 0.03 }), 0);
  assert.equal(normalizeSteering(-4, { maxAngleDeg: 180, deadzone: 0.03 }), 0);

  // Full Locks
  assert.equal(normalizeSteering(180, { maxAngleDeg: 180, deadzone: 0.03 }), 32767);
  assert.equal(normalizeSteering(200, { maxAngleDeg: 180, deadzone: 0.03 }), 32767); // Clamped
  assert.equal(normalizeSteering(-180, { maxAngleDeg: 180, deadzone: 0.03 }), -32768);
  assert.equal(normalizeSteering(-200, { maxAngleDeg: 180, deadzone: 0.03 }), -32768); // Clamped
});

test('Pedal Normalization - Deadzone, Saturation & NaN Safety', () => {
  // NaN / Infinity returns 0 (BR-INP-06)
  assert.equal(normalizePedal(NaN), 0);
  assert.equal(normalizePedal(undefined), 0);

  // Lower deadzone (default 2%)
  assert.equal(normalizePedal(0), 0);
  assert.equal(normalizePedal(0.01), 0);

  // Upper saturation (default 98%)
  assert.equal(normalizePedal(0.99), 255);
  assert.equal(normalizePedal(1.0), 255);
  assert.equal(normalizePedal(1.2), 255); // Clamped

  // Midpoint
  const mid = normalizePedal(0.5, { lowerDeadzone: 0, upperSaturation: 1, curveExponent: 1.0 });
  assert.equal(mid, 128);
});

test('TransmissionController - Mode Switch, Clutch & Shift Pulse Latching', () => {
  const tx = new TransmissionController({ mode: 'MT', clutchThreshold: 0.5 });
  const t0 = 1000;

  // Clutch threshold (BR-CLT-01, BR-CLT-02)
  tx.setClutchTravel(0.4);
  assert.equal(tx.getButtonMask(t0) & BUTTONS.CLUTCH, 0);

  tx.setClutchTravel(0.6);
  assert.equal(tx.getButtonMask(t0) & BUTTONS.CLUTCH, BUTTONS.CLUTCH);

  // Short tap (10ms) pulse hold for at least 50ms (BR-GEAR-02)
  tx.pressShiftUp(t0);
  tx.releaseShiftUp(); // Released immediately after tap

  // Still active at t0 + 20ms
  assert.equal(tx.getButtonMask(t0 + 20) & BUTTONS.SHIFT_UP, BUTTONS.SHIFT_UP);

  // Expired at t0 + 60ms
  assert.equal(tx.getButtonMask(t0 + 60) & BUTTONS.SHIFT_UP, 0);

  // Mode switch to AT releases clutch and shift bits instantly (BR-MODE-03)
  tx.setClutchTravel(0.9);
  tx.pressShiftDown(t0);
  assert.equal(tx.getButtonMask(t0) & (BUTTONS.CLUTCH | BUTTONS.SHIFT_DOWN), BUTTONS.CLUTCH | BUTTONS.SHIFT_DOWN);

  tx.setMode('AT');
  assert.equal(tx.getButtonMask(t0) & (BUTTONS.CLUTCH | BUTTONS.SHIFT_DOWN), 0);
});
