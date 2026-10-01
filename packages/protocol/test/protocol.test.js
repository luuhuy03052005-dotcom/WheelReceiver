import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encodeFrame,
  decodeFrame,
  decodeExtensions,
  encodeExtensions,
  compareSequence,
  createNeutralFrame,
  FRAME_HEADER,
  FRAME_SIZE,
  BUTTONS
} from '../src/index.js';

test('Golden Vector 1 - Neutral', () => {
  const expected = new Uint8Array([0x11, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const frame = encodeFrame({ sequence: 0, buttons: 0, steering: 0, brake: 0, throttle: 0 });

  assert.deepEqual(frame, expected);

  const decoded = decodeFrame(expected);
  assert.equal(decoded.header, 0x11);
  assert.equal(decoded.sequence, 0);
  assert.equal(decoded.buttons, 0);
  assert.equal(decoded.steering, 0);
  assert.equal(decoded.brake, 0);
  assert.equal(decoded.throttle, 0);
});

test('Golden Vector 2 - Full Right & Full Throttle', () => {
  const expected = new Uint8Array([0x11, 0x01, 0x00, 0x00, 0xff, 0x7f, 0x00, 0xff]);
  const frame = encodeFrame({
    sequence: 1,
    buttons: 0,
    steering: 32767,
    brake: 0,
    throttle: 255
  });

  assert.deepEqual(frame, expected);

  const decoded = decodeFrame(expected);
  assert.equal(decoded.header, 0x11);
  assert.equal(decoded.sequence, 1);
  assert.equal(decoded.buttons, 0);
  assert.equal(decoded.steering, 32767);
  assert.equal(decoded.brake, 0);
  assert.equal(decoded.throttle, 255);
});

test('Golden Vector 3 - Full Left, Full Brake, Clutch & Shift Up', () => {
  // Clutch (0x0100) | Shift Up (0x2000) = 0x2100 -> LE: 0x00, 0x21
  // Steering: -32768 -> 0x8000 -> LE: 0x00, 0x80
  const expected = new Uint8Array([0x11, 0xff, 0x00, 0x21, 0x00, 0x80, 0xff, 0x00]);
  const frame = encodeFrame({
    sequence: 255,
    buttons: BUTTONS.CLUTCH | BUTTONS.SHIFT_UP,
    steering: -32768,
    brake: 255,
    throttle: 0
  });

  assert.deepEqual(frame, expected);

  const decoded = decodeFrame(expected);
  assert.equal(decoded.header, 0x11);
  assert.equal(decoded.sequence, 255);
  assert.equal(decoded.buttons, 0x2100);
  assert.equal(decoded.steering, -32768);
  assert.equal(decoded.brake, 255);
  assert.equal(decoded.throttle, 0);
});

test('Sequence Comparison Math', () => {
  // Normal progression
  assert.deepEqual(compareSequence(5, 4), { delta: 1, isNewer: true, isDuplicate: false, isStale: false });

  // Wrap-around progression (255 -> 0)
  assert.deepEqual(compareSequence(0, 255), { delta: 1, isNewer: true, isDuplicate: false, isStale: false });
  assert.deepEqual(compareSequence(1, 255), { delta: 2, isNewer: true, isDuplicate: false, isStale: false });

  // Duplicate
  assert.deepEqual(compareSequence(10, 10), { delta: 0, isNewer: false, isDuplicate: true, isStale: false });

  // Stale (out of order arrival)
  assert.deepEqual(compareSequence(255, 0), { delta: 255, isNewer: false, isDuplicate: false, isStale: true });
  assert.deepEqual(compareSequence(4, 5), { delta: 255, isNewer: false, isDuplicate: false, isStale: true });
  assert.deepEqual(compareSequence(100, 240), { delta: 116, isNewer: true, isDuplicate: false, isStale: false });
  assert.deepEqual(compareSequence(100, 250), { delta: 106, isNewer: true, isDuplicate: false, isStale: false });
  assert.deepEqual(compareSequence(50, 200), { delta: 106, isNewer: true, isDuplicate: false, isStale: false });
  assert.deepEqual(compareSequence(200, 50), { delta: 150, isNewer: false, isDuplicate: false, isStale: true });
});

test('Rejects Malformed Frames', () => {
  assert.equal(decodeFrame(new Uint8Array([0x11, 0x00])), null);
  assert.equal(decodeFrame(new Uint8Array(9)), null);
  assert.equal(decodeFrame(new Uint8Array([0x12, 0, 0, 0, 0, 0, 0, 0])), null);
});

test('decodeExtensions roundtrip with EXT_A and EXT_B', () => {
  const [a, b] = encodeExtensions({ sequence: 77, clutch: 192, gearMode: 4, extended: 0xfeedface12345678n });
  const decoded = decodeExtensions([a, b]);
  assert.equal(decoded.clutch, 192);
  assert.equal(decoded.gearMode, 4);
  assert.equal(decoded.extended, 0xfeedface12345678n);
});

