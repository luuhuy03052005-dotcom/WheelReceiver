import { BUTTONS } from '../../protocol/src/index.js';
import { ACTIONS } from './index.js';

// Fast lookup of actions that behave as pulses
const PULSE_ACTIONS = new Set(
  ACTIONS.filter(a => a.kind === 'pulse').map(a => a.id)
);
PULSE_ACTIONS.add('shiftUp');
PULSE_ACTIONS.add('shiftDown');
PULSE_ACTIONS.add('cameraPrimary');

export function isPulseAction(id) {
  return PULSE_ACTIONS.has(id);
}

const PRIMARY_BUTTON_MAP = {
  shiftUp: BUTTONS.SHIFT_UP,
  shiftDown: BUTTONS.SHIFT_DOWN,
  handbrake: BUTTONS.HANDBRAKE,
  clutchQuick: BUTTONS.CLUTCH,
  clutchTap: BUTTONS.CLUTCH,
  camera: BUTTONS.CAMERA,
  cameraPrimary: BUTTONS.CAMERA,
  nitro: BUTTONS.NITRO,
  dpadUp: BUTTONS.DPAD_UP,
  dpadDown: BUTTONS.DPAD_DOWN,
  dpadLeft: BUTTONS.DPAD_LEFT,
  dpadRight: BUTTONS.DPAD_RIGHT,
  DPAD_UP: BUTTONS.DPAD_UP,
  DPAD_DOWN: BUTTONS.DPAD_DOWN,
  DPAD_LEFT: BUTTONS.DPAD_LEFT,
  DPAD_RIGHT: BUTTONS.DPAD_RIGHT,
  park: BUTTONS.DPAD_UP,
  reverse: BUTTONS.DPAD_DOWN,
  neutral: BUTTONS.DPAD_LEFT,
  drive: BUTTONS.DPAD_RIGHT
};

/**
 * Standard Input State Manager with Multi-Source Hold Tracking,
 * Discrete Pulse State Machine, Observable Release Gaps,
 * and Transmission Mode Filtering.
 */
export class InputState {
  constructor() {
    this.mode = null;
    this.sessionEpoch = 0;
    this.requireTransmittedGap = false;
    this.reset();
  }

  reset() {
    this.sessionEpoch = (this.sessionEpoch || 0) + 1;
    this.heldSources = new Map(); // actionId -> Set<sourceId>
    this.held = new Set();        // actionIds held by >= 1 source
    this.pulseSources = new Map();// actionId -> Set<sourceId> tracking press edges
    this.pulseQueues = new Map(); // actionId -> Array<PulseItem>
    this.currentPulse = new Map();// actionId -> current PulseItem (ACTIVE or GAP)
    this.acknowledgedPulseIds = new Set();
    this.sent = new Set();
    this.pulseIdCounter = 0;
    this.gear = null;
  }

  /**
   * Register a press on an action.
   * Supports both (id, sourceId, now) and (id, now) signatures.
   */
  press(id, sourceOrNow = 'default', maybeNow = performance.now()) {
    if (!id) return;
    let sourceId = 'default';
    let now = performance.now();
    if (typeof sourceOrNow === 'string') {
      sourceId = sourceOrNow;
      now = typeof maybeNow === 'number' ? maybeNow : performance.now();
    } else if (typeof sourceOrNow === 'number') {
      now = sourceOrNow;
    }

    // Direct gear mutual exclusivity
    const directGears = ['gear1', 'gear2', 'gear3', 'gear4', 'gear5', 'gear6', 'reverse', 'park', 'drive', 'neutral'];
    if (directGears.includes(id)) {
      this.setGear(id);
    }

    // Multi-source hold tracking
    let sources = this.heldSources.get(id);
    if (!sources) {
      sources = new Set();
      this.heldSources.set(id, sources);
    }
    if (sources.has(sourceId)) {
      return; // already held by this source; ignore duplicate press without release
    }
    sources.add(sourceId);
    this.held.add(id);

    // Pulse action lifecycle
    if (isPulseAction(id)) {
      let pSources = this.pulseSources.get(id);
      if (!pSources) {
        pSources = new Set();
        this.pulseSources.set(id, pSources);
      }
      if (!pSources.has(sourceId)) {
        pSources.add(sourceId);
        this._enqueuePulse(id, now);
      }
    }
  }

  /**
   * Set the active direct gear, enforcing mutual exclusivity.
   */
  setGear(gearId) {
    const directGears = ['gear1', 'gear2', 'gear3', 'gear4', 'gear5', 'gear6', 'reverse', 'park', 'drive', 'neutral'];
    for (const g of directGears) {
      if (g !== gearId) {
        this.heldSources.delete(g);
        this.held.delete(g);
      }
    }
    this.gear = gearId;
    if (gearId) {
      this.held.add(gearId);
    }
  }

  /**
   * Emit a discrete pulse: press then immediately release source.
   */
  pulse(id, sourceId = 'default', now = performance.now()) {
    this.press(id, sourceId, now);
    this.release(id, sourceId, now);
  }

  /**
   * Register a release on an action.
   * Supports both (id, sourceId, now) and (id, now) signatures.
   */
  release(id, sourceOrNow = 'default', maybeNow = performance.now()) {
    if (!id) return;
    let sourceId = 'default';
    let now = performance.now();
    if (typeof sourceOrNow === 'string') {
      sourceId = sourceOrNow;
      now = typeof maybeNow === 'number' ? maybeNow : performance.now();
    } else if (typeof sourceOrNow === 'number') {
      now = sourceOrNow;
    }

    const sources = this.heldSources.get(id);
    if (sources) {
      sources.delete(sourceId);
      if (sources.size === 0) {
        this.heldSources.delete(id);
        this.held.delete(id);
      }
    }

    const pSources = this.pulseSources.get(id);
    if (pSources) {
      pSources.delete(sourceId);
      if (pSources.size === 0) {
        this.pulseSources.delete(id);
      }
    }
  }

  /**
   * Completely clear an action across all sources and queues.
   */
  clear(id) {
    this.heldSources.delete(id);
    this.held.delete(id);
    this.pulseSources.delete(id);
    this.pulseQueues.delete(id);
    this.currentPulse.delete(id);
    this.sent.delete(id);
    if (this.gear === id) this.gear = null;
  }

  /**
   * Switch transmission mode and purge incompatible inputs.
   */
  setMode(mode) {
    this.mode = mode;
    if (mode === 'AT') {
      const incompatible = ['shiftUp', 'shiftDown', 'clutchQuick', 'clutchTap', 'gear1', 'gear2', 'gear3', 'gear4', 'gear5', 'gear6'];
      for (const id of incompatible) this.clear(id);
      if (this.gear && this.gear.startsWith('gear')) this.gear = null;
    } else if (mode === 'MT') {
      const incompatible = ['clutchQuick', 'clutchTap', 'gear1', 'gear2', 'gear3', 'gear4', 'gear5', 'gear6', 'reverse', 'park', 'drive', 'neutral'];
      for (const id of incompatible) this.clear(id);
      this.gear = null;
    } else if (mode === 'MTC') {
      const incompatible = ['gear1', 'gear2', 'gear3', 'gear4', 'gear5', 'gear6', 'reverse', 'park', 'drive', 'neutral'];
      for (const id of incompatible) this.clear(id);
      this.gear = null;
    } else if (mode === 'H') {
      const incompatible = ['shiftUp', 'shiftDown', 'park', 'drive', 'neutral'];
      for (const id of incompatible) this.clear(id);
      if (['park', 'drive', 'neutral'].includes(this.gear)) this.gear = null;
    }
  }

  _enqueuePulse(id, now) {
    const pulse = {
      id: ++this.pulseIdCounter,
      sessionEpoch: this.sessionEpoch,
      actionId: id,
      requestedAt: now,
      durationMs: 60,
      gapMs: 50,
      gapStartTime: null,
      gapUntil: null,
      gapSampled: false,
      gapTransmitted: false,
      acknowledged: false,
      state: 'ACTIVE'
    };

    const current = this.currentPulse.get(id);
    if (!current) {
      this.currentPulse.set(id, pulse);
    } else {
      let queue = this.pulseQueues.get(id);
      if (!queue) {
        queue = [];
        this.pulseQueues.set(id, queue);
      }
      const MAX_PULSE_QUEUE = 8;
      if (queue.length < MAX_PULSE_QUEUE) {
        pulse.state = 'PENDING';
        queue.push(pulse);
      }
    }
  }

  notifyTransmitted(snapshot, now = performance.now()) {
    for (const current of this.currentPulse.values()) {
      if (current.state === 'GAP') {
        current.gapTransmitted = true;
      }
    }
  }

  _updatePulses(now) {
    for (const [id, current] of this.currentPulse) {
      if (current.state === 'ACTIVE') {
        const until = current.requestedAt + current.durationMs;
        const durationElapsed = now >= until;
        // Survives until acknowledged or up to 200ms beyond pulse duration
        const ackOrTimeout = current.acknowledged || (now >= until + 200);
        if (durationElapsed && ackOrTimeout) {
          current.state = 'GAP';
          current.gapUntil = now + current.gapMs;
          current.gapSampled = false;
          current.gapTransmitted = false;
        }
      }

      if (current.state === 'GAP') {
        const gapObserved = this.requireTransmittedGap ? current.gapTransmitted : (current.gapTransmitted || current.gapSampled);
        if (current.gapUntil !== null && now >= current.gapUntil && gapObserved) {
          this.currentPulse.delete(id);
          const queue = this.pulseQueues.get(id);
          if (queue && queue.length > 0) {
            // Prune expired pulses (>1000ms old)
            while (queue.length > 0 && (now - queue[0].requestedAt > 1000)) {
              queue.shift();
            }
            if (queue.length > 0) {
              const next = queue.shift();
              next.requestedAt = now;
              next.state = 'ACTIVE';
              this.currentPulse.set(id, next);
            }
          }
        }
      }
    }
  }

  /**
   * Generate input snapshot.
   * Applies pulse state machine, release gaps, and transmission mode filtering.
   */
  snapshot(now = performance.now(), overrideMode = null) {
    this._updatePulses(now);

    const active = new Set();

    // 1. Hold actions: active only if physically held by >= 1 source
    for (const id of this.held) {
      if (!isPulseAction(id)) {
        active.add(id);
      }
    }

    // 2. Pulse actions: active only if pulse state is currently ACTIVE
    const activePulseIds = [];
    for (const pulse of this.currentPulse.values()) {
      if (pulse.state === 'ACTIVE') {
        active.add(pulse.actionId);
        activePulseIds.push(pulse.id);
      } else if (pulse.state === 'GAP') {
        pulse.gapSampled = true;
      }
    }

    // Handbrake sets parkingBrake alias for extended bit 34
    if (active.has('handbrake')) {
      active.add('parkingBrake');
    }

    // Gear selection
    if (this.gear) {
      active.add(this.gear);
    }

    // 3. Transmission mode filtering
    const mode = overrideMode || this.mode;
    if (mode === 'AT') {
      active.delete('clutchQuick');
      active.delete('clutchTap');
      active.delete('shiftUp');
      active.delete('shiftDown');
      for (let i = 1; i <= 6; i++) active.delete(`gear${i}`);
    } else if (mode === 'MT') {
      active.delete('clutchQuick');
      active.delete('clutchTap');
      for (let i = 1; i <= 6; i++) active.delete(`gear${i}`);
      active.delete('reverse');
      active.delete('park');
      active.delete('drive');
      active.delete('neutral');
    } else if (mode === 'MTC') {
      for (let i = 1; i <= 6; i++) active.delete(`gear${i}`);
      active.delete('reverse');
      active.delete('park');
      active.delete('drive');
      active.delete('neutral');
    } else if (mode === 'H') {
      active.delete('shiftUp');
      active.delete('shiftDown');
      active.delete('park');
      active.delete('drive');
      active.delete('neutral');
    }

    // 4. Encode extended bits
    let extended = 0n;
    for (const a of ACTIONS) {
      if (active.has(a.id)) {
        extended |= (1n << BigInt(a.index));
      }
    }

    // 5. Encode primary buttons
    let buttons = 0;
    for (const [id, mask] of Object.entries(PRIMARY_BUTTON_MAP)) {
      if (active.has(id)) {
        buttons |= mask;
      }
    }

    // 6. Strict mode masks on final buttons and extended
    if (mode === 'AT') {
      buttons &= ~(BUTTONS.CLUTCH | BUTTONS.SHIFT_UP | BUTTONS.SHIFT_DOWN);
      extended &= ~0x3Fn; // bits 0-5 (manual gears 1-6)
    } else if (mode === 'MT') {
      buttons &= ~BUTTONS.CLUTCH;
      extended &= ~0x3FFn; // all transmission bits
    } else if (mode === 'MTC') {
      extended &= ~0x3FFn; // all direct transmission bits
    } else if (mode === 'H') {
      buttons &= ~(BUTTONS.SHIFT_UP | BUTTONS.SHIFT_DOWN);
      extended &= ~((1n << 7n) | (1n << 8n) | (1n << 9n)); // park, drive, neutral
      // Mutual exclusivity for direct gears (bits 0-6): at most 1 gear bit set
      let gearCount = 0;
      for (let b = 0n; b <= 6n; b++) {
        if ((extended & (1n << b)) !== 0n) gearCount++;
      }
      if (gearCount > 1) {
        extended &= ~0x7Fn;
        const hGears = ['gear1', 'gear2', 'gear3', 'gear4', 'gear5', 'gear6', 'reverse'];
        const gIdx = hGears.indexOf(this.gear);
        if (gIdx >= 0) extended |= (1n << BigInt(gIdx));
      }
    }

    return { extended, buttons, active, pulseIds: activePulseIds, sessionEpoch: this.sessionEpoch };
  }

  /**
   * Acknowledge delivery of a snapshot.
   * Correlates specific pulse IDs so stale ACKs do not confirm new pulses.
   */
  acknowledge(snapshot) {
    if (!snapshot) return;
    if (snapshot.sessionEpoch !== undefined && snapshot.sessionEpoch !== this.sessionEpoch) {
      return; // reject ACK from a different session epoch
    }
    if (Array.isArray(snapshot.pulseIds)) {
      for (const pid of snapshot.pulseIds) {
        this.acknowledgedPulseIds.add(pid);
        for (const [id, pulse] of this.currentPulse) {
          if (pulse.id === pid) {
            pulse.acknowledged = true;
            this.sent.add(id);
          }
        }
      }
    } else if (snapshot.active) {
      for (const id of snapshot.active) {
        this.sent.add(id);
        const pulse = this.currentPulse.get(id);
        if (pulse) pulse.acknowledged = true;
      }
    }

    // If acknowledged snapshot is a release frame (pulse action is not active in it)
    for (const [id, pulse] of this.currentPulse) {
      if (pulse.state === 'GAP') {
        const wasInSnapshot = snapshot.pulseIds ? snapshot.pulseIds.includes(pulse.id) : (snapshot.active && snapshot.active.has(id));
        if (!wasInSnapshot) {
          pulse.gapTransmitted = true;
          if (pulse.gapStartTime === null) {
            const now = performance.now();
            pulse.gapStartTime = now;
            pulse.gapUntil = now + pulse.gapMs;
          }
        }
      }
    }
  }
}
