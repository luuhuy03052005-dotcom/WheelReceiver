export class PedalControl {
  constructor(containerEl, fillEl, valEl, onChange) {
    this.container = containerEl;
    this.fill = fillEl;
    this.val = valEl;
    this.onChange = onChange;
    this.track = containerEl.querySelector('.pedal-slider, .pedal-track') || containerEl;

    this.travel = 0; // 0.0 to 1.0
    this.lastPct = -1;
    this.pointerId = null;
    this.enabled = true;
    this.rect = null;

    this.bindEvents();
  }

  bindEvents() {
    this.container.addEventListener('pointerdown', (e) => {
      if (window.app?.layoutEditor?.editing) return;
      if (!this.enabled || !window.app?.armed) return;
      const cockpitMain = document.getElementById('cockpit-main');
      if (cockpitMain && (cockpitMain.classList.contains('hud-edit-mode') || cockpitMain.classList.contains('layout-editing'))) return;

      if (this.pointerId !== null) return;
      this.pointerId = e.pointerId;
      this.rect = this.track.getBoundingClientRect();
      try {
        this.container.setPointerCapture(e.pointerId);
      } catch {}
      this.updateFromPointer(e);
    });

    this.container.addEventListener('pointermove', (e) => {
      if (this.pointerId !== e.pointerId) return;
      this.updateFromPointer(e);
    });

    const release = (e) => {
      if (e.pointerId !== this.pointerId) return;
      this.reset();
    };

    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.container.addEventListener(event, release);
    }
  }

  setEnabled(val) {
    this.enabled = Boolean(val);
    if (!this.enabled && this.pointerId !== null) {
      this.reset();
    }
  }

  cancelDrag() {
    this.reset();
  }

  updateFromPointer(e) {
    if (!this.rect) this.rect = this.track.getBoundingClientRect();
    const rect = this.rect;
    const relativeY = rect.bottom - e.clientY;
    // Map natural thumb touch range (5% to 60% of track height) to full 0..1 travel
    // Ensures resting at bottom is 0, normal thumb push reaches 100% comfortably
    const fraction = rect.height > 0 ? (relativeY / rect.height - 0.05) / 0.55 : 0;

    this.travel = Math.max(0, Math.min(1, fraction));
    this.updateUI();
    this.onChange(this.travel);
  }

  reset() {
    const id = this.pointerId;
    this.pointerId = null;
    if (id !== null) {
      try {
        if (this.container.hasPointerCapture?.(id)) {
          this.container.releasePointerCapture(id);
        }
      } catch {}
    }
    this.travel = 0;
    this.rect = null;
    this.updateUI();
    this.onChange(0);
  }

  updateUI() {
    const pct = Math.round(this.travel * 100);
    if (pct === this.lastPct) return;
    this.lastPct = pct;

    if (this.fill) this.fill.style.height = `${pct}%`;
    if (this.val) this.val.textContent = `${pct}%`;
    this.container.style.setProperty('--pedal-shift', `${pct * 0.43}%`);
    this.container.style.setProperty('--pedal-angle', `${7 + this.travel * 13}deg`);
  }
}
