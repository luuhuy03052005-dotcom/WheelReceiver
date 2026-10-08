import test from 'node:test';
import assert from 'node:assert/strict';
import { H_SLOTS, nearestHSlot, HPatternShifter } from '../../apps/controller-web/public/src/h-shifter.js';
import { InputState } from '../../packages/profiles/src/input-state.js';
import { ACTIONS, createProfile, supportsAction } from '../../packages/profiles/src/index.js';
import { encodeSnapshot, decodeExtensions, decodeFrame, BUTTONS } from '../../packages/protocol/src/index.js';
import { ControllerApp } from '../../apps/controller-web/public/src/app.js';

// Mock DOM helper for H-shifter unit and integration testing
function createMockHShifterDOM() {
  const listeners = {};
  const classes = new Set();
  const capturedPointers = new Set();

  function createMockElement(id = '', tag = 'DIV') {
    const elClasses = new Set();
    const elListeners = {};
    const styles = {};
    const attrs = {};
    const childEls = [];

    const el = {
      tagName: tag,
      id,
      dataset: {},
      disabled: false,
      hidden: false,
      textContent: '',
      style: {
        set left(v) { styles.left = v; },
        get left() { return styles.left; },
        set top(v) { styles.top = v; },
        get top() { return styles.top; }
      },
      classList: {
        add: c => elClasses.add(c),
        remove: c => elClasses.delete(c),
        toggle: (c, force) => {
          if (force === undefined) {
            if (elClasses.has(c)) elClasses.delete(c); else elClasses.add(c);
          } else if (force) elClasses.add(c); else elClasses.delete(c);
        },
        contains: c => elClasses.has(c)
      },
      setAttribute(k, v) { attrs[k] = String(v); },
      getAttribute(k) { return attrs[k]; },
      addEventListener(name, fn) {
        elListeners[name] = elListeners[name] || [];
        elListeners[name].push(fn);
      },
      dispatchEvent(name, ev = {}) {
        if (!ev.preventDefault) ev.preventDefault = () => {};
        for (const fn of elListeners[name] || []) fn(ev);
      },
      setPointerCapture(id) { capturedPointers.add(id); },
      releasePointerCapture(id) { capturedPointers.delete(id); },
      hasPointerCapture(id) { return capturedPointers.has(id); },
      querySelector(selector) {
        if (selector === '#h-knob' || selector === '.h-knob') return knob;
        if (selector === '.toggle-txt') return this._toggleTxt || null;
        return null;
      },
      querySelectorAll(selector) {
        if (selector === '[data-h-gear]') return buttons;
        return [];
      },
      getBoundingClientRect() {
        return { left: 100, top: 100, width: 200, height: 200 };
      }
    };
    return el;
  }

  const knob = createMockElement('h-knob', 'DIV');
  knob.textContent = 'N';

  const buttons = H_SLOTS.map(slot => {
    const btn = createMockElement('', 'BUTTON');
    btn.dataset.hGear = slot.id;
    btn.textContent = slot.label;
    return btn;
  });

  const stage = createMockElement('h-shifter', 'DIV');
  const togglesContainer = createMockElement('h-shifter-truck-toggles', 'DIV');
  const rangeBtn = createMockElement('h-range-toggle', 'BUTTON');
  rangeBtn._toggleTxt = createMockElement('', 'SPAN');
  rangeBtn._toggleTxt.textContent = 'RANGE · 1-6';
  const splitBtn = createMockElement('h-split-toggle', 'BUTTON');
  splitBtn._toggleTxt = createMockElement('', 'SPAN');
  splitBtn._toggleTxt.textContent = 'SPLIT · L';

  const gearDisplay = createMockElement('gear-display', 'DIV');
  gearDisplay.textContent = 'N';

  // Global document mocks for h-shifter elements
  const originalGetElementById = globalThis.document?.getElementById;
  globalThis.document = globalThis.document || {};
  globalThis.document.getElementById = id => {
    if (id === 'h-shifter') return stage;
    if (id === 'h-knob') return knob;
    if (id === 'h-shifter-truck-toggles') return togglesContainer;
    if (id === 'h-range-toggle') return rangeBtn;
    if (id === 'h-split-toggle') return splitBtn;
    if (id === 'gear-display') return gearDisplay;
    if (id === 'cockpit-main') return null;
    return null;
  };

  return {
    stage,
    knob,
    buttons,
    togglesContainer,
    rangeBtn,
    splitBtn,
    gearDisplay,
    restore() {
      if (originalGetElementById) globalThis.document.getElementById = originalGetElementById;
    }
  };
}

function createHShifterAppHarness(options = {}) {
  const dom = createMockHShifterDOM();
  const input = new InputState();
  input.requireTransmittedGap = true;
  input.setMode('H');

  const sentFrames = [];
  const app = {
    armed: true,
    input,
    ws: {
      readyState: 1,
      bufferedAmount: 0,
      send(f) { sentFrames.push(new Uint8Array(f)); }
    },
    sequence: 0,
    sessionEpoch: input.sessionEpoch,
    pending: new Map(),
    profile: createProfile(options.gameId || 'ets2', { mode: 'H' }),
    capabilities: options.capabilities || { keyboard: true, buttons: 70 },
    stats: { count: 0 },
    travel: { throttle: 0, brake: 0, clutch: 0 },
    wheel: { currentAngle: 0, resetToCenter() {} },
    sendStateFrame: ControllerApp.prototype.sendStateFrame,
    reset() {
      this.input.reset();
      this.sessionEpoch = this.input.sessionEpoch;
      this.pending.clear();
      this.hShifter.reset(false);
      dom.gearDisplay.textContent = 'N';
    },
    renderControls() {
      const isH = this.profile.mode === 'H';
      dom.gearDisplay.textContent = this.hShifter.getGearLabel(this.input.gear);
      this.hShifter.setAvailability(
        H_SLOTS.filter(slot => supportsAction(ACTIONS.find(a => a.id === slot.id), this.profile, this.capabilities)).map(s => s.id)
      );
      this.hShifter.setEnabled(this.armed && isH);
      this.hShifter.updateTruckToggles(this.profile, this.capabilities);
      if (isH) this.hShifter.sync(this.input.gear);
    }
  };

  globalThis.window = globalThis.window || {};
  globalThis.window.app = app;

  const hShifter = new HPatternShifter(dom.stage, gear => {
    if (!app.armed) return;
    app.input.setGear(gear);
    dom.gearDisplay.textContent = hShifter.getGearLabel(gear);
  }, { input, threshold: 20 });

  app.hShifter = hShifter;
  hShifter.setEnabled(true);
  hShifter.updateTruckToggles(app.profile, app.capabilities);

  return { app, dom, hShifter, sentFrames, input };
}

test('Step 4.A: Commit gear1 -> render/status lại cùng cấu hình: knob, label và snapshot vẫn gear1', () => {
  const { app, dom, hShifter, input } = createHShifterAppHarness();
  try {
    // 1. Commit gear1 via button or knob
    hShifter.select('gear1', true);
    assert.equal(hShifter.gear, 'gear1');
    assert.equal(input.gear, 'gear1');
    assert.equal(dom.knob.textContent, '1');
    assert.equal(dom.gearDisplay.textContent, '1');

    // Production snapshot contains gear1 (bit 0 in extended)
    const snap1 = input.snapshot();
    assert.ok((snap1.extended & (1n << 0n)) !== 0n, 'gear1 bit 0 must be asserted');

    // 2. Re-render controls with identical profile/revision
    app.renderControls();

    // Knob, label and snapshot MUST NOT reset to N!
    assert.equal(hShifter.gear, 'gear1', 'Knob gear must remain gear1 after re-render');
    assert.equal(input.gear, 'gear1', 'InputState gear must remain gear1 after re-render');
    assert.equal(dom.knob.textContent, '1', 'Knob label must remain 1');
    assert.equal(dom.gearDisplay.textContent, '1', 'gear-display must remain 1');

    const snap2 = input.snapshot();
    assert.ok((snap2.extended & (1n << 0n)) !== 0n, 'gear1 bit 0 must remain asserted after render');
  } finally {
    dom.restore();
  }
});

test('Step 4.B: Drag preview qua gear2 -> cancel: không có callback/frame commit gear2', () => {
  const { app, dom, hShifter, input, sentFrames } = createHShifterAppHarness();
  try {
    hShifter.select('gear1', true);
    assert.equal(hShifter.gear, 'gear1');

    let callbackCount = 0;
    hShifter.onChange = gear => {
      callbackCount++;
      input.setGear(gear);
    };

    // 1. Start drag on knob (pointerdown)
    dom.knob.dispatchEvent('pointerdown', { pointerId: 1, clientX: 126, clientY: 140 });
    assert.equal(hShifter.pointer, 1);
    assert.equal(dom.knob.classList.contains('dragging'), true);

    // 2. Move over gear2 (13, 80) => clientX: 126, clientY: 260
    dom.knob.dispatchEvent('pointermove', { pointerId: 1, clientX: 126, clientY: 260 });
    assert.equal(hShifter.previewGear, 'gear2', 'Preview must indicate candidate gear2');
    assert.equal(dom.knob.textContent, '2', 'Knob text reflects candidate preview');

    // CRITICAL: No commit callback, InputState.gear is STILL gear1!
    assert.equal(callbackCount, 0, 'pointermove MUST NOT trigger onChange callback');
    assert.equal(hShifter.gear, 'gear1', 'Official committed gear must remain gear1 during drag');
    assert.equal(input.gear, 'gear1', 'Model gear must remain gear1 during drag');

    // Wire frame during drag still transmits gear1 (bit 0), NEVER gear2 (bit 1)
    app.sendStateFrame();
    const wireFrame = sentFrames[sentFrames.length - 1];
    const decodedExt = decodeExtensions([sentFrames[sentFrames.length - 3], sentFrames[sentFrames.length - 2]]);
    assert.ok((decodedExt.extended & (1n << 0n)) !== 0n, 'gear1 bit must be in transmitted frame');
    assert.equal(decodedExt.extended & (1n << 1n), 0n, 'gear2 bit must NOT be in transmitted frame');

    // 3. Drag cancelled (pointercancel / lostpointercapture)
    dom.knob.dispatchEvent('pointercancel', { pointerId: 1 });

    // Must cleanly revert to previously committed gear (gear1)
    assert.equal(callbackCount, 0, 'Cancel must not emit gear2 or extra callback');
    assert.equal(hShifter.pointer, null);
    assert.equal(hShifter.gear, 'gear1', 'Gear must revert to gear1');
    assert.equal(hShifter.previewGear, null);
    assert.equal(dom.knob.textContent, '1', 'Knob label must revert to 1');
    assert.equal(input.gear, 'gear1');
  } finally {
    dom.restore();
  }
});

test('Step 4.C: Pointerup vào slot hợp lệ: commit đúng một selection', () => {
  const { dom, hShifter, input } = createHShifterAppHarness();
  try {
    let committed = null;
    let callCount = 0;
    hShifter.onChange = gear => {
      callCount++;
      committed = gear;
      input.setGear(gear);
    };

    // Drag to slot 3: (41, 20) => clientX: 182, clientY: 140
    dom.knob.dispatchEvent('pointerdown', { pointerId: 1, clientX: 182, clientY: 200 });
    dom.knob.dispatchEvent('pointermove', { pointerId: 1, clientX: 182, clientY: 140 });
    dom.knob.dispatchEvent('pointerup', { pointerId: 1, clientX: 182, clientY: 140 });

    assert.equal(callCount, 1, 'pointerup must trigger onChange exactly once');
    assert.equal(committed, 'gear3');
    assert.equal(hShifter.gear, 'gear3');
    assert.equal(input.gear, 'gear3');
    assert.equal(dom.knob.textContent, '3');

    const snap = input.snapshot();
    assert.ok((snap.extended & (1n << 2n)) !== 0n, 'gear3 bit 2 must be asserted');
    assert.equal(snap.extended & (1n << 0n), 0n, 'gear1 bit 0 must be 0');
  } finally {
    dom.restore();
  }
});

test('Step 4.D: Pointerup ngoài vùng hợp lệ, rect zero/invalid hoặc resize giữa drag: không chọn số ngoài ý muốn', () => {
  const { dom, hShifter, input } = createHShifterAppHarness();
  try {
    hShifter.select('gear3', true);
    assert.equal(hShifter.gear, 'gear3');

    // 1. Drag far outside stage: clientX: 2000, clientY: 2000
    dom.knob.dispatchEvent('pointerdown', { pointerId: 1, clientX: 182, clientY: 140 });
    dom.knob.dispatchEvent('pointermove', { pointerId: 1, clientX: 2000, clientY: 2000 });
    dom.knob.dispatchEvent('pointerup', { pointerId: 1, clientX: 2000, clientY: 2000 });

    // Out of bounds release: reverts to gear3! Does NOT engage reverse or edge slot!
    assert.equal(hShifter.gear, 'gear3', 'Must not engage an edge slot when released out of bounds');
    assert.equal(dom.knob.textContent, '3');

    // 2. Stage has zero/invalid rect
    dom.stage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0 });
    dom.knob.dispatchEvent('pointerdown', { pointerId: 2, clientX: 182, clientY: 140 });
    dom.knob.dispatchEvent('pointermove', { pointerId: 2, clientX: 182, clientY: 140 });
    dom.knob.dispatchEvent('pointerup', { pointerId: 2, clientX: 182, clientY: 140 });

    assert.equal(hShifter.gear, 'gear3', 'Zero rect must not engage a slot');
    dom.stage.getBoundingClientRect = () => ({ left: 100, top: 100, width: 200, height: 200 });

    // 3. Geometry resize mid-drag
    dom.knob.dispatchEvent('pointerdown', { pointerId: 3, clientX: 182, clientY: 140 });
    dom.knob.dispatchEvent('pointermove', { pointerId: 3, clientX: 182, clientY: 260 }); // moving towards gear4
    hShifter.cancelDrag(); // simulates resize / orientationchange

    assert.equal(hShifter.pointer, null);
    assert.equal(hShifter.gear, 'gear3', 'Resize mid-drag must cancel cleanly to gear3');
    // Subsequent late up event is ignored
    dom.knob.dispatchEvent('pointerup', { pointerId: 3, clientX: 182, clientY: 260 });
    assert.equal(hShifter.gear, 'gear3');
  } finally {
    dom.restore();
  }
});

test('Step 4.E: Pointer phụ, lost capture, reset và event đến muộn: không giành quyền hoặc phục hồi drag', () => {
  const { app, dom, hShifter } = createHShifterAppHarness();
  try {
    hShifter.select('gear1', true);

    // Primary pointer 1 begins drag
    dom.knob.dispatchEvent('pointerdown', { pointerId: 1, clientX: 126, clientY: 140 });
    assert.equal(hShifter.pointer, 1);

    // Secondary pointer 2 attempts pointerdown, pointermove, pointerup
    dom.knob.dispatchEvent('pointerdown', { pointerId: 2, clientX: 182, clientY: 140 });
    assert.equal(hShifter.pointer, 1, 'Secondary pointer must not steal ownership');
    dom.knob.dispatchEvent('pointermove', { pointerId: 2, clientX: 182, clientY: 140 });
    dom.knob.dispatchEvent('pointerup', { pointerId: 2, clientX: 182, clientY: 140 });
    assert.equal(hShifter.pointer, 1, 'Secondary pointer up must not release owner');

    // Primary pointer receives lostpointercapture
    dom.knob.dispatchEvent('lostpointercapture', { pointerId: 1 });
    assert.equal(hShifter.pointer, null, 'lostpointercapture must release owner');
    assert.equal(hShifter.gear, 'gear1');

    // App reset
    app.reset();
    assert.equal(hShifter.gear, null, 'Reset must return gear to neutral');
    assert.equal(dom.knob.textContent, 'N');

    // Late event from pointer 1 arrives after reset
    dom.knob.dispatchEvent('pointerup', { pointerId: 1, clientX: 126, clientY: 140 });
    assert.equal(hShifter.gear, null, 'Late event must not revive old drag or select gear');
  } finally {
    dom.restore();
  }
});

test('Step 4.F: Chọn số qua knob và control trực tiếp khác: tối đa một direct gear', () => {
  const { dom, hShifter, input } = createHShifterAppHarness();
  try {
    // 1. Knob commits gear1
    hShifter.select('gear1', true);
    assert.equal(input.gear, 'gear1');
    let snap = input.snapshot();
    assert.ok((snap.extended & (1n << 0n)) !== 0n, 'gear1 set');
    assert.equal(snap.extended & (1n << 1n), 0n);

    // 2. Direct button / external control selects gear2
    input.press('gear2', 'btn:gear2');
    assert.equal(input.gear, 'gear2');
    snap = input.snapshot();
    assert.equal(snap.extended & (1n << 0n), 0n, 'gear1 must be cleared');
    assert.ok((snap.extended & (1n << 1n)) !== 0n, 'gear2 must be set');

    // Count direct gear bits (bits 0-6): exactly 1 bit
    let count = 0;
    for (let b = 0n; b <= 6n; b++) {
      if ((snap.extended & (1n << b)) !== 0n) count++;
    }
    assert.equal(count, 1, 'Exactly one direct gear bit may be set');

    // 3. Clear gear to neutral
    input.setGear(null);
    snap = input.snapshot();
    count = 0;
    for (let b = 0n; b <= 6n; b++) {
      if ((snap.extended & (1n << b)) !== 0n) count++;
    }
    assert.equal(count, 0, 'Neutral must have 0 direct gear bits');
  } finally {
    dom.restore();
  }
});

test('Step 4.G: Safety reset và đổi H sang AT/MT/MTC: model/view/output theo đúng transition đã công bố', () => {
  const { app, dom, hShifter, input } = createHShifterAppHarness();
  try {
    hShifter.select('gear4', true);
    assert.equal(input.gear, 'gear4');

    // 1. Safety reset
    app.reset();
    assert.equal(hShifter.gear, null);
    assert.equal(input.gear, null);
    assert.equal(dom.knob.textContent, 'N');
    assert.equal(dom.gearDisplay.textContent, 'N');
    let snap = input.snapshot();
    assert.equal(snap.extended, 0n, 'Reset output must be completely neutral');
    assert.equal(snap.buttons, 0);

    // 2. Switch H -> AT
    hShifter.select('gear2', true);
    input.setMode('AT');
    hShifter.setEnabled(false);
    assert.equal(input.gear, null, 'Switch to AT must purge manual gears');
    snap = input.snapshot();
    assert.equal(snap.extended & 0x3Fn, 0n, 'AT must clear all manual gear bits');
    assert.equal(dom.stage.classList.contains('disabled'), true, 'H-shifter disabled in AT');

    // 3. Switch H -> MT
    input.setMode('MT');
    snap = input.snapshot();
    assert.equal(snap.extended & 0x3FFn, 0n, 'MT must clear all direct gear bits');
  } finally {
    dom.restore();
  }
});

test('Step 4.H: Gear mất availability: model và view không lệch', () => {
  const { dom, hShifter, input } = createHShifterAppHarness();
  try {
    // Select gear6 (slot 6)
    hShifter.select('gear6', true);
    assert.equal(hShifter.gear, 'gear6');
    assert.equal(input.gear, 'gear6');

    // Profile updates: game only supports 4-speed (gear5 and gear6 not available)
    hShifter.setAvailability(['gear1', 'gear2', 'gear3', 'gear4', 'reverse']);

    // Button 6 is disabled
    const btn6 = dom.buttons.find(b => b.dataset.hGear === 'gear6');
    assert.equal(btn6.disabled, true);

    // Model and view consistently transition to Neutral
    assert.equal(hShifter.gear, null, 'Unavailable gear must transition to neutral');
    assert.equal(input.gear, null, 'InputState gear must transition to neutral');
    assert.equal(dom.knob.textContent, 'N');
    assert.equal(dom.gearDisplay.textContent, 'N');
  } finally {
    dom.restore();
  }
});

test('Step 4.I: RANGE/SPLIT nhấn liên tiếp, source press/release khớp, không tích lũy nguồn hoặc phát lại sau reset', () => {
  const { app, dom, hShifter, input } = createHShifterAppHarness({ gameId: 'ets2' });
  try {
    // 1. Rapid click RANGE toggle: LO -> HI
    dom.rangeBtn.dispatchEvent('click');
    assert.equal(hShifter.rangeHigh, true);
    assert.equal(dom.rangeBtn._toggleTxt.textContent, 'RANGE · HI (Yêu cầu)');
    assert.equal(input.heldSources.get('range')?.size || 0, 0, 'Source must be released immediately after pulse enqueue');

    // Pulse is enqueued in InputState
    let snap = input.snapshot();
    assert.ok((snap.extended & (1n << 48n)) !== 0n, 'Range bit 48 must be asserted');

    // 2. Click RANGE toggle again: HI -> LO
    dom.rangeBtn.dispatchEvent('click');
    assert.equal(hShifter.rangeHigh, false);
    assert.equal(dom.rangeBtn._toggleTxt.textContent, 'RANGE · LO (Yêu cầu)');

    // 3. Click SPLIT toggle: LO -> HI
    dom.splitBtn.dispatchEvent('click');
    assert.equal(hShifter.splitHigh, true);
    assert.equal(dom.splitBtn._toggleTxt.textContent, 'SPLIT · HI (Yêu cầu)');
    assert.equal(input.heldSources.get('splitter')?.size || 0, 0, 'Splitter source released');

    // 4. App reset: clears toggles and queues
    app.reset();
    assert.equal(hShifter.rangeHigh, false);
    assert.equal(hShifter.splitHigh, false);
    assert.equal(dom.rangeBtn._toggleTxt.textContent, 'RANGE · LO (Yêu cầu)');
    assert.equal(dom.splitBtn._toggleTxt.textContent, 'SPLIT · LO (Yêu cầu)');
    snap = input.snapshot();
    assert.equal(snap.extended & (1n << 48n), 0n, 'Range bit cleared after reset');
    assert.equal(snap.extended & (1n << 49n), 0n, 'Splitter bit cleared after reset');
  } finally {
    dom.restore();
  }
});

test('Step 4.J: Profile không hỗ trợ truck actions: RANGE/SPLIT không phát lệnh', () => {
  const { dom, hShifter, input } = createHShifterAppHarness({ gameId: 'forza' });
  try {
    // Forza has groups ['cabin', 'game'] without 'truck'
    assert.equal(hShifter.truckActionsSupported, false);
    assert.equal(dom.togglesContainer.hidden, true);
    assert.equal(dom.rangeBtn.disabled, true);
    assert.equal(dom.splitBtn.disabled, true);

    // Clicking RANGE or SPLIT must NOT emit pulses
    dom.rangeBtn.dispatchEvent('click');
    dom.splitBtn.dispatchEvent('click');

    assert.equal(hShifter.rangeHigh, false);
    assert.equal(hShifter.splitHigh, false);
    assert.equal(input.currentPulse.size, 0);
    assert.equal(input.pulseQueues.size, 0);
    const snap = input.snapshot();
    assert.equal(snap.extended & (1n << 48n), 0n, 'Range bit must NOT be set for non-truck profile');
    assert.equal(snap.extended & (1n << 49n), 0n, 'Splitter bit must NOT be set for non-truck profile');
  } finally {
    dom.restore();
  }
});

test('Step 4.K: Gear6 vẫn tồn tại; RANGE không tự biến nhãn thành số game đã xác nhận', () => {
  const { dom, hShifter } = createHShifterAppHarness({ gameId: 'ets2' });
  try {
    // Toggle RANGE to HI
    dom.rangeBtn.dispatchEvent('click');
    assert.equal(hShifter.rangeHigh, true);

    // Select gear6
    hShifter.select('gear6', true);
    assert.equal(hShifter.gear, 'gear6');

    // Label of gear6 must ALWAYS remain '6', NEVER '12'!
    assert.equal(hShifter.getGearLabel('gear6'), '6', 'getGearLabel must return 6, not 12');
    assert.equal(dom.knob.textContent, '6', 'Knob text must be 6, not 12');
    assert.equal(dom.gearDisplay.textContent, '6', 'gear-display must be 6, not 12');

    // Slot button 6 must remain labeled '6'
    const btn6 = dom.buttons.find(b => b.dataset.hGear === 'gear6');
    assert.equal(btn6.textContent, '6', 'Slot button text must stay 6, not change to 12');
    assert.equal(dom.rangeBtn._toggleTxt.textContent, 'RANGE · HI (Yêu cầu)');
  } finally {
    dom.restore();
  }
});
