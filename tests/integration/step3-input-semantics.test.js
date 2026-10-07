import test from 'node:test';
import assert from 'node:assert/strict';
import { InputState } from '../../packages/profiles/src/input-state.js';
import { BUTTONS, decodeFrame } from '../../packages/protocol/src/index.js';
import * as webControlMath from '../../apps/controller-web/public/src/control-math.js';
import * as pkgControlMath from '../../packages/control-math/src/index.js';
import { ControllerApp } from '../../apps/controller-web/public/src/app.js';

// Mock DOM helper for unit-level keyboard, pointer, and focus testing
function createMockButton(actionId = 'horn', primaryId = null) {
  const listeners = {};
  const classes = new Set();
  const capturedPointers = new Set();
  const btn = {
    tagName: 'BUTTON',
    disabled: false,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (classes.has(c)) classes.delete(c); else classes.add(c);
        } else if (force) classes.add(c); else classes.delete(c);
      },
      contains: (c) => classes.has(c)
    },
    dataset: primaryId ? { primary: primaryId } : { action: actionId },
    addEventListener(name, fn) {
      listeners[name] = listeners[name] || [];
      listeners[name].push(fn);
    },
    dispatchEvent(name, event = {}) {
      if (!event.preventDefault) event.preventDefault = () => {};
      for (const fn of listeners[name] || []) fn(event);
    },
    setPointerCapture(id) { capturedPointers.add(id); },
    releasePointerCapture(id) { capturedPointers.delete(id); },
    hasPointerCapture(id) { return capturedPointers.has(id); }
  };
  return btn;
}

function createTestAppHarness(options = {}) {
  const sentFrames = [];
  const input = new InputState();
  input.requireTransmittedGap = true;
  const app = {
    armed: true,
    input,
    ws: {
      readyState: 1,
      bufferedAmount: 0,
      send(frame) { sentFrames.push(new Uint8Array(frame)); }
    },
    sequence: 0,
    sessionEpoch: input.sessionEpoch,
    pending: new Map(),
    profile: { mode: options.mode || 'AT', range: 900 },
    travel: { throttle: 0, brake: 0, clutch: 0 },
    wheel: { currentAngle: 0 },
    stats: { count: 0 },
    buttons: [],
    bindButton: ControllerApp.prototype.bindButton,
    sendStateFrame: ControllerApp.prototype.sendStateFrame,
    reset() {
      this.input.reset();
      this.sessionEpoch = this.input.sessionEpoch;
      this.pending.clear();
      this.travel = { throttle: 0, brake: 0, clutch: 0 };
      this.wheel.currentAngle = 0;
      for (const btn of this.buttons) {
        btn._cleanup?.();
        btn._resetPointer?.();
      }
    },
    pause() {
      this.armed = false;
      this.reset();
    }
  };
  return { app, sentFrames };
}

test('Step 3.1: Control-math single source of truth verification', () => {
  // 1. Verify re-exports and identical functionality
  assert.equal(typeof webControlMath.normalizeSteering, 'function');
  assert.equal(typeof webControlMath.normalizePedal, 'function');
  assert.equal(typeof webControlMath.AutoCenterSpring, 'function');

  // Mathematical consistency for steering normalization
  const testAngles = [-200, -180, -90, -5, 0, 5, 90, 180, 200, NaN, Infinity, -Infinity, null, undefined];
  for (const angle of testAngles) {
    const fromWeb = webControlMath.normalizeSteering(angle, { maxAngleDeg: 180, deadzone: 0.03 });
    const fromPkg = pkgControlMath.normalizeSteering(angle, { maxAngleDeg: 180, deadzone: 0.03 });
    assert.equal(fromWeb, fromPkg, `normalizeSteering mismatch for angle: ${angle}`);
  }

  // Mathematical consistency for pedal normalization
  const testPedals = [-0.1, 0, 0.01, 0.05, 0.5, 0.97, 0.99, 1.0, 1.2, NaN, Infinity, null];
  for (const travel of testPedals) {
    const fromWeb = webControlMath.normalizePedal(travel);
    const fromPkg = pkgControlMath.normalizePedal(travel);
    assert.equal(fromWeb, fromPkg, `normalizePedal mismatch for travel: ${travel}`);
  }

  // Exact reference identity: public/src/control-math.js is a direct re-export of packages/control-math
  assert.equal(webControlMath.normalizeSteering, pkgControlMath.normalizeSteering);
  assert.equal(webControlMath.normalizePedal, pkgControlMath.normalizePedal);
  assert.equal(webControlMath.AutoCenterSpring, pkgControlMath.AutoCenterSpring);

  // AutoCenterSpring behavior
  const spring = new webControlMath.AutoCenterSpring({ durationMs: 100 });
  spring.start(90);
  const t0 = spring.startTime;
  assert.ok(spring.update(t0 + 50) > 0 && spring.update(t0 + 50) < 90);
  assert.equal(spring.update(t0 + 120), 0);
});

test('Step 3.2: Multi-source hold tracking (touch + keyboard independent release)', () => {
  const input = new InputState();
  const TOUCH_SRC = 'btn:horn:touch1';
  const KBD_SRC = 'kbd:KeyH';

  // 1. Touch presses horn
  input.press('horn', TOUCH_SRC, 0);
  let snap = input.snapshot(0);
  assert.ok(snap.extended & (1n << 25n), 'Horn bit 25 should be set by touch');
  assert.equal(input.heldSources.get('horn')?.size, 1);

  // 2. Keyboard also presses horn
  input.press('horn', KBD_SRC, 10);
  snap = input.snapshot(10);
  assert.ok(snap.extended & (1n << 25n), 'Horn bit 25 should stay set when keyboard also presses');
  assert.equal(input.heldSources.get('horn')?.size, 2);

  // 3. Touch releases horn: Keyboard source is STILL held, so horn must remain held!
  input.release('horn', TOUCH_SRC, 20);
  snap = input.snapshot(20);
  assert.ok(snap.extended & (1n << 25n), 'Horn bit 25 MUST remain active after touch release because keyboard is held');
  assert.equal(input.heldSources.get('horn')?.size, 1);
  assert.ok(input.heldSources.get('horn')?.has(KBD_SRC));

  // 4. Keyboard releases horn: Now both sources released, horn drops
  input.release('horn', KBD_SRC, 30);
  snap = input.snapshot(30);
  assert.ok(!(snap.extended & (1n << 25n)), 'Horn bit 25 must clear when all sources are released');
  assert.equal(input.heldSources.get('horn'), undefined);

  // 5. Two distinct touch buttons mapped to same action (e.g. handbrake)
  const BTN1 = 'btn:handbrake:quick';
  const BTN2 = 'btn:handbrake:paddle';
  input.press('handbrake', BTN1, 40);
  input.press('handbrake', BTN2, 45);
  assert.equal(input.heldSources.get('handbrake')?.size, 2);

  input.release('handbrake', BTN1, 50);
  snap = input.snapshot(50);
  assert.equal(snap.buttons & BUTTONS.HANDBRAKE, BUTTONS.HANDBRAKE, 'Handbrake must remain active while BTN2 is held');

  input.release('handbrake', BTN2, 60);
  snap = input.snapshot(60);
  assert.equal(snap.buttons & BUTTONS.HANDBRAKE, 0, 'Handbrake clears when BTN2 also releases');
});

test('Step 3.3: Pulse action held for extended duration does not stay asserted nor repeat', () => {
  const input = new InputState();
  const SRC = 'btn:shiftUp:pad';

  // 1. Press and hold shiftUp at t = 0
  input.press('shiftUp', SRC, 0);

  // During initial duration (0..60ms), pulse is active
  let snap = input.snapshot(10);
  assert.equal(snap.buttons & BUTTONS.SHIFT_UP, BUTTONS.SHIFT_UP, 'shiftUp must be active during pulse duration');
  input.acknowledge(snap);

  snap = input.snapshot(50);
  assert.equal(snap.buttons & BUTTONS.SHIFT_UP, BUTTONS.SHIFT_UP, 'shiftUp still active at t=50ms');

  // At t = 70ms (> 60ms min duration and acknowledged): pulse must de-assert to 0!
  snap = input.snapshot(70);
  assert.equal(snap.buttons & BUTTONS.SHIFT_UP, 0, 'shiftUp must drop to 0 after pulse duration even if finger is held');

  // Verify across extended holding (t = 200ms, 500ms, 1000ms): bit STAYS 0 and DOES NOT repeat
  for (const t of [200, 350, 500, 800, 1000]) {
    snap = input.snapshot(t);
    assert.equal(snap.buttons & BUTTONS.SHIFT_UP, 0, `shiftUp must NOT stay asserted or repeat at t=${t}ms while held`);
  }

  // 2. Physical release at t = 1000ms
  input.release('shiftUp', SRC, 1000);
  snap = input.snapshot(1010);
  assert.equal(snap.buttons & BUTTONS.SHIFT_UP, 0);

  // 3. New press edge at t = 1050ms triggers a new pulse
  input.press('shiftUp', SRC, 1050);
  snap = input.snapshot(1060);
  assert.equal(snap.buttons & BUTTONS.SHIFT_UP, BUTTONS.SHIFT_UP, 'New press edge triggers next pulse');
  input.acknowledge(snap);
  snap = input.snapshot(1120);
  assert.equal(snap.buttons & BUTTONS.SHIFT_UP, 0, 'Second pulse drops after its duration');
});

test('Step 3.4: Rapid double tap produces observable release gap between pulses', () => {
  const input = new InputState();
  const SRC = 'btn:shiftDown:pad';

  // Tap 1: press at 0, release at 20
  input.press('shiftDown', SRC, 0);
  input.release('shiftDown', SRC, 20);

  // Tap 2: press at 30, release at 50 (rapid double tap)
  input.press('shiftDown', SRC, 30);
  input.release('shiftDown', SRC, 50);

  // Track the state across snapshots simulated at 60Hz (~16.6ms intervals)
  const timeline = [];
  const times = [0, 16, 33, 50, 66, 83, 100, 116, 133, 150, 166, 183, 200];

  for (const t of times) {
    const snap = input.snapshot(t);
    const isAsserted = (snap.buttons & BUTTONS.SHIFT_DOWN) !== 0;
    timeline.push({ t, isAsserted });
    if (isAsserted) {
      input.acknowledge(snap);
    }
  }

  // Find transition points: must see ON -> OFF (gap) -> ON -> OFF
  const states = timeline.map((entry) => (entry.isAsserted ? 1 : 0));
  
  // Verify first pulse asserted
  assert.equal(states[0], 1, 'Tap 1 must be asserted initially');
  assert.equal(states[1], 1, 'Tap 1 must stay asserted during pulse duration');

  // Verify observable gap (state 0) exists after Tap 1
  const firstZeroIndex = states.findIndex((val, idx) => idx > 1 && val === 0);
  assert.ok(firstZeroIndex !== -1, 'Observable release gap (bit=0) must exist after Tap 1');

  // Verify Tap 2 is asserted after the gap
  const secondOneIndex = states.findIndex((val, idx) => idx > firstZeroIndex && val === 1);
  assert.ok(secondOneIndex !== -1, 'Tap 2 must be asserted after release gap');

  // Verify Tap 2 finishes and returns to 0
  const finalZeroIndex = states.findIndex((val, idx) => idx > secondOneIndex && val === 0);
  assert.ok(finalZeroIndex !== -1, 'Tap 2 must de-assert after its pulse duration');

  // Check gap duration: at least 1 full frame (>= 16ms, ideally >= 40-50ms)
  const gapDuration = timeline[secondOneIndex].t - timeline[firstZeroIndex].t;
  assert.ok(gapDuration >= 30, `Observable gap must be >= 30ms (actual: ${gapDuration}ms)`);
});

test('Step 3.5: Stale or late ACK does not confirm or erase a newer queued tap', () => {
  const input = new InputState();

  // Pulse 1 at t = 0
  input.press('camera', 'btn1', 0);
  const snap1 = input.snapshot(10);
  assert.ok(snap1.pulseIds && snap1.pulseIds.length > 0, 'Snapshot 1 must contain pulseId');
  const pulseId1 = snap1.pulseIds[0];
  input.release('camera', 'btn1', 20);

  // Let Pulse 1 finish and advance past gap
  input.acknowledge(snap1);
  input.snapshot(80); // transitions to gap
  input.snapshot(150); // gap completes

  // Pulse 2 at t = 160
  input.press('camera', 'btn1', 160);
  const snap2 = input.snapshot(170);
  assert.ok(snap2.pulseIds && snap2.pulseIds.length > 0, 'Snapshot 2 must contain pulseId');
  const pulseId2 = snap2.pulseIds[0];
  assert.notEqual(pulseId1, pulseId2, 'Pulse IDs must be uniquely distinguished');

  // Simulate late duplicate ACK for Snapshot 1 arriving NOW at t = 175
  input.acknowledge(snap1);

  // Verify Pulse 2 is NOT marked acknowledged by the stale ACK of Snapshot 1
  assert.ok(!input.acknowledgedPulseIds.has(pulseId2), 'Stale ACK from snap1 must NOT acknowledge pulseId2');

  // Verify camera bit remains asserted for Pulse 2's duration
  const snap3 = input.snapshot(180);
  assert.equal(snap3.buttons & BUTTONS.CAMERA, BUTTONS.CAMERA, 'Pulse 2 must remain asserted despite stale snap1 ACK');
});

test('Step 3.6: Transmission mode filtering at final snapshot stage (AT, MT, MTC, H)', () => {
  const input = new InputState();

  // Test 1: Mode AT
  input.setMode('AT');
  // Attempt to press clutch, paddle shifts, and manual gears
  input.press('shiftUp', 0);
  input.press('shiftDown', 0);
  input.press('clutchQuick', 0);
  input.press('gear1', 0);
  input.press('drive', 0);
  input.gear = 'gear2';

  let snap = input.snapshot(10, 'AT');
  assert.equal(snap.buttons & BUTTONS.CLUTCH, 0, 'AT mode must strictly clear CLUTCH button');
  assert.equal(snap.buttons & BUTTONS.SHIFT_UP, 0, 'AT mode must strictly clear SHIFT_UP button');
  assert.equal(snap.buttons & BUTTONS.SHIFT_DOWN, 0, 'AT mode must strictly clear SHIFT_DOWN button');
  assert.equal(snap.extended & 0x3Fn, 0n, 'AT mode must strictly clear manual gears 1-6 in extended bits');
  assert.ok(snap.extended & (1n << 8n), 'AT mode must preserve automatic gears (drive bit 8)');

  // Test 2: Mode MT (Sequential, no clutch)
  input.reset();
  input.setMode('MT');
  input.press('shiftUp', 0);
  input.press('clutchQuick', 0);
  input.press('gear1', 0);
  input.gear = 'gear1';

  snap = input.snapshot(10, 'MT');
  assert.equal(snap.buttons & BUTTONS.SHIFT_UP, BUTTONS.SHIFT_UP, 'MT mode allows SHIFT_UP');
  assert.equal(snap.buttons & BUTTONS.CLUTCH, 0, 'MT mode strictly clears CLUTCH');
  assert.equal(snap.extended & 0x3FFn, 0n, 'MT mode strictly clears all direct transmission gears (bits 0-9)');

  // Test 3: Mode MTC (Sequential + Clutch)
  input.reset();
  input.setMode('MTC');
  input.press('shiftUp', 0);
  input.press('clutchQuick', 0);
  input.press('gear1', 0);

  snap = input.snapshot(10, 'MTC');
  assert.equal(snap.buttons & BUTTONS.SHIFT_UP, BUTTONS.SHIFT_UP, 'MTC mode allows SHIFT_UP');
  assert.equal(snap.buttons & BUTTONS.CLUTCH, BUTTONS.CLUTCH, 'MTC mode allows CLUTCH');
  assert.equal(snap.extended & 0x3FFn, 0n, 'MTC mode strictly clears direct transmission gears (bits 0-9)');

  // Test 4: Mode H (H-pattern + Clutch)
  input.reset();
  input.setMode('H');
  input.press('shiftUp', 0);
  input.press('clutchQuick', 0);
  input.gear = 'gear3';

  snap = input.snapshot(10, 'H');
  assert.equal(snap.buttons & BUTTONS.SHIFT_UP, 0, 'H mode strictly clears SHIFT_UP');
  assert.equal(snap.buttons & BUTTONS.CLUTCH, BUTTONS.CLUTCH, 'H mode allows CLUTCH');
  assert.ok(snap.extended & (1n << 2n), 'H mode allows gear3 (bit 2)');

  // Mutual gear exclusivity in H-pattern: cannot have gear1 and gear2 active simultaneously
  input.gear = 'gear1';
  input.press('gear2', 0);
  snap = input.snapshot(10, 'H');
  let gearBits = 0;
  for (let b = 0n; b <= 6n; b++) {
    if ((snap.extended & (1n << b)) !== 0n) gearBits++;
  }
  assert.equal(gearBits, 1, 'H mode must enforce at most 1 active direct gear bit');

  // Test 5: Dynamic Mode Transition (MTC -> AT immediately neutralizes clutch and shift)
  input.reset();
  input.setMode('MTC');
  input.press('clutchQuick', 0);
  input.press('shiftUp', 0);
  snap = input.snapshot(10, 'MTC');
  assert.ok(snap.buttons & BUTTONS.CLUTCH);
  assert.ok(snap.buttons & BUTTONS.SHIFT_UP);

  // Transition to AT (BR-MODE-03)
  input.setMode('AT');
  snap = input.snapshot(20, 'AT');
  assert.equal(snap.buttons & BUTTONS.CLUTCH, 0, 'MT/MTC -> AT transition immediately neutralizes clutch');
  assert.equal(snap.buttons & BUTTONS.SHIFT_UP, 0, 'MT/MTC -> AT transition immediately neutralizes shiftUp');
});

test('Step 3.7: Reset isolates session: does not replay previous inputs or queued pulses', () => {
  const input = new InputState();

  // Accumulate inputs across multiple sources
  input.press('horn', 'touch1', 0);
  input.press('horn', 'kbd1', 0);
  input.press('handbrake', 'touch2', 0);
  input.press('shiftUp', 'touch3', 0);
  input.press('shiftDown', 'touch3', 10); // queued pulse
  input.gear = 'gear4';

  // Perform hard reset
  input.reset();

  // Immediately query snapshot
  const neutralSnap = input.snapshot(50);
  assert.equal(neutralSnap.buttons, 0, 'Buttons must be 0 after reset');
  assert.equal(neutralSnap.extended, 0n, 'Extended bits must be 0n after reset');
  assert.equal(neutralSnap.active.size, 0, 'Active set must be empty after reset');
  assert.equal(neutralSnap.pulseIds.length, 0, 'PulseIds must be empty after reset');
  assert.equal(input.heldSources.size, 0, 'Held sources must be purged');

  // Advance time past what would have been the queued pulse's delivery window
  for (const t of [100, 150, 200, 300]) {
    const laterSnap = input.snapshot(t);
    assert.equal(laterSnap.buttons, 0, `No old pulse must replay at t=${t}`);
    assert.equal(laterSnap.extended, 0n, `No old input must replay at t=${t}`);
  }
});

// ============================================================================
// STEP 3.1 REGRESSION TESTS (Section 5 Required Tests A through H)
// ============================================================================

test('Step 3.8.A: Enter down -> button blur releases keyboard source', () => {
  const { app } = createTestAppHarness();
  const btn = createMockButton('horn');
  app.buttons.push(btn);
  app.bindButton(btn, 'horn');

  // 1. Enter keydown
  btn.dispatchEvent('keydown', { key: 'Enter', code: 'Enter' });
  assert.equal(btn.classList.contains('active'), true, 'Button must show active class on Enter down');
  assert.equal(btn._heldKeys.has('Enter'), true, 'Enter key must be tracked in _heldKeys');
  let snap = app.input.snapshot();
  assert.ok(snap.extended & (1n << 25n), 'Horn bit 25 must be asserted while Enter is held');

  // 2. Button blur
  btn.dispatchEvent('blur', {});
  assert.equal(btn.classList.contains('active'), false, 'Active class must be removed on blur');
  assert.equal(btn._heldKeys.size, 0, 'Local _heldKeys must be cleared on blur');
  snap = app.input.snapshot();
  assert.equal(snap.extended & (1n << 25n), 0n, 'Horn bit must be released after button blur');
});

test('Step 3.8.B: Keyboard-only down -> app reset leaves model neutral, class inactive, and local sources empty', () => {
  const { app } = createTestAppHarness();
  const btn = createMockButton('horn');
  app.buttons.push(btn);
  app.bindButton(btn, 'horn');

  // Press via keyboard Enter
  btn.dispatchEvent('keydown', { key: 'Enter', code: 'Enter' });
  assert.equal(btn.classList.contains('active'), true);
  assert.ok(app.input.snapshot().extended & (1n << 25n));

  // Trigger app-wide reset
  app.reset();

  assert.equal(btn.classList.contains('active'), false, 'Button must not retain active class after app reset');
  assert.equal(btn._heldKeys.size, 0, 'Button heldKeys must be empty after reset');
  assert.equal(app.input.heldSources.size, 0, 'InputState held sources must be completely empty');
  assert.equal(app.input.snapshot().extended, 0n, 'Snapshot must be strictly neutral after reset');
});

test('Step 3.8.C: Touch + keyboard on same button -> button blur releases keyboard, keeps valid touch ownership', () => {
  const { app } = createTestAppHarness();
  const btn = createMockButton('horn');
  app.buttons.push(btn);
  app.bindButton(btn, 'horn');

  // 1. Touch pointerdown
  btn.dispatchEvent('pointerdown', { pointerId: 42 });
  assert.equal(btn.classList.contains('active'), true);
  const touchSourceId = btn._btnSourceId;
  assert.ok(app.input.heldSources.get('horn')?.has(touchSourceId));

  // 2. Keyboard Enter down on same button
  btn.dispatchEvent('keydown', { key: 'Enter', code: 'Enter' });
  assert.equal(app.input.heldSources.get('horn')?.size, 2);

  // 3. Button blurs (e.g. keyboard focus lost or alt-tab)
  btn.dispatchEvent('blur', {});

  // Keyboard released, but valid touch ownership MUST be retained!
  assert.equal(btn._heldKeys.size, 0, 'Keyboard keys must be released on blur');
  assert.equal(btn.classList.contains('active'), true, 'Button MUST remain active because touch pointer is still held');
  assert.equal(app.input.heldSources.get('horn')?.has(touchSourceId), true, 'Touch source must remain held in InputState');
  assert.ok(app.input.snapshot().extended & (1n << 25n), 'Horn must remain asserted on touch');

  // 4. Finally touch releases
  btn.dispatchEvent('pointerup', { pointerId: 42 });
  assert.equal(btn.classList.contains('active'), false, 'Button active class removed after touch release');
  assert.equal(app.input.heldSources.get('horn'), undefined);
});

test('Step 3.8.D: Space + Enter on same button -> releasing one key preserves other key and keeps active UI class', () => {
  const { app } = createTestAppHarness();
  const btn = createMockButton('horn');
  app.buttons.push(btn);
  app.bindButton(btn, 'horn');

  // Press Space then Enter
  btn.dispatchEvent('keydown', { key: ' ', code: 'Space' });
  btn.dispatchEvent('keydown', { key: 'Enter', code: 'Enter' });
  assert.equal(btn._heldKeys.size, 2);
  assert.equal(btn.classList.contains('active'), true);
  assert.equal(app.input.heldSources.get('horn')?.size, 2);

  // Release Space
  btn.dispatchEvent('keyup', { key: ' ', code: 'Space' });
  assert.equal(btn._heldKeys.size, 1);
  assert.equal(btn._heldKeys.has('Enter'), true);
  assert.equal(btn.classList.contains('active'), true, 'Button must REMAIN active because Enter is still held');
  assert.equal(app.input.heldSources.get('horn')?.size, 1);
  assert.ok(app.input.snapshot().extended & (1n << 25n), 'Horn must remain active while Enter is held');

  // Release Enter
  btn.dispatchEvent('keyup', { key: 'Enter', code: 'Enter' });
  assert.equal(btn._heldKeys.size, 0);
  assert.equal(btn.classList.contains('active'), false);
  assert.equal(app.input.snapshot().extended & (1n << 25n), 0n);
});

test('Step 3.8.E: Two distinct controls mapped to same action -> releasing one does not extinguish input on the other', () => {
  const { app } = createTestAppHarness();
  const btn1 = createMockButton('horn', 'horn-quick');
  const btn2 = createMockButton('horn', 'horn-wheel');
  app.buttons.push(btn1, btn2);
  app.bindButton(btn1, 'horn');
  app.bindButton(btn2, 'horn');

  // Both controls press horn
  btn1.dispatchEvent('keydown', { key: 'Enter', code: 'Enter' });
  btn2.dispatchEvent('keydown', { key: 'Enter', code: 'Enter' });

  assert.equal(btn1.classList.contains('active'), true);
  assert.equal(btn2.classList.contains('active'), true);
  assert.equal(app.input.heldSources.get('horn')?.size, 2);

  // Control 1 blurs / releases
  btn1.dispatchEvent('blur', {});
  assert.equal(btn1.classList.contains('active'), false);
  assert.equal(btn2.classList.contains('active'), true, 'Control 2 must stay active');
  assert.equal(app.input.heldSources.get('horn')?.size, 1);
  assert.ok(app.input.snapshot().extended & (1n << 25n), 'Horn must stay asserted in snapshot');

  // Control 2 releases
  btn2.dispatchEvent('blur', {});
  assert.equal(btn2.classList.contains('active'), false);
  assert.equal(app.input.heldSources.get('horn'), undefined);
});

test('Step 3.8.F: Keydown auto-repeat does not generate extra pulses', () => {
  const { app } = createTestAppHarness({ mode: 'MT' });
  app.input.setMode('MT');
  const btn = createMockButton('shiftUp');
  app.buttons.push(btn);
  app.bindButton(btn, 'shiftUp');

  // Initial keydown
  btn.dispatchEvent('keydown', { key: ' ', code: 'Space', repeat: false });
  assert.equal(app.input.currentPulse.has('shiftUp'), true);
  assert.equal(app.input.pulseQueues.get('shiftUp')?.length || 0, 0);

  // Subsequent OS auto-repeats with repeat = true
  btn.dispatchEvent('keydown', { key: ' ', code: 'Space', repeat: true });
  btn.dispatchEvent('keydown', { key: ' ', code: 'Space', repeat: true });
  btn.dispatchEvent('keydown', { key: ' ', code: 'Space', repeat: true });

  // Verify no duplicate pulses are enqueued
  assert.equal(app.input.pulseQueues.get('shiftUp')?.length || 0, 0, 'Auto-repeat must NOT enqueue extra pulses');

  // Release Space
  btn.dispatchEvent('keyup', { key: ' ', code: 'Space' });
});

test('Step 3.8.G: Pause/resume, background, and late events do not resurrect old inputs', () => {
  const { app } = createTestAppHarness();
  const btn = createMockButton('horn');
  app.buttons.push(btn);
  app.bindButton(btn, 'horn');

  // User presses touch and key
  btn.dispatchEvent('pointerdown', { pointerId: 99 });
  btn.dispatchEvent('keydown', { key: 'Enter', code: 'Enter' });

  // App is paused / backgrounded
  app.pause();
  assert.equal(app.armed, false);
  assert.equal(btn.classList.contains('active'), false);
  assert.equal(app.input.snapshot().extended, 0n);

  // Resume app
  app.armed = true;

  // Late pointermove and pointerup from the previous session arrive
  btn.dispatchEvent('pointermove', { pointerId: 99 });
  btn.dispatchEvent('pointerup', { pointerId: 99 });
  btn.dispatchEvent('keyup', { key: 'Enter', code: 'Enter' });

  // Input must remain strictly neutral; no resurrection
  assert.equal(btn.classList.contains('active'), false);
  assert.equal(app.input.snapshot().extended, 0n);
  assert.equal(app.input.snapshot().buttons, 0);
});

test('Step 3.8.H: Two rapid taps through sendStateFrame, skipped frame, stale ACK, and sequence wrap', () => {
  const origNow = performance.now;
  let simulatedTime = 1000;
  performance.now = () => simulatedTime;
  try {
    const { app, sentFrames } = createTestAppHarness({ mode: 'MT' });
    app.input.setMode('MT');
    const btn = createMockButton('shiftUp');
    app.buttons.push(btn);
    app.bindButton(btn, 'shiftUp');

    // 1. Tap 1 occurs at t=1000
    btn.dispatchEvent('keydown', { key: 'Enter', code: 'Enter' });
    btn.dispatchEvent('keyup', { key: 'Enter', code: 'Enter' });

    // Send production state frame 1
    app.sendStateFrame();
    assert.ok(sentFrames.length >= 3, 'encodeSnapshot emits 3 frames per state');
    const stateFrame1 = sentFrames[sentFrames.length - 1];
    const decoded1 = decodeFrame(stateFrame1);
    assert.ok((decoded1.buttons & BUTTONS.SHIFT_UP) !== 0, 'Frame 1 must contain SHIFT_UP pulse');

    // Acknowledge frame 1
    const seq1 = app.sequence;
    const snap1 = app.pending.get(seq1);
    app.input.acknowledge(snap1);

    // Advance time past pulse duration (60ms) into GAP state: t = 1070
    simulatedTime = 1070;
    app.input.snapshot(simulatedTime); // transitions pulse 1 to GAP; gapUntil = 1070 + 50 = 1120

    // 2. Simulate backpressure: bufferedAmount > 4096 causes sendStateFrame to be skipped!
    app.ws.bufferedAmount = 5000;
    const framesBeforeSkip = sentFrames.length;

    // Tap 2 occurs while frames are being skipped! (t = 1080)
    simulatedTime = 1080;
    btn.dispatchEvent('keydown', { key: 'Enter', code: 'Enter' });
    btn.dispatchEvent('keyup', { key: 'Enter', code: 'Enter' });

    // Frame is attempted but skipped due to backpressure
    app.sendStateFrame();
    assert.equal(sentFrames.length, framesBeforeSkip, 'Frame must be skipped when bufferedAmount is high');

    // 3. Clear backpressure
    app.ws.bufferedAmount = 0;

    // Advance time past gapUntil: t = 1130 (> 1120)
    simulatedTime = 1130;

    // Next sendStateFrame: MUST transmit the GAP release frame (SHIFT_UP = 0) before Tap 2 can be sent!
    // Because requireTransmittedGap is true, GAP cannot complete until a gap frame is actually transmitted!
    app.sendStateFrame();
    const releaseStateFrame = sentFrames[sentFrames.length - 1];
    const decodedRelease = decodeFrame(releaseStateFrame);
    assert.equal(decodedRelease.buttons & BUTTONS.SHIFT_UP, 0, 'Release frame (gap, bit=0) must be transmitted before next pulse');

    // Advance time slightly: next sendStateFrame transmits Tap 2 (SHIFT_UP = 1)
    simulatedTime = 1140;
    app.sendStateFrame();
    const stateFrame2 = sentFrames[sentFrames.length - 1];
    const decoded2 = decodeFrame(stateFrame2);
    assert.ok((decoded2.buttons & BUTTONS.SHIFT_UP) !== 0, 'Tap 2 must be transmitted with SHIFT_UP asserted');

    // Wire transmission sequence strictly verified: Press 1 (1) -> Gap (0) -> Press 2 (1)!
    assert.notEqual(decoded1.buttons & BUTTONS.SHIFT_UP, 0);
    assert.equal(decodedRelease.buttons & BUTTONS.SHIFT_UP, 0);
    assert.notEqual(decoded2.buttons & BUTTONS.SHIFT_UP, 0);

    // 4. Test sequence wrap 255 -> 0
    app.sequence = 255;
    app.sendStateFrame();
    assert.equal(app.sequence, 0, 'Sequence must wrap from 255 to 0');
    assert.ok(app.pending.has(0), 'Pending map must correctly record sequence 0');

    // 5. Test stale ACK from a different session epoch
    const staleSnapshot = { sequence: 0, sessionEpoch: 999, pulseIds: [9999] };
    app.input.acknowledge(staleSnapshot);
    assert.ok(!app.input.acknowledgedPulseIds.has(9999), 'Stale cross-session ACK must be rejected');

    // 6. Test pending FIFO bound limit: simulate 70 frames without ACK
    for (let i = 0; i < 70; i++) {
      app.sendStateFrame();
    }
    assert.ok(app.pending.size <= 64, `Pending map size must be bounded (actual: ${app.pending.size})`);
  } finally {
    performance.now = origNow;
  }
});
