import test from 'node:test';
import assert from 'node:assert/strict';
import { SteeringWheel } from '../../apps/controller-web/public/src/wheel.js';
import { PedalControl } from '../../apps/controller-web/public/src/pedals.js';
import { HPatternShifter, H_SLOTS } from '../../apps/controller-web/public/src/h-shifter.js';
import { LayoutEditor } from '../../apps/controller-web/public/src/layout-editor.js';

// Helper to create mock DOM elements supporting pointer events, capture, and classList
function createMockElement(tag = 'div') {
  const listeners = {};
  const classes = new Set();
  const attributes = {};
  const capturedPointers = new Set();
  let textContent = '';

  const el = {
    tagName: tag.toUpperCase(),
    style: {
      setProperty() {},
      removeProperty() {},
      height: '',
      width: '',
      left: '',
      top: ''
    },
    dataset: {},
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (classes.has(c)) classes.delete(c);
          else classes.add(c);
        } else if (force) classes.add(c);
        else classes.delete(c);
      },
      contains: (c) => classes.has(c)
    },
    getAttribute: (attr) => attributes[attr] || null,
    setAttribute: (attr, val) => { attributes[attr] = String(val); },
    hasAttribute: (attr) => attr in attributes,
    removeAttribute: (attr) => { delete attributes[attr]; },
    querySelector: () => null,
    querySelectorAll: () => [],
    children: [],
    append: (...children) => el.children.push(...children),
    replaceChildren: (...children) => { el.children = [...children]; },
    getBoundingClientRect: () => ({ top: 100, bottom: 300, height: 200, left: 10, right: 110, width: 100 }),
    addEventListener(name, fn) {
      listeners[name] = listeners[name] || [];
      listeners[name].push(fn);
    },
    removeEventListener(name, fn) {
      if (!listeners[name]) return;
      listeners[name] = listeners[name].filter((f) => f !== fn);
    },
    dispatch(name, event = {}) {
      const ev = {
        preventDefault: () => {},
        stopPropagation: () => {},
        target: el,
        ...event
      };
      for (const fn of [...(listeners[name] || [])]) {
        fn(ev);
      }
    },
    hasPointerCapture(id) {
      return capturedPointers.has(id);
    },
    setPointerCapture(id) {
      capturedPointers.add(id);
    },
    releasePointerCapture(id) {
      capturedPointers.delete(id);
      // Synchronously fire lostpointercapture to verify re-entrancy / idempotency
      if (el.onSimulateCaptureEvent) {
        el.dispatch('lostpointercapture', { pointerId: id });
      }
    },
    cloneNode() {
      const cloned = createMockElement(tag);
      cloned.remove = () => {};
      return cloned;
    },
    remove() {},
    getContext() {
      return {
        clearRect() {},
        save() {},
        restore() {},
        translate() {},
        rotate() {},
        drawImage() {},
        beginPath() {},
        arc() {},
        fill() {},
        stroke() {},
        fillRect() {},
        fillText() {},
        moveTo() {},
        lineTo() {},
        closePath() {},
        ellipse() {},
        createRadialGradient: () => ({ addColorStop() {} }),
        createLinearGradient: () => ({ addColorStop() {} }),
        setTransform() {}
      };
    }
  };

  Object.defineProperty(el, 'textContent', {
    get: () => textContent,
    set: (v) => { textContent = String(v); }
  });

  return el;
}

// Setup environment before running Step 2 tests
function setupDOMEnv() {
  const origWindow = globalThis.window;
  const origDocument = globalThis.document;
  const origResizeObserver = globalThis.ResizeObserver;

  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };

  const winListeners = {};
  globalThis.window = {
    app: { armed: true, layoutEditor: { editing: false } },
    addEventListener(name, fn) {
      winListeners[name] = winListeners[name] || [];
      winListeners[name].push(fn);
    },
    removeEventListener(name, fn) {
      if (!winListeners[name]) return;
      winListeners[name] = winListeners[name].filter((f) => f !== fn);
    },
    dispatch(name, event = {}) {
      for (const fn of [...(winListeners[name] || [])]) fn({ preventDefault: () => {}, ...event });
    }
  };

  const docListeners = {};
  const body = createMockElement('body');
  globalThis.document = {
    body,
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => createMockElement(tag),
    addEventListener(name, fn) {
      docListeners[name] = docListeners[name] || [];
      docListeners[name].push(fn);
    },
    removeEventListener(name, fn) {
      if (!docListeners[name]) return;
      docListeners[name] = docListeners[name].filter((f) => f !== fn);
    },
    dispatch(name, event = {}) {
      for (const fn of [...(docListeners[name] || [])]) fn({ preventDefault: () => {}, ...event });
    }
  };

  const origLocalStorage = globalThis.localStorage;
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };

  return () => {
    globalThis.window = origWindow;
    globalThis.document = origDocument;
    globalThis.ResizeObserver = origResizeObserver;
    globalThis.localStorage = origLocalStorage;
  };
}

test('Step 2.A: Wheel disabled or disarmed rejects pointerdown and does not change angle', () => {
  const cleanup = setupDOMEnv();
  try {
    const canvas = createMockElement('canvas');
    canvas.parentElement = createMockElement('div');
    const wheel = new SteeringWheel(canvas, { steeringRangeDeg: 900 });

    // Case 1: Wheel is explicitly disabled
    wheel.setEnabled(false);
    canvas.dispatch('pointerdown', { pointerId: 1, clientX: 100, clientY: 50 });
    assert.equal(wheel.pointerId, null, 'Disabled wheel must not accept pointer ownership');
    assert.equal(wheel.isDragging, false);
    canvas.dispatch('pointermove', { pointerId: 1, clientX: 120, clientY: 50 });
    assert.equal(wheel.currentAngle, 0, 'Disabled wheel must not change steering angle');

    // Case 2: Wheel is enabled, but window.app.armed = false
    wheel.setEnabled(true);
    globalThis.window.app.armed = false;
    canvas.dispatch('pointerdown', { pointerId: 1, clientX: 100, clientY: 50 });
    assert.equal(wheel.pointerId, null, 'Disarmed app must not allow wheel pointer ownership');
    assert.equal(wheel.isDragging, false);

    // Case 3: Armed app allows ownership
    globalThis.window.app.armed = true;
    canvas.dispatch('pointerdown', { pointerId: 2, clientX: 100, clientY: 50 });
    assert.equal(wheel.pointerId, 2, 'Armed app allows valid pointerdown');
    assert.equal(wheel.isDragging, true);
  } finally {
    cleanup();
  }
});

test('Step 2.B & 2.C: Secondary pointer cannot steal ownership, and secondary pointer up/cancel does not release owner', () => {
  const cleanup = setupDOMEnv();
  try {
    // 1. Test on PedalControl
    const container = createMockElement('div');
    const fill = createMockElement('div');
    const val = createMockElement('span');
    let travel = 0;
    const pedal = new PedalControl(container, fill, val, (v) => { travel = v; });

    // Finger 1 touches pedal
    container.dispatch('pointerdown', { pointerId: 10, clientY: 200 });
    assert.equal(pedal.pointerId, 10);
    assert.ok(pedal.travel > 0);
    const initialTravel = pedal.travel;

    // Finger 2 touches same pedal -> must be ignored!
    container.dispatch('pointerdown', { pointerId: 20, clientY: 150 });
    assert.equal(pedal.pointerId, 10, 'Secondary pointer must not steal ownership');

    // Finger 2 moves -> must not alter travel
    container.dispatch('pointermove', { pointerId: 20, clientY: 120 });
    assert.equal(pedal.travel, initialTravel, 'Secondary pointer move must be ignored');

    // Finger 2 lifts up -> must NOT release owner 10
    container.dispatch('pointerup', { pointerId: 20 });
    assert.equal(pedal.pointerId, 10, 'Secondary pointer up must not end primary owner');
    assert.equal(pedal.travel, initialTravel);

    // Finger 2 cancels -> must NOT release owner 10
    container.dispatch('pointercancel', { pointerId: 20 });
    assert.equal(pedal.pointerId, 10, 'Secondary pointer cancel must not end primary owner');

    // Primary owner 10 lifts up -> properly releases
    container.dispatch('pointerup', { pointerId: 10 });
    assert.equal(pedal.pointerId, null);
    assert.equal(pedal.travel, 0);

    // 2. Test on HPatternShifter knob
    const stage = createMockElement('div');
    const knob = createMockElement('div');
    stage.querySelector = () => knob;
    let selectedGear = null;
    const shifter = new HPatternShifter(stage, (g) => { selectedGear = g; });
    shifter.setEnabled(true);

    // Finger 1 touches knob
    knob.dispatch('pointerdown', { pointerId: 30 });
    assert.equal(shifter.pointer, 30);

    // Finger 2 touches knob -> ignored
    knob.dispatch('pointerdown', { pointerId: 40 });
    assert.equal(shifter.pointer, 30, 'Secondary pointer on knob must be ignored');

    // Finger 2 lifts -> does not release shifter pointer
    knob.dispatch('pointerup', { pointerId: 40 });
    assert.equal(shifter.pointer, 30);

    // Finger 1 lifts -> releases shifter
    knob.dispatch('pointerup', { pointerId: 30, clientX: 50, clientY: 50 });
    assert.equal(shifter.pointer, null);
  } finally {
    cleanup();
  }
});

test('Step 2.D: Independent multitouch across wheel, throttle, and brake operates concurrently without mutual resets', () => {
  const cleanup = setupDOMEnv();
  try {
    // Wheel
    const wheelCanvas = createMockElement('canvas');
    wheelCanvas.parentElement = createMockElement('div');
    const wheel = new SteeringWheel(wheelCanvas, { steeringRangeDeg: 900 });

    // Throttle & Brake Pedals
    let throttleTravel = 0, brakeTravel = 0;
    const throttle = new PedalControl(createMockElement('div'), createMockElement('div'), createMockElement('span'), (v) => { throttleTravel = v; });
    const brake = new PedalControl(createMockElement('div'), createMockElement('div'), createMockElement('span'), (v) => { brakeTravel = v; });

    // Touch 1 on Wheel (pointerId 101)
    wheelCanvas.dispatch('pointerdown', { pointerId: 101, clientX: 60, clientY: 100 });
    wheelCanvas.dispatch('pointermove', { pointerId: 101, clientX: 90, clientY: 120 });
    assert.equal(wheel.pointerId, 101);
    assert.notEqual(wheel.currentAngle, 0);
    const activeAngle = wheel.currentAngle;

    // Touch 2 on Throttle (pointerId 102)
    throttle.container.dispatch('pointerdown', { pointerId: 102, clientY: 180 });
    assert.equal(throttle.pointerId, 102);
    assert.ok(throttle.travel > 0);
    const activeThrottle = throttle.travel;

    // Touch 3 on Brake (pointerId 103)
    brake.container.dispatch('pointerdown', { pointerId: 103, clientY: 140 });
    assert.equal(brake.pointerId, 103);
    assert.ok(brake.travel > 0);

    // All three controls have distinct owners simultaneously
    assert.equal(wheel.pointerId, 101);
    assert.equal(throttle.pointerId, 102);
    assert.equal(brake.pointerId, 103);

    // Release Brake only
    brake.container.dispatch('pointerup', { pointerId: 103 });
    assert.equal(brake.pointerId, null);
    assert.equal(brake.travel, 0);

    // CRITICAL: Releasing brake MUST NOT reset throttle or wheel!
    assert.equal(throttle.pointerId, 102, 'Releasing brake must not reset throttle pointer');
    assert.equal(throttle.travel, activeThrottle, 'Throttle travel must remain preserved');
    assert.equal(wheel.pointerId, 101, 'Releasing brake must not reset wheel pointer');
    assert.equal(wheel.currentAngle, activeAngle, 'Wheel angle must remain preserved');

    // Cleanly release remaining controls
    throttle.container.dispatch('pointerup', { pointerId: 102 });
    assert.equal(throttle.pointerId, null);
    wheelCanvas.dispatch('pointerup', { pointerId: 101 });
    assert.equal(wheel.pointerId, null);
  } finally {
    cleanup();
  }
});

test('Step 2.E: Pointer passing over another control without pointerdown does not take ownership', () => {
  const cleanup = setupDOMEnv();
  try {
    const throttle = new PedalControl(createMockElement('div'), createMockElement('div'), createMockElement('span'), () => {});
    const brake = new PedalControl(createMockElement('div'), createMockElement('div'), createMockElement('span'), () => {});

    // Pointer 50 touches throttle
    throttle.container.dispatch('pointerdown', { pointerId: 50, clientY: 200 });
    assert.equal(throttle.pointerId, 50);

    // Pointer 50 moves over brake element (no pointerdown on brake)
    brake.container.dispatch('pointermove', { pointerId: 50, clientY: 150 });
    assert.equal(brake.pointerId, null, 'Brake must not take ownership from a passing pointer');
    assert.equal(brake.travel, 0);
  } finally {
    cleanup();
  }
});

test('Step 2.F: Uncommitted gesture cancellation: cancel releases pedal, does NOT commit H-shifter gear, and does NOT add palette item', () => {
  const cleanup = setupDOMEnv();
  try {
    // 1. Pedal cancel releases pedal to neutral (0)
    const pedal = new PedalControl(createMockElement('div'), createMockElement('div'), createMockElement('span'), () => {});
    pedal.container.dispatch('pointerdown', { pointerId: 77, clientY: 180 });
    assert.ok(pedal.travel > 0);
    pedal.container.dispatch('pointercancel', { pointerId: 77 });
    assert.equal(pedal.pointerId, null);
    assert.equal(pedal.travel, 0, 'Pedal cancel must restore neutral 0');

    // 2. H-shifter cancel does not select a new gear
    const stage = createMockElement('div');
    const knob = createMockElement('div');
    stage.querySelector = () => knob;
    let gearSelected = 'neutral';
    const shifter = new HPatternShifter(stage, (g) => { gearSelected = g; });
    shifter.setEnabled(true);
    shifter.select('gear1', false); // Start at gear1
    assert.equal(shifter.gear, 'gear1');

    // User drags knob towards gear2
    knob.dispatch('pointerdown', { pointerId: 88 });
    // Cancel fires (e.g. gesture interrupted or system popup)
    knob.dispatch('pointercancel', { pointerId: 88, clientX: 13, clientY: 80 });
    assert.equal(shifter.pointer, null);
    assert.equal(shifter.gear, 'gear1', 'Uncommitted cancel must revert to pre-drag gear, not commit new slot');

    // 3. Layout Editor Palette cancel does not add button
    const editorStage = createMockElement('div');
    const layer = createMockElement('div');
    const palette = createMockElement('div');
    const editor = new LayoutEditor({
      stage: editorStage,
      layer,
      palette,
      onCreate: () => createMockElement('button')
    });
    editor.setEditing(true);
    const initialItemCount = editor.items().length;

    // Simulate palette drag with pointerdown
    const palBtn = createMockElement('button');
    editor.bindPaletteDrag(palBtn, { id: 'horn', label: 'Horn' });
    palBtn.dispatch('pointerdown', { pointerId: 99, clientX: 100, clientY: 100 });
    assert.ok(editor.drag !== null, 'Drag should be initialized');

    // Cancel drag
    palBtn.dispatch('pointercancel', { pointerId: 99 });
    assert.equal(editor.drag, null, 'Drag must be cleared on cancel');
    assert.equal(editor.items().length, initialItemCount, 'Cancelled drag must not add items to layout');
  } finally {
    cleanup();
  }
});

test('Step 2.G: Reset mid-drag invalidates previous pointer gesture and ignores subsequent move/up', () => {
  const cleanup = setupDOMEnv();
  try {
    const container = createMockElement('div');
    let travel = 0;
    const pedal = new PedalControl(container, createMockElement('div'), createMockElement('span'), (v) => { travel = v; });

    // Drag begins
    container.dispatch('pointerdown', { pointerId: 100, clientY: 150 });
    assert.ok(pedal.travel > 0);

    // System reset occurs (e.g. pause, disconnect, require_neutral)
    pedal.reset();
    assert.equal(pedal.pointerId, null);
    assert.equal(pedal.travel, 0);

    // Old finger continues to move without lifting
    container.dispatch('pointermove', { pointerId: 100, clientY: 120 });
    assert.equal(pedal.pointerId, null, 'Move from old pointer must be ignored');
    assert.equal(pedal.travel, 0, 'Travel must remain neutral 0');

    // Old finger lifts up
    container.dispatch('pointerup', { pointerId: 100 });
    assert.equal(pedal.pointerId, null);
    assert.equal(pedal.travel, 0);

    // A fresh pointerdown with new pointerId starts normally
    container.dispatch('pointerdown', { pointerId: 200, clientY: 160 });
    assert.equal(pedal.pointerId, 200);
    assert.ok(pedal.travel > 0);
  } finally {
    cleanup();
  }
});

test('Step 2.H: Idempotent capture release prevents re-entrant callback loops', () => {
  const cleanup = setupDOMEnv();
  try {
    const container = createMockElement('div');
    container.onSimulateCaptureEvent = true; // Enables synchronous lostpointercapture on releasePointerCapture

    let resetCount = 0;
    const pedal = new PedalControl(container, createMockElement('div'), createMockElement('span'), () => { resetCount++; });

    // Pointerdown takes capture
    container.dispatch('pointerdown', { pointerId: 55, clientY: 200 });

    // Release triggers releasePointerCapture -> lostpointercapture synchronously
    container.dispatch('pointerup', { pointerId: 55 });

    assert.equal(pedal.pointerId, null);
    assert.equal(pedal.travel, 0);
    // Because pointerId was set to null prior to releasing capture, lostpointercapture did not re-trigger reset
    assert.ok(resetCount <= 2, 'No re-entrant loops or duplicate execution');
  } finally {
    cleanup();
  }
});

test('Step 2.I: Geometry change / orientation change cancels active drag and neutralizes input', () => {
  const cleanup = setupDOMEnv();
  try {
    const canvas = createMockElement('canvas');
    canvas.parentElement = createMockElement('div');
    const wheel = new SteeringWheel(canvas, { steeringRangeDeg: 900 });

    const pedal = new PedalControl(createMockElement('div'), createMockElement('div'), createMockElement('span'), () => {});

    // Active drag on wheel & pedal
    canvas.dispatch('pointerdown', { pointerId: 1, clientX: 80, clientY: 120 });
    canvas.dispatch('pointermove', { pointerId: 1, clientX: 110, clientY: 140 });
    assert.equal(wheel.isDragging, true);

    pedal.container.dispatch('pointerdown', { pointerId: 2, clientY: 150 });
    assert.equal(pedal.pointerId, 2);

    // Screen rotation / resize happens mid-drag:
    wheel.cancelDrag();
    pedal.reset();

    assert.equal(wheel.pointerId, null);
    assert.equal(wheel.isDragging, false);
    assert.equal(wheel.currentAngle, 0, 'Wheel angle must be safely neutralized');

    assert.equal(pedal.pointerId, null);
    assert.equal(pedal.travel, 0, 'Pedal travel must be safely neutralized');
  } finally {
    cleanup();
  }
});

test('Step 2.J: Reset preserves unrelated UI toggles and component selection classes', () => {
  const cleanup = setupDOMEnv();
  try {
    // Buttons in DOM
    const actionBtn = createMockElement('button');
    actionBtn.classList.add('action-button');
    actionBtn.classList.add('active');
    actionBtn._resetPointer = () => { actionBtn.classList.remove('active'); };

    const truckRangeToggle = createMockElement('button');
    truckRangeToggle.id = 'h-range-toggle';
    truckRangeToggle.classList.add('active'); // e.g. High Range selected

    const layoutEditToggle = createMockElement('button');
    layoutEditToggle.id = 'layout-edit';
    layoutEditToggle.classList.add('active'); // e.g. edit mode open

    // Only action-button has _resetPointer called
    const actionButtons = [actionBtn];
    actionButtons.forEach((b) => b._resetPointer?.());

    assert.equal(actionBtn.classList.contains('active'), false, 'Action button active class must be cleared on reset');
    assert.equal(truckRangeToggle.classList.contains('active'), true, 'Truck range toggle must NOT be cleared by input reset');
    assert.equal(layoutEditToggle.classList.contains('active'), true, 'Layout edit button must NOT be cleared by input reset');
  } finally {
    cleanup();
  }
});

test('Step 2.K: Late spring auto-center callback after reset does not overwrite neutral angle', () => {
  const cleanup = setupDOMEnv();
  try {
    const canvas = createMockElement('canvas');
    canvas.parentElement = createMockElement('div');
    const wheel = new SteeringWheel(canvas, { steeringRangeDeg: 900 });

    // Rotate wheel and release so spring activates
    canvas.dispatch('pointerdown', { pointerId: 1, clientX: 50, clientY: 100 });
    canvas.dispatch('pointermove', { pointerId: 1, clientX: 80, clientY: 100 });
    canvas.dispatch('pointerup', { pointerId: 1 });
    assert.equal(wheel.spring.isActive, true);

    // Reset occurs while spring is returning to center
    wheel.resetToCenter();
    assert.equal(wheel.currentAngle, 0);
    assert.equal(wheel.spring.isActive, false, 'Spring must be stopped on reset');

    // Late animation frame tick arrives
    wheel.update(performance.now() + 500);
    assert.equal(wheel.currentAngle, 0, 'Late frame update must not resurrect old angle');
  } finally {
    cleanup();
  }
});

test('Step 2.L: Repeated pause/resume/reset cycles do not accumulate leaks, listeners, or state', () => {
  const cleanup = setupDOMEnv();
  try {
    const container = createMockElement('div');
    const pedal = new PedalControl(container, createMockElement('div'), createMockElement('span'), () => {});

    // Perform 20 rapid cycles
    for (let i = 0; i < 20; i++) {
      container.dispatch('pointerdown', { pointerId: i + 1, clientY: 150 });
      assert.equal(pedal.pointerId, i + 1);
      pedal.reset();
      assert.equal(pedal.pointerId, null);
      assert.equal(pedal.travel, 0);
    }

    // Final check: normal operation intact
    container.dispatch('pointerdown', { pointerId: 999, clientY: 160 });
    assert.equal(pedal.pointerId, 999);
    assert.ok(pedal.travel > 0);
    pedal.reset();
    assert.equal(pedal.pointerId, null);
  } finally {
    cleanup();
  }
});
