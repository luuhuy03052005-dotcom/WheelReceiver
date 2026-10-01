import { BUTTONS } from '../../protocol/src/index.js';

/**
 * Normalizes steering rotation in degrees into int16 [-32768, 32767].
 * Respects deadzone, power curve exponent, and clamps.
 * Converts NaN / non-finite numbers to 0 (BR-INP-06, BR-STR-01, BR-STR-02).
 */
export function normalizeSteering(angleDeg, options = {}) {
  if (typeof angleDeg !== 'number' || !Number.isFinite(angleDeg)) {
    return 0;
  }

  const {
    maxAngleDeg = 180,
    deadzone = 0.03,
    curveExponent = 1.0,
    centerOffsetDeg = 0
  } = options;

  const adjustedAngle = angleDeg - centerOffsetDeg;
  if (maxAngleDeg <= 0) return 0;

  let rawNorm = adjustedAngle / maxAngleDeg;
  rawNorm = Math.max(-1, Math.min(1, rawNorm));

  const absNorm = Math.abs(rawNorm);
  if (absNorm <= deadzone) {
    return 0;
  }

  const scaledNorm = Math.sign(rawNorm) * ((absNorm - deadzone) / (1 - deadzone));
  const curvedNorm = Math.sign(scaledNorm) * Math.pow(Math.abs(scaledNorm), curveExponent);

  const clamped = Math.max(-1, Math.min(1, curvedNorm));

  if (clamped < 0) {
    return Math.round(clamped * 32768);
  }
  return Math.round(clamped * 32767);
}

/**
 * Normalizes pedal travel [0, 1] into uint8 [0, 255].
 * Applies lower deadzone, upper saturation, and power curve.
 * Converts NaN / non-finite values to 0 (BR-INP-06, BR-PED-01, BR-PED-03).
 */
export function normalizePedal(travel, options = {}) {
  if (typeof travel !== 'number' || !Number.isFinite(travel)) {
    return 0;
  }

  const {
    lowerDeadzone = 0.02,
    upperSaturation = 0.98,
    curveExponent = 1.0
  } = options;

  const clampedTravel = Math.max(0, Math.min(1, travel));

  if (clampedTravel <= lowerDeadzone) {
    return 0;
  }
  if (clampedTravel >= upperSaturation) {
    return 255;
  }

  const span = upperSaturation - lowerDeadzone;
  if (span <= 0) return 0;

  const scaled = (clampedTravel - lowerDeadzone) / span;
  const curved = Math.pow(scaled, curveExponent);

  return Math.max(0, Math.min(255, Math.round(curved * 255)));
}

/**
 * Auto-centering Spring Animator (BR-STR-03, BR-INP-05).
 */
export class AutoCenterSpring {
  constructor({ durationMs = 180 } = {}) {
    this.durationMs = durationMs;
    this.startAngle = 0;
    this.startTime = 0;
    this.isActive = false;
  }

  start(fromAngle) {
    this.startAngle = Number.isFinite(fromAngle) ? fromAngle : 0;
    this.startTime = performance.now();
    this.isActive = true;
  }

  stop() {
    this.isActive = false;
  }

  update(now = performance.now()) {
    if (!this.isActive) return 0;

    const elapsed = now - this.startTime;
    const progress = Math.min(1, elapsed / this.durationMs);

    // SmoothStep Ease-InOut (3x^2 - 2x^3) for ultra-smooth initial release & gentle stop
    const factor = progress * progress * (3 - 2 * progress);
    const currentAngle = this.startAngle * (1 - factor);

    if (progress >= 1) {
      this.isActive = false;
      return 0;
    }

    return currentAngle;
  }
}

/**
 * Transmission & Button Latching Controller (BR-MODE-01..04, BR-CLT-01..02, BR-GEAR-01..03, BR-STATE-02).
 */
export class TransmissionController {
  constructor(options = {}) {
    this.mode = options.mode || 'AT'; // 'AT' | 'MT'
    this.clutchThreshold = options.clutchThreshold ?? 0.5; // 50%
    this.shiftPulseMinDurationMs = options.shiftPulseMinDurationMs ?? 50;

    this.clutchTravel = 0;
    this.clutchActive = false;
    this.handbrakeActive = false;

    this.shiftUpPressed = false;
    this.shiftUpPulseUntil = 0;

    this.shiftDownPressed = false;
    this.shiftDownPulseUntil = 0;
    
    this.currentGear = 'NONE';
    this.pressedButtons = {};
  }

  pressButton(button) {
    if (button) this.pressedButtons[button] = true;
  }

  releaseButton(button) {
    if (button) this.pressedButtons[button] = false;
  }

  setMode(newMode) {
    if (this.mode !== newMode) {
      this.mode = newMode;
      if (newMode === 'AT') {
        // MT -> AT release clutch and shift bits immediately (BR-MODE-03)
        this.clutchTravel = 0;
        this.clutchActive = false;
        this.shiftUpPressed = false;
        this.shiftUpPulseUntil = 0;
        this.shiftDownPressed = false;
        this.shiftDownPulseUntil = 0;
      }
    }
  }

  setGear(gear) {
    this.currentGear = gear || 'NONE';
  }

  setClutchTravel(travel) {
    if (this.mode !== 'MT') {
      this.clutchTravel = 0;
      this.clutchActive = false;
      return;
    }
    const val = Number.isFinite(travel) ? Math.max(0, Math.min(1, travel)) : 0;
    this.clutchTravel = val;
    this.clutchActive = val >= this.clutchThreshold;
  }

  getClutchTravel() {
    return this.mode === 'MT' ? this.clutchTravel : 0;
  }

  setHandbrake(pressed) {
    this.handbrakeActive = Boolean(pressed);
  }

  pressShiftUp(now = Date.now()) {
    if (this.mode !== 'MT') return;
    if (!this.shiftUpPressed) {
      this.shiftUpPressed = true;
      this.shiftUpPulseUntil = now + this.shiftPulseMinDurationMs;
    }
  }

  releaseShiftUp() {
    this.shiftUpPressed = false;
  }

  pressShiftDown(now = Date.now()) {
    if (this.mode !== 'MT') return;
    if (!this.shiftDownPressed) {
      this.shiftDownPressed = true;
      this.shiftDownPulseUntil = now + this.shiftPulseMinDurationMs;
    }
  }

  releaseShiftDown() {
    this.shiftDownPressed = false;
  }

  getButtonMask(now = Date.now()) {
    let mask = BUTTONS.NONE;

    for (const [btn, active] of Object.entries(this.pressedButtons)) {
      if (active && BUTTONS[btn]) {
        mask |= BUTTONS[btn];
      }
    }

    if (this.currentGear && BUTTONS[this.currentGear]) {
      mask |= BUTTONS[this.currentGear];
    }

    if (this.handbrakeActive) {
      mask |= BUTTONS.HANDBRAKE;
    }

    if (this.mode === 'MT') {
      if (this.clutchActive) {
        mask |= BUTTONS.CLUTCH;
      }

      // Check shift up (held or within min 50ms pulse duration)
      if (this.shiftUpPressed || now < this.shiftUpPulseUntil) {
        mask |= BUTTONS.SHIFT_UP;
      }

      // Check shift down (held or within min 50ms pulse duration)
      if (this.shiftDownPressed || now < this.shiftDownPulseUntil) {
        mask |= BUTTONS.SHIFT_DOWN;
      }
    }

    return mask;
  }
}
