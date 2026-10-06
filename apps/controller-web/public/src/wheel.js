import {AutoCenterSpring} from './control-math.js';

export class SteeringWheel {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    this.currentAngle = 0;
    this.rawAngle = 0;
    this.lastDrawnAngle = null;
    this.pointerId = null;
    this.maxHalfAngle = (options.steeringRangeDeg || 900) / 2;
    this.spring = new AutoCenterSpring({ durationMs: options.autoCenterMs || 400 });
    this.isDragging = false;
    this.enabled = true;
    this.size = 250;
    this.dpr = 1;
    this.centerX = 0;
    this.centerY = 0;

    // Pre-allocated offscreen cache canvases
    this.bgCanvas = document.createElement('canvas');
    this.bgCtx = this.bgCanvas.getContext('2d');
    this.wheelCanvas = document.createElement('canvas');
    this.wheelCtx = this.wheelCanvas.getContext('2d');

    new ResizeObserver(() => {
      this.initCanvas();
      this.draw(true);
    }).observe(canvas.parentElement);

    canvas.addEventListener('pointerdown', (e) => {
      if (window.app?.layoutEditor?.editing) return;
      if (this.pointerId !== null) return;
      e.preventDefault();
      this.pointerId = e.pointerId;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {}
      this.isDragging = true;
      this.spring.stop();
      this.updateCenter();
      this.last = this.angle(e);
      this.rawAngle = this.currentAngle;
    });

    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.pointerId) return;
      e.preventDefault();
      const next = this.angle(e);
      let delta = next - this.last;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      this.rawAngle = Math.max(-this.maxHalfAngle, Math.min(this.maxHalfAngle, this.rawAngle + delta));
      this.currentAngle = this.rawAngle;
      this.last = next;
    }, { passive: false });

    canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    canvas.addEventListener('touchstart', e => {
      if (e.touches && e.touches.length > 1) e.preventDefault();
    }, { passive: false });

    const release = (e) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.isDragging = false;
      try {
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      } catch {}
      this.spring.start(this.currentAngle);
    };

    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(event, release);
    this.initCanvas();
    this.draw(true);
  }

  updateCenter() {
    const r = this.canvas.getBoundingClientRect();
    this.rect = r;
    this.centerX = r.left + r.width / 2;
    this.centerY = r.top + r.height / 2;
  }

  angle(e) {
    return Math.atan2(e.clientY - this.centerY, e.clientX - this.centerX) * 180 / Math.PI;
  }

  initCanvas() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const r = parent.getBoundingClientRect();
    this.rect = r;
    this.size = Math.max(100, Math.min(r.width, r.height, 460));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixelSize = Math.round(this.size * this.dpr);

    this.canvas.width = pixelSize;
    this.canvas.height = pixelSize;
    this.canvas.style.width = this.size + 'px';
    this.canvas.style.height = this.size + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.bgCanvas.width = pixelSize;
    this.bgCanvas.height = pixelSize;
    this.bgCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.wheelCanvas.width = pixelSize;
    this.wheelCanvas.height = pixelSize;
    this.wheelCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.updateCenter();
    this.buildCache();
    this.lastDrawnAngle = null;
  }

  buildCache() {
    const s = this.size;
    const r = s * 0.435; // Generous diameter with precision clearance
    const rimWidth = s * 0.092; // Substantial, chunky GT3 racing wheel rim

    // 1. Static Telemetry & Column Hub Layer (bgCtx)
    const bg = this.bgCtx;
    bg.clearRect(0, 0, s, s);
    bg.save();
    bg.translate(s / 2, s / 2);

    // Subtle dark circular housing
    const colGrad = bg.createRadialGradient(0, 0, s * 0.05, 0, 0, r * 0.75);
    colGrad.addColorStop(0, '#101518');
    colGrad.addColorStop(0.6, '#080c0e');
    colGrad.addColorStop(1, 'transparent');
    bg.fillStyle = colGrad;
    bg.beginPath();
    bg.arc(0, 0, r * 0.75, 0, Math.PI * 2);
    bg.fill();

    // Fine interior reference track (subtle, pro-simulator telemetry)
    bg.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    bg.lineWidth = 1;
    bg.beginPath();
    bg.arc(0, 0, r - rimWidth * 0.65, 0, Math.PI * 2);
    bg.stroke();

    // 12 subtle interior angle graduation marks (every 30 deg)
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      const isMajor = i % 3 === 0;
      bg.strokeStyle = isMajor ? 'rgba(0, 245, 155, 0.35)' : 'rgba(255, 255, 255, 0.1)';
      bg.lineWidth = isMajor ? 1.5 : 1;
      const rInner = r - rimWidth * (isMajor ? 0.95 : 0.82);
      const rOuter = r - rimWidth * 0.68;
      bg.beginPath();
      bg.moveTo(Math.cos(a) * rInner, Math.sin(a) * rInner);
      bg.lineTo(Math.cos(a) * rOuter, Math.sin(a) * rOuter);
      bg.stroke();
    }
    bg.restore();

    // 2. Rotating Wheel Layer (Modern GT3 / Fanatec Hypercar Wheel)
    const w = this.wheelCtx;
    w.clearRect(0, 0, s, s);
    w.save();
    w.translate(s / 2, s / 2);

    // Deep outer 3D drop shadow
    w.strokeStyle = 'rgba(0, 0, 0, 0.65)';
    w.lineWidth = rimWidth + 4;
    w.beginPath();
    w.arc(0, 2, r, 0, Math.PI * 2);
    w.stroke();

    // Premium Perforated Leather & Carbon Rim Core
    const rimGrad = w.createLinearGradient(-r, -r, r, r);
    rimGrad.addColorStop(0, '#2d373c');
    rimGrad.addColorStop(0.25, '#13191c');
    rimGrad.addColorStop(0.5, '#354148');
    rimGrad.addColorStop(0.75, '#12171a');
    rimGrad.addColorStop(1, '#2a3338');
    w.strokeStyle = rimGrad;
    w.lineWidth = rimWidth;
    w.beginPath();
    w.arc(0, 0, r, 0, Math.PI * 2);
    w.stroke();

    // Outer & Inner Precision Trim Bezels
    w.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    w.lineWidth = 1;
    w.beginPath();
    w.arc(0, 0, r + rimWidth * 0.48, 0, Math.PI * 2);
    w.stroke();
    w.beginPath();
    w.arc(0, 0, r - rimWidth * 0.48, 0, Math.PI * 2);
    w.stroke();

    // Ergonomic 9:15 and 2:45 Palm Grips (Sculpted Contours)
    for (const a of [Math.PI, 0]) {
      // Grip base pad
      w.strokeStyle = '#182126';
      w.lineWidth = rimWidth + 4;
      w.beginPath();
      w.arc(0, 0, r, a - 0.28, a + 0.28);
      w.stroke();

      // Precision Neon Twin-Stitching Highlights
      w.strokeStyle = 'rgba(0, 245, 155, 0.7)';
      w.lineWidth = 1.2;
      for (const offset of [-0.25, -0.15, 0.15, 0.25]) {
        const sa = a + offset;
        const r1 = r - rimWidth * 0.42;
        const r2 = r + rimWidth * 0.42;
        w.beginPath();
        w.moveTo(Math.cos(sa) * r1, Math.sin(sa) * r1);
        w.lineTo(Math.cos(sa) * r2, Math.sin(sa) * r2);
        w.stroke();
      }
    }

    // Cylindrical Specular Upper Sheen
    w.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    w.lineWidth = 2;
    w.beginPath();
    w.arc(0, 0, r, Math.PI * 0.85, Math.PI * 2.15);
    w.stroke();

    // CNC Machined Titanium Skeleton Spokes
    const spokeGrad = w.createLinearGradient(-r, 0, r, s * 0.18);
    spokeGrad.addColorStop(0, '#222b30');
    spokeGrad.addColorStop(0.5, '#4a5962');
    spokeGrad.addColorStop(1, '#232c32');
    w.fillStyle = spokeGrad;
    w.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    w.lineWidth = 1;

    // Left Horizontal Spoke
    w.beginPath();
    w.moveTo(-r + rimWidth * 0.35, -s * 0.024);
    w.lineTo(-s * 0.09, -s * 0.042);
    w.lineTo(-s * 0.075, s * 0.045);
    w.lineTo(-r + rimWidth * 0.35, s * 0.028);
    w.closePath();
    w.fill();
    w.stroke();

    // Right Horizontal Spoke
    w.beginPath();
    w.moveTo(r - rimWidth * 0.35, -s * 0.024);
    w.lineTo(s * 0.09, -s * 0.042);
    w.lineTo(s * 0.075, s * 0.045);
    w.lineTo(r - rimWidth * 0.35, s * 0.028);
    w.closePath();
    w.fill();
    w.stroke();

    // Lower Vertical Spoke
    w.beginPath();
    w.moveTo(-s * 0.055, s * 0.05);
    w.lineTo(s * 0.055, s * 0.05);
    w.lineTo(s * 0.036, r - rimWidth * 0.35);
    w.lineTo(-s * 0.036, r - rimWidth * 0.35);
    w.closePath();
    w.fill();
    w.stroke();

    // Spoke Weight-Reduction Cutout Slots
    w.fillStyle = '#080c0e';
    for (const dir of [-1, 1]) {
      w.beginPath();
      w.ellipse(dir * (r * 0.52), s * 0.003, s * 0.052, s * 0.009, dir * 0.05, 0, Math.PI * 2);
      w.fill();
    }
    w.beginPath();
    w.ellipse(0, r * 0.56, s * 0.012, s * 0.05, 0, 0, Math.PI * 2);
    w.fill();

    // 12-o'clock Racing Center Alignment Stripe (High-Visibility Hyper-Cyan/Lime)
    w.fillStyle = '#000000';
    w.fillRect(-s * 0.018, -r - rimWidth * 0.52, s * 0.036, rimWidth * 1.04);
    w.fillStyle = '#00f59b';
    w.fillRect(-s * 0.012, -r - rimWidth * 0.52, s * 0.024, rimWidth * 1.04);

    // Center Hub (Concentric Brushed Titanium & Carbon Center Cap)
    const hubGrad = w.createRadialGradient(-s * 0.02, -s * 0.02, 2, 0, 0, s * 0.095);
    hubGrad.addColorStop(0, '#3e4c54');
    hubGrad.addColorStop(0.4, '#1b2327');
    hubGrad.addColorStop(0.85, '#0e1417');
    hubGrad.addColorStop(1, '#283339');
    w.fillStyle = hubGrad;
    w.beginPath();
    w.arc(0, 0, s * 0.095, 0, Math.PI * 2);
    w.fill();

    // Hub Outer Chamfered Ring
    w.strokeStyle = 'rgba(0, 245, 155, 0.6)';
    w.lineWidth = 1.5;
    w.stroke();

    // 6 Titanium Hex Bolts (at 60 deg increments)
    w.fillStyle = '#8da2ad';
    for (let i = 0; i < 6; i++) {
      const ba = i * Math.PI / 3;
      const bx = Math.cos(ba) * s * 0.078;
      const by = Math.sin(ba) * s * 0.078;
      w.beginPath();
      w.arc(bx, by, s * 0.008, 0, Math.PI * 2);
      w.fill();
      w.strokeStyle = '#0a0e10';
      w.lineWidth = 1;
      w.stroke();
    }

    // High-End Emblem (Shield & Racing 'W')
    w.fillStyle = '#ffffff';
    w.font = '800 ' + Math.round(s * 0.04) + 'px Outfit, Inter, system-ui';
    w.textAlign = 'center';
    w.textBaseline = 'middle';
    w.shadowColor = 'rgba(0, 245, 155, 0.6)';
    w.shadowBlur = 6;
    w.fillText('W', 0, s * 0.002);
    w.shadowBlur = 0;

    w.restore();
  }

  setRange(range) {
    this.maxHalfAngle = (range || 900) / 2;
    this.currentAngle = Math.max(-this.maxHalfAngle, Math.min(this.maxHalfAngle, this.currentAngle));
    this.rawAngle = this.currentAngle;
  }

  setAutoCenterDuration(ms) {
    this.spring.durationMs = ms;
  }

  setThrottle() {}

  resetToCenter() {
    const id = this.pointerId;
    this.pointerId = null;
    this.isDragging = false;
    this.spring.stop();
    this.currentAngle = 0;
    this.rawAngle = 0;
    if (id !== null && this.canvas.hasPointerCapture(id)) {
      try {
        this.canvas.releasePointerCapture(id);
      } catch {}
    }
    this.draw(true);
  }

  update(now) {
    if (!this.isDragging && this.spring.isActive) {
      this.currentAngle = this.spring.update(now);
      this.rawAngle = this.currentAngle;
    }
  }

  draw(force = false) {
    if (!force && this.lastDrawnAngle === this.currentAngle) return;
    this.lastDrawnAngle = this.currentAngle;

    const c = this.ctx, s = this.size;
    c.clearRect(0, 0, s, s);

    // 1. Draw static background
    c.drawImage(this.bgCanvas, 0, 0, s, s);

    // 2. Draw rotating wheel
    c.save();
    c.translate(s / 2, s / 2);
    c.rotate(this.currentAngle * Math.PI / 180);
    c.drawImage(this.wheelCanvas, -s / 2, -s / 2, s, s);
    c.restore();
  }
}
