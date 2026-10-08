import { ACTIONS, supportsAction } from '../../../../packages/profiles/src/index.js';

export const H_SLOTS = Object.freeze([
  { id: 'gear1', label: '1', x: 13, y: 20 },
  { id: 'gear2', label: '2', x: 13, y: 80 },
  { id: 'gear3', label: '3', x: 41, y: 20 },
  { id: 'gear4', label: '4', x: 41, y: 80 },
  { id: 'gear5', label: '5', x: 69, y: 20 },
  { id: 'gear6', label: '6', x: 69, y: 80 },
  { id: 'reverse', label: 'R', x: 90, y: 80 }
]);

export function nearestHSlot(x, y, available = new Set(H_SLOTS.map(slot => slot.id)), threshold = 26) {
  let selected = null;
  let minDistance = threshold;
  for (const slot of H_SLOTS) {
    if (!available.has(slot.id)) continue;
    const dist = Math.hypot(x - slot.x, y - slot.y);
    if (dist < minDistance) {
      selected = slot;
      minDistance = dist;
    }
  }
  return selected;
}

export class HPatternShifter {
  constructor(stage, onChange, options = {}) {
    this.stage = stage;
    this.knob = stage.querySelector('#h-knob');
    this.onChange = onChange;
    this.input = options.input || null;
    this.threshold = options.threshold || 20;

    if (this.knob) {
      this.knob.setAttribute('aria-valuemin', '0');
      this.knob.setAttribute('aria-valuemax', '7');
    }

    this.buttons = [...stage.querySelectorAll('[data-h-gear]')];
    this.enabled = false;
    this.pointer = null;
    this.stageRect = null;

    this.gear = null;          // Officially committed gear: 'gear1'..'gear6', 'reverse', or null (N)
    this.committedGear = null; // Saved during drag to revert cleanly on cancel
    this.previewGear = null;   // Real-time preview gear during pointermove

    this.rangeHigh = false;
    this.splitHigh = false;
    this.truckActionsSupported = false;

    this.togglesContainer = document.getElementById('h-shifter-truck-toggles');
    this.rangeBtn = document.getElementById('h-range-toggle');
    this.splitBtn = document.getElementById('h-split-toggle');

    this.available = new Set(H_SLOTS.map(slot => slot.id));
    this.bind();
    this.reset(false);
  }

  bind() {
    if (this.rangeBtn) {
      this.rangeBtn.addEventListener('click', () => {
        if (window.app?.layoutEditor?.editing || !this.enabled || !window.app?.armed) return;
        if (!this.truckActionsSupported || this.rangeBtn.disabled) return;
        this.rangeHigh = !this.rangeHigh;
        this.updateRangeUI();
        const input = this.input || window.app?.input;
        if (input) {
          input.press('range', 'h-shifter:range');
          input.release('range', 'h-shifter:range');
        }
      });
    }

    if (this.splitBtn) {
      this.splitBtn.addEventListener('click', () => {
        if (window.app?.layoutEditor?.editing || !this.enabled || !window.app?.armed) return;
        if (!this.truckActionsSupported || this.splitBtn.disabled) return;
        this.splitHigh = !this.splitHigh;
        this.updateSplitUI();
        const input = this.input || window.app?.input;
        if (input) {
          input.press('splitter', 'h-shifter:splitter');
          input.release('splitter', 'h-shifter:splitter');
        }
      });
    }

    for (const button of this.buttons) {
      button.addEventListener('click', () => {
        if (window.app?.layoutEditor?.editing || !this.enabled || !window.app?.armed) return;
        if (button.disabled) return;
        if (this.pointer !== null) {
          // Cancel active drag before committing clicked slot
          this.cancelDrag();
        }
        this.select(button.dataset.hGear, true);
      });
    }

    if (this.knob) {
      this.knob.addEventListener('pointerdown', event => {
        if (window.app?.layoutEditor?.editing || !this.enabled || !window.app?.armed) return;
        const cockpitMain = document.getElementById('cockpit-main');
        if (cockpitMain && (cockpitMain.classList.contains('hud-edit-mode') || cockpitMain.classList.contains('layout-editing'))) return;
        if (this.pointer !== null) return; // single pointer ownership

        event.preventDefault();
        this.pointer = event.pointerId;
        this.committedGear = this.gear;
        this.previewGear = this.gear;
        this.stageRect = this.stage.getBoundingClientRect();
        try { this.knob.setPointerCapture(event.pointerId); } catch {}
        this.knob.classList.add('dragging');
      });

      this.knob.addEventListener('pointermove', event => {
        if (event.pointerId !== this.pointer) return;
        event.preventDefault();

        const pt = this.point(event.clientX, event.clientY);
        if (!pt) return;

        // Visual knob position clamped to stage boundaries for rendering
        const visualX = Math.max(6, Math.min(94, pt.x));
        const visualY = Math.max(10, Math.min(90, pt.y));
        this.place(visualX, visualY, false);

        // Preview candidate slot selection without committing to model or output
        const isOutOfBounds = pt.x < -10 || pt.x > 110 || pt.y < -10 || pt.y > 110;
        const candidateSlot = isOutOfBounds ? null : nearestHSlot(pt.x, pt.y, this.available, this.threshold);
        const candidateGear = candidateSlot ? candidateSlot.id : null;
        this.previewGear = candidateGear;
        this.updateVisuals(candidateGear, true);
        // CRITICAL: NO onChange callback, NO output frame emission during drag
      });

      const onUp = event => {
        if (event.pointerId !== this.pointer) return;
        event.preventDefault();

        const id = this.pointer;
        this.pointer = null;
        this.stageRect = null;
        this.knob.classList.remove('dragging');
        if (id !== null && this.knob.hasPointerCapture?.(id)) {
          try { this.knob.releasePointerCapture(id); } catch {}
        }

        const pt = this.point(event.clientX, event.clientY);
        const isOutOfBounds = !pt || pt.x < -10 || pt.x > 110 || pt.y < -10 || pt.y > 110;

        if (isOutOfBounds) {
          // Released outside valid interaction bounds: revert to previously committed gear
          this.select(this.committedGear, false);
        } else {
          const slot = nearestHSlot(pt.x, pt.y, this.available, this.threshold);
          this.select(slot ? slot.id : null, true);
        }
      };

      const onCancel = event => {
        if (event.pointerId !== this.pointer) return;
        event.preventDefault();
        this.cancelDrag();
      };

      this.knob.addEventListener('pointerup', onUp);
      this.knob.addEventListener('pointercancel', onCancel);
      this.knob.addEventListener('lostpointercapture', onCancel);
    }
  }

  point(clientX, clientY) {
    const rect = this.stageRect || this.stage.getBoundingClientRect();
    if (!rect || !Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    return { x, y };
  }

  place(x, y, animate = true) {
    if (!this.knob) return;
    this.knob.classList.toggle('snap', animate);
    this.knob.style.left = x + '%';
    this.knob.style.top = y + '%';
  }

  getGearLabel(id) {
    if (!id) return 'N';
    if (id === 'reverse') return 'R';
    const num = parseInt(id.replace('gear', ''), 10);
    return isNaN(num) ? id : String(num);
  }

  updateVisuals(gearId, isPreview = false) {
    const label = this.getGearLabel(gearId);
    if (this.knob) {
      this.knob.textContent = label;
      const slot = H_SLOTS.find(value => value.id === gearId);
      this.knob.setAttribute('aria-valuenow', String(slot ? H_SLOTS.indexOf(slot) + 1 : 0));
      this.knob.setAttribute('aria-valuetext', label === 'N' ? 'Mo' : label);
    }
    for (const button of this.buttons) {
      button.classList.toggle('active', button.dataset.hGear === gearId);
      button.classList.toggle('preview', isPreview && button.dataset.hGear === gearId);
    }
  }

  select(id, notify = true) {
    const slot = H_SLOTS.find(value => value.id === id && this.available.has(value.id));
    const targetGear = slot ? slot.id : null;
    this.gear = targetGear;
    this.committedGear = targetGear;
    this.previewGear = null;

    if (slot) {
      this.place(slot.x, slot.y, true);
    } else {
      this.place(41, 50, true); // Neutral center
    }

    this.updateVisuals(targetGear, false);

    if (navigator.vibrate && targetGear) {
      try { navigator.vibrate(22); } catch {}
    }

    if (notify) {
      this.onChange?.(targetGear);
    }
  }

  sync(id) {
    this.select(id, false);
  }

  setAvailability(slotIds) {
    this.available = new Set(slotIds);
    for (const button of this.buttons) {
      button.disabled = !this.available.has(button.dataset.hGear);
    }
    // If currently selected gear is no longer available, transition to Neutral
    if (this.gear !== null && !this.available.has(this.gear)) {
      this.select(null, true);
    }
  }

  updateRangeUI() {
    if (this.rangeBtn) {
      this.rangeBtn.classList.toggle('active', this.rangeHigh);
      const txt = this.rangeBtn.querySelector('.toggle-txt');
      if (txt) {
        txt.textContent = this.rangeHigh ? 'RANGE · HI (Yêu cầu)' : 'RANGE · LO (Yêu cầu)';
      }
    }
  }

  updateSplitUI() {
    if (this.splitBtn) {
      this.splitBtn.classList.toggle('active', this.splitHigh);
      const txt = this.splitBtn.querySelector('.toggle-txt');
      if (txt) {
        txt.textContent = this.splitHigh ? 'SPLIT · HI (Yêu cầu)' : 'SPLIT · LO (Yêu cầu)';
      }
    }
  }

  updateTruckToggles(profile = window.app?.profile, capabilities = window.app?.capabilities || {}) {
    const isTruckSupported = Boolean(profile?.groups?.includes('truck'));
    const rangeAction = ACTIONS.find(a => a.id === 'range');
    const splitAction = ACTIONS.find(a => a.id === 'splitter');
    const rangeSupported = isTruckSupported && supportsAction(rangeAction, profile, capabilities);
    const splitSupported = isTruckSupported && supportsAction(splitAction, profile, capabilities);
    this.truckActionsSupported = isTruckSupported && (rangeSupported || splitSupported);
    if (this.togglesContainer) {
      this.togglesContainer.hidden = !this.enabled || !isTruckSupported;
    }
    if (this.rangeBtn) {
      this.rangeBtn.disabled = !rangeSupported;
    }
    if (this.splitBtn) {
      this.splitBtn.disabled = !splitSupported;
    }
  }

  setEnabled(value) {
    this.enabled = !!value;
    this.stage.classList.toggle('disabled', !this.enabled);
    if (this.togglesContainer) {
      this.togglesContainer.hidden = !this.enabled || !this.truckActionsSupported;
    }
    if (!this.enabled && this.pointer !== null) {
      this.cancelDrag();
    }
  }

  cancelDrag() {
    if (this.pointer === null) return;
    const id = this.pointer;
    this.pointer = null;
    this.stageRect = null;
    this.previewGear = null;
    if (this.knob) {
      this.knob.classList.remove('dragging');
      if (id !== null && this.knob.hasPointerCapture?.(id)) {
        try { this.knob.releasePointerCapture(id); } catch {}
      }
    }
    // Revert cleanly to previously committed gear without firing onChange
    this.select(this.committedGear, false);
  }

  reset(notify = true) {
    const id = this.pointer;
    this.pointer = null;
    this.stageRect = null;
    this.committedGear = null;
    this.previewGear = null;
    this.rangeHigh = false;
    this.splitHigh = false;
    this.updateRangeUI();
    this.updateSplitUI();
    if (this.knob) {
      this.knob.classList.remove('dragging');
      if (id !== null && this.knob.hasPointerCapture?.(id)) {
        try { this.knob.releasePointerCapture(id); } catch {}
      }
    }
    this.select(null, notify);
  }
}
