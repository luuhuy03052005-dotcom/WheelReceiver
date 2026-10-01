import { TransmissionController } from './control-math.js';
import { sounds } from './audio.js';
import { BUTTONS } from './protocol.js';

export class CockpitControls {
  constructor(options = {}) {
    this.tx = new TransmissionController({
      mode: options.mode || 'AT',
      clutchThreshold: options.clutchThreshold || 0.5
    });

    this.extraButtonsMask = 0;
    this.bindUI();
  }

  bindUI() {
    // AT / MT Mode Toggle update
    const modeAt = document.getElementById('mode-at');
    const modeMt = document.getElementById('mode-mt');
    
    const updateModeUI = (mode) => {
      this.tx.setMode(mode);
      const isMt = mode === 'MT';
      if (modeMt) modeMt.classList.toggle('active', isMt);
      if (modeAt) modeAt.classList.toggle('active', !isMt);

      const hudClutch = document.getElementById('hud-clutch');
      const hudHShifter = document.getElementById('hud-h-shifter');
      const hudAutoShifter = document.getElementById('hud-auto-shifter');
      const hudClutchQuick = document.getElementById('hud-clutch-quick');
      
      if (hudClutch) hudClutch.style.display = isMt ? 'flex' : 'none';
      if (hudHShifter) hudHShifter.style.display = isMt ? 'block' : 'none';
      if (hudAutoShifter) hudAutoShifter.style.display = isMt ? 'none' : 'block';
      if (hudClutchQuick) hudClutchQuick.style.display = isMt ? 'block' : 'none';
    };

    if (modeAt) modeAt.addEventListener('click', () => updateModeUI('AT'));
    if (modeMt) modeMt.addEventListener('click', () => updateModeUI('MT'));

    // Initialize Shifters (Drag and snap logic)
    this.initShifter('h-shifter-knob', '.hud-h-shifter-widget .slot');
    this.initShifter('auto-shifter-knob', '.hud-auto-shifter-widget .slot');

    // Dynamic Event Delegation for Action Buttons
    const container = document.getElementById('app-container') || document.body;

    const handlePointerDown = (e) => {
      const btn = e.target.closest('[data-btn-type]');
      if (!btn) return;
      
      const cockpitMain = document.getElementById('cockpit-main');
      if (cockpitMain && cockpitMain.classList.contains('hud-edit-mode')) return;
      
      if (btn.hasAttribute('data-pointer-id')) return; // Already pressed
      
      btn.setAttribute('data-pointer-id', e.pointerId);
      btn.classList.add('active');
      try { btn.setPointerCapture(e.pointerId); } catch {}
      
      this.updateButtonState(btn.getAttribute('data-btn-type'), true);
    };

    const handlePointerUp = (e) => {
      const btn = document.querySelector(`[data-pointer-id="${e.pointerId}"]`);
      if (!btn) return;
      
      btn.removeAttribute('data-pointer-id');
      btn.classList.remove('active');
      try { btn.releasePointerCapture(e.pointerId); } catch {}
      
      this.updateButtonState(btn.getAttribute('data-btn-type'), false);
    };

    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('pointerup', handlePointerUp);
    container.addEventListener('pointercancel', handlePointerUp);
    container.addEventListener('lostpointercapture', handlePointerUp);
  }

  updateButtonState(type, pressed) {
    switch (type) {
      case 'A': 
        this.tx.setHandbrake(pressed); 
        break;
      case 'Y':
        if (pressed) {
          this.extraButtonsMask |= BUTTONS.Y;
          sounds.playShiftClick(true);
        } else {
          this.extraButtonsMask &= ~BUTTONS.Y;
        }
        break;
      case 'RB':
        if (pressed) this.extraButtonsMask |= BUTTONS.RB;
        else this.extraButtonsMask &= ~BUTTONS.RB;
        break;
      case 'LB':
        this.tx.setClutchTravel(pressed ? 1.0 : 0.0);
        break;
      case 'B':
        if (pressed) this.extraButtonsMask |= BUTTONS.B;
        else this.extraButtonsMask &= ~BUTTONS.B;
        break;
      case 'X':
        if (pressed) this.extraButtonsMask |= BUTTONS.X;
        else this.extraButtonsMask &= ~BUTTONS.X;
        break;
      case 'THROTTLE':
        if (window.app) window.app.throttleTravel = pressed ? 1.0 : 0.0;
        break;
      case 'BRAKE':
        if (window.app) window.app.brakeTravel = pressed ? 1.0 : 0.0;
        break;
      case 'CLUTCH':
        if (window.app) {
          window.app.clutchTravel = pressed ? 1.0 : 0.0;
          this.tx.setClutchTravel(window.app.clutchTravel);
        }
        break;
    }
  }

  setClutch(travel) {
    this.tx.setClutchTravel(travel);
  }

  getClutchTravel() {
    return this.tx.getClutchTravel();
  }

  getButtonMask(now = Date.now()) {
    return this.tx.getButtonMask(now) | this.extraButtonsMask;
  }

  initShifter(knobId, slotSelector) {
    const knob = document.getElementById(knobId);
    if (!knob) return;
    
    const container = knob.parentElement;
    const slots = container.querySelectorAll(slotSelector);
    let currentSlot = null;
    let pointerId = null;
    let initialX = 0, initialY = 0;
    
    // Position knob in center by default
    knob.style.transform = `translate(-50%, -50%)`;
    
    const updateGear = (slotEl) => {
      if (currentSlot) currentSlot.classList.remove('active');
      if (slotEl) {
        slotEl.classList.add('active');
        const gear = slotEl.getAttribute('data-gear');
        this.tx.setGear(gear);
        knob.querySelector('.knob-cap').textContent = slotEl.textContent;
      } else {
        this.tx.setGear('NONE'); // neutral
        knob.querySelector('.knob-cap').textContent = 'N';
      }
      currentSlot = slotEl;
    };
    
    knob.addEventListener('pointerdown', (e) => {
      pointerId = e.pointerId;
      knob.setPointerCapture(pointerId);
      knob.classList.add('active');
      initialX = e.clientX;
      initialY = e.clientY;
    });
    
    knob.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointerId) return;
      e.preventDefault();
      
      const rect = container.getBoundingClientRect();
      let x = e.clientX - rect.left;
      let y = e.clientY - rect.top;
      
      // Clamp to container
      x = Math.max(0, Math.min(rect.width, x));
      y = Math.max(0, Math.min(rect.height, y));
      
      knob.style.left = `${x}px`;
      knob.style.top = `${y}px`;
      
      // Find closest slot
      let closest = null;
      let minDist = 30; // Snap distance threshold
      
      slots.forEach(slot => {
        const slotRect = slot.getBoundingClientRect();
        const slotX = slotRect.left + slotRect.width / 2 - rect.left;
        const slotY = slotRect.top + slotRect.height / 2 - rect.top;
        const dist = Math.hypot(x - slotX, y - slotY);
        if (dist < minDist) {
          minDist = dist;
          closest = slot;
        }
      });
      
      if (closest !== currentSlot) {
        updateGear(closest);
      }
    });
    
    const release = (e) => {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      knob.classList.remove('active');
      try {
        knob.releasePointerCapture(e.pointerId);
      } catch {}
      
      // If not snapped to a slot, spring back to center (Neutral)
      if (!currentSlot) {
        knob.style.left = '50%';
        knob.style.top = '50%';
        updateGear(null);
      } else {
        // Snap exactly to the slot's center
        const rect = container.getBoundingClientRect();
        const slotRect = currentSlot.getBoundingClientRect();
        knob.style.left = `${slotRect.left + slotRect.width / 2 - rect.left}px`;
        knob.style.top = `${slotRect.top + slotRect.height / 2 - rect.top}px`;
      }
    };
    
    knob.addEventListener('pointerup', release);
    knob.addEventListener('pointercancel', release);
    knob.addEventListener('lostpointercapture', release);
    
    // Set initial gear
    updateGear(null);
  }
}
