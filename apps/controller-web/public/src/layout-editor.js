const STORAGE_KEY = 'lan_wheel_layouts_v5';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const DEFAULT_WIDGETS = {
  'hud-wheel': { x: 23, y: 50, scale: 1.0 },
  'hud-transmission': { x: 51, y: 50, scale: 1.0 },
  'hud-pedals': { x: 79, y: 50, scale: 1.0 }
};

export const PRESETS = {
  truck_simulator: {
    name: '🚛 Euro Truck / Xe Tải',
    widgets: {
      'hud-wheel': { x: 23, y: 50, scale: 1.05 },
      'hud-transmission': { x: 51, y: 50, scale: 1.0 },
      'hud-pedals': { x: 79, y: 50, scale: 1.05 }
    },
    items: [
      { id: 'il-1', actionId: 'indicatorLeft', x: 38, y: 15, size: 54, opacity: 1 },
      { id: 'hz-1', actionId: 'hazards', x: 51, y: 15, size: 50, opacity: 1 },
      { id: 'ir-1', actionId: 'indicatorRight', x: 64, y: 15, size: 54, opacity: 1 },
      { id: 'light-1', actionId: 'lowBeam', x: 75, y: 15, size: 54, opacity: 1 },
      { id: 'high-1', actionId: 'highBeam', x: 88, y: 15, size: 54, opacity: 1 },
      { id: 'horn-1', actionId: 'horn', x: 38, y: 35, size: 56, opacity: 1 },
      { id: 'wiper-1', actionId: 'wiperCycle', x: 64, y: 35, size: 54, opacity: 1 },
      { id: 'starter-1', actionId: 'starter', x: 76, y: 35, size: 54, opacity: 1 },
      { id: 'park-1', actionId: 'parkingBrake', x: 89, y: 35, size: 54, opacity: 1 },
      { id: 'diff-1', actionId: 'diffLock', x: 38, y: 55, size: 52, opacity: 1 },
      { id: 'retup-1', actionId: 'retarderUp', x: 73, y: 75, size: 52, opacity: 1 },
      { id: 'retdn-1', actionId: 'retarderDown', x: 83, y: 75, size: 52, opacity: 1 },
      { id: 'engbrk-1', actionId: 'engineBrake', x: 93, y: 75, size: 52, opacity: 1 }
    ]
  },
  default_left: {
    name: '📱 Chuẩn Vô-lăng Trái',
    widgets: {
      'hud-wheel': { x: 23, y: 50, scale: 1.0 },
      'hud-transmission': { x: 51, y: 50, scale: 1.0 },
      'hud-pedals': { x: 79, y: 50, scale: 1.0 }
    },
    items: [
      { id: 'il-1', actionId: 'indicatorLeft', x: 38, y: 15, size: 52, opacity: 1 },
      { id: 'hz-1', actionId: 'hazards', x: 46, y: 15, size: 52, opacity: 1 },
      { id: 'cam-1', actionId: 'camera', x: 54, y: 15, size: 52, opacity: 1 },
      { id: 'ir-1', actionId: 'indicatorRight', x: 62, y: 15, size: 52, opacity: 1 },
      { id: 'horn-1', actionId: 'horn', x: 73, y: 15, size: 56, opacity: 1 },
      { id: 'beam-1', actionId: 'highBeam', x: 88, y: 15, size: 56, opacity: 1 },
      { id: 'nitro-1', actionId: 'nitro', x: 78, y: 34, size: 58, opacity: 1 },
      { id: 'wiper-1', actionId: 'wiperCycle', x: 91, y: 34, size: 58, opacity: 1 }
    ]
  },
  inverted_right: {
    name: '🔄 Đảo Vô-lăng Phải',
    widgets: {
      'hud-pedals': { x: 21, y: 50, scale: 1.0 },
      'hud-transmission': { x: 49, y: 50, scale: 1.0 },
      'hud-wheel': { x: 77, y: 50, scale: 1.0 }
    },
    items: [
      { id: 'beam-1', actionId: 'highBeam', x: 12, y: 15, size: 56, opacity: 1 },
      { id: 'horn-1', actionId: 'horn', x: 27, y: 15, size: 56, opacity: 1 },
      { id: 'nitro-1', actionId: 'nitro', x: 9, y: 34, size: 58, opacity: 1 },
      { id: 'wiper-1', actionId: 'wiperCycle', x: 22, y: 34, size: 58, opacity: 1 },
      { id: 'il-1', actionId: 'indicatorLeft', x: 38, y: 15, size: 52, opacity: 1 },
      { id: 'cam-1', actionId: 'camera', x: 46, y: 15, size: 52, opacity: 1 },
      { id: 'hz-1', actionId: 'hazards', x: 54, y: 15, size: 52, opacity: 1 },
      { id: 'ir-1', actionId: 'indicatorRight', x: 62, y: 15, size: 52, opacity: 1 }
    ]
  },
  arcade_center: {
    name: '🏎️ Arcade Vô-lăng Giữa',
    widgets: {
      'hud-wheel': { x: 50, y: 52, scale: 1.22 },
      'hud-transmission': { x: 50, y: 14, scale: 0.8 },
      'hud-pedals': { x: 84, y: 52, scale: 1.0 }
    },
    items: [
      { id: 'horn-1', actionId: 'horn', x: 14, y: 16, size: 58, opacity: 1 },
      { id: 'nitro-1', actionId: 'nitro', x: 26, y: 16, size: 58, opacity: 1 },
      { id: 'hz-1', actionId: 'hazards', x: 40, y: 16, size: 52, opacity: 1 },
      { id: 'cam-1', actionId: 'camera', x: 50, y: 26, size: 54, opacity: 1 }
    ]
  },
  large_touch: {
    name: '🎮 Nút Lớn Dễ Bấm',
    widgets: {
      'hud-wheel': { x: 24, y: 50, scale: 1.18 },
      'hud-transmission': { x: 50, y: 50, scale: 1.0 },
      'hud-pedals': { x: 78, y: 50, scale: 1.15 }
    },
    items: [
      { id: 'il-1', actionId: 'indicatorLeft', x: 38, y: 18, size: 68, opacity: 1 },
      { id: 'ir-1', actionId: 'indicatorRight', x: 62, y: 18, size: 68, opacity: 1 },
      { id: 'horn-1', actionId: 'horn', x: 74, y: 18, size: 74, opacity: 1 },
      { id: 'beam-1', actionId: 'highBeam', x: 88, y: 18, size: 74, opacity: 1 },
      { id: 'nitro-1', actionId: 'nitro', x: 78, y: 40, size: 78, opacity: 1 },
      { id: 'cam-1', actionId: 'camera', x: 50, y: 18, size: 68, opacity: 1 }
    ]
  }
};

export class LayoutEditor {
  constructor({ stage, layer, palette, onCreate, onEditingChange, onStatus }) {
    this.stage = stage;
    this.layer = layer;
    this.palette = palette;
    this.onCreate = onCreate;
    this.onEditingChange = onEditingChange;
    this.onStatus = onStatus;
    this.profileId = 'generic';
    this.layouts = this.load();
    this.editing = false;
    this.selected = null;
    this.drag = null;

    this.bindAdjusterDOM();
    this.bindCoreDraggables();
  }

  bindAdjusterDOM() {
    this.adjuster = document.getElementById('layout-adjuster');
    this.adjusterTitle = document.getElementById('adjuster-title');
    this.adjusterSizeVal = document.getElementById('adjuster-size-val');
    this.adjusterSizeSlider = document.getElementById('adjuster-size-slider');
    this.adjusterOpacityVal = document.getElementById('adjuster-opacity-val');
    this.adjusterOpacitySlider = document.getElementById('adjuster-opacity-slider');
    this.paletteContainer = document.getElementById('layout-palette-container');

    if (this.adjusterSizeSlider) {
      this.adjusterSizeSlider.addEventListener('input', e => {
        this.setSize(Number(e.target.value));
      });
    }

    if (this.adjusterOpacitySlider) {
      this.adjusterOpacitySlider.addEventListener('input', e => {
        this.setOpacity(Number(e.target.value) / 100);
      });
    }

    document.querySelectorAll('.preset-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const size = Number(chip.dataset.size);
        if (size) this.setSize(size);
      });
    });

    const btnDup = document.getElementById('layout-duplicate');
    if (btnDup) {
      btnDup.addEventListener('click', () => this.duplicateSelected());
    }

    const btnRemove = document.getElementById('layout-remove');
    if (btnRemove) {
      btnRemove.addEventListener('click', () => this.removeSelected());
    }

    const btnTogglePalette = document.getElementById('layout-toggle-palette');
    if (btnTogglePalette) {
      btnTogglePalette.addEventListener('click', () => {
        if (this.paletteContainer) {
          this.paletteContainer.hidden = !this.paletteContainer.hidden;
        }
      });
    }

    const btnClosePalette = document.getElementById('layout-close-palette');
    if (btnClosePalette) {
      btnClosePalette.addEventListener('click', () => {
        if (this.paletteContainer) this.paletteContainer.hidden = true;
      });
    }

    const presetSelect = document.getElementById('layout-preset-select');
    if (presetSelect) {
      presetSelect.addEventListener('change', e => {
        if (e.target.value && PRESETS[e.target.value]) {
          this.applyPreset(e.target.value);
          e.target.value = '';
        }
      });
    }

    const btnResetPreset = document.getElementById('layout-reset-preset');
    if (btnResetPreset) {
      btnResetPreset.addEventListener('click', () => this.resetToDefault());
    }
  }

  bindCoreDraggables() {
    const coreIds = ['hud-wheel', 'hud-transmission', 'hud-pedals'];
    for (const id of coreIds) {
      const el = document.getElementById(id);
      if (!el) continue;

      el.addEventListener('pointerdown', event => {
        if (!this.editing) return;
        event.preventDefault();
        event.stopPropagation();

        const currentProfile = this.current();
        if (!currentProfile.widgets) currentProfile.widgets = JSON.parse(JSON.stringify(DEFAULT_WIDGETS));
        if (!currentProfile.widgets[id]) currentProfile.widgets[id] = { x: 50, y: 50, scale: 1.0 };
        const w = currentProfile.widgets[id];

        this.selected = id;
        try { el.setPointerCapture(event.pointerId); } catch {}
        const startPoint = this.toPoint(event.clientX, event.clientY);
        this.drag = {
          type: 'core',
          id,
          pointer: event.pointerId,
          widget: w,
          startPoint,
          origX: w.x,
          origY: w.y
        };
        this.renderSelection();
        this.updateAdjuster();

        const onMove = moveEvent => {
          if (!this.drag || this.drag.type !== 'core' || this.drag.id !== id) return;
          moveEvent.preventDefault();
          const point = this.toPoint(moveEvent.clientX, moveEvent.clientY);
          if (!point || !this.drag.startPoint) return;
          const dx = point.x - this.drag.startPoint.x;
          const dy = point.y - this.drag.startPoint.y;
          w.x = clamp(Math.round((this.drag.origX + dx) * 10) / 10, 2, 98);
          w.y = clamp(Math.round((this.drag.origY + dy) * 10) / 10, 5, 95);
          this.applyWidgetStyle(id, w);
        };

        const onUp = upEvent => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
          try { if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId); } catch {}
          if (!this.drag || this.drag.id !== id) return;
          this.drag = null;
          this.save();
          this.renderSelection();
          this.updateAdjuster();
          this.onStatus?.(`Đã lưu vị trí ${id === 'hud-wheel' ? 'Vô-lăng' : id === 'hud-pedals' ? 'Bàn đạp' : 'Hộp số'}.`);
        };

        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onUp, { passive: false });
        window.addEventListener('pointercancel', onUp, { passive: false });
      }, true);
    }
  }

  load() {
    try {
      const v5 = localStorage.getItem(STORAGE_KEY);
      if (v5) {
        const parsed = JSON.parse(v5);
        if (parsed && typeof parsed === 'object') {
          for (const key of Object.keys(parsed)) {
            if (parsed[key]?.items) {
              parsed[key].items = parsed[key].items.filter(it => it && it.x >= 5 && it.y >= 8 && !(it.x < 15 && it.y < 25));
            }
          }
          return parsed;
        }
      }
      return {};
    } catch {
      return {};
    }
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.layouts));
    } catch (e) {
      console.warn('[LayoutEditor] Failed to save layouts to localStorage:', e);
    }
  }

  current() {
    if (!this.layouts[this.profileId] || !this.layouts[this.profileId].items) {
      if (['ets2', 'ats'].includes(this.profileId)) {
        this.layouts[this.profileId] = {
          version: 5,
          widgets: JSON.parse(JSON.stringify(PRESETS.truck_simulator.widgets)),
          items: JSON.parse(JSON.stringify(PRESETS.truck_simulator.items))
        };
      } else {
        const generic = this.layouts['generic'];
        if (this.profileId !== 'generic' && generic && Array.isArray(generic.items) && generic.items.length > 0) {
          this.layouts[this.profileId] = JSON.parse(JSON.stringify(generic));
        } else {
          this.layouts[this.profileId] = {
            version: 5,
            widgets: JSON.parse(JSON.stringify(DEFAULT_WIDGETS)),
            items: JSON.parse(JSON.stringify(PRESETS.default_left.items))
          };
        }
      }
    }
    if (!this.layouts[this.profileId].widgets || !this.layouts[this.profileId].widgets['hud-wheel']) {
      this.layouts[this.profileId].widgets = JSON.parse(JSON.stringify(DEFAULT_WIDGETS));
    }
    return this.layouts[this.profileId];
  }

  items() {
    return this.current().items || [];
  }

  widgets() {
    return this.current().widgets || DEFAULT_WIDGETS;
  }

  useProfile(profileId) {
    const nextId = profileId || 'generic';
    if (this.profileId === nextId && this.layouts[nextId]) {
      return;
    }
    this.save();
    this.profileId = nextId;
    this.selected = null;
    this.render();
  }

  applyPreset(presetKey) {
    const preset = PRESETS[presetKey];
    if (!preset) return;
    this.layouts[this.profileId] = {
      version: 5,
      widgets: JSON.parse(JSON.stringify(preset.widgets)),
      items: JSON.parse(JSON.stringify(preset.items))
    };
    this.selected = null;
    this.save();
    this.render();
    this.updateAdjuster();
    this.onStatus?.(`Đã áp dụng mẫu bố cục: ${preset.name}`);
  }

  resetToDefault() {
    this.applyPreset('default_left');
  }

  setEditing(value) {
    this.editing = !!value;
    this.stage.classList.toggle('layout-editing', this.editing);
    this.selected = null;
    this.save();
    this.render();
    this.updateAdjuster();
    if (!this.editing && this.paletteContainer) {
      this.paletteContainer.hidden = true;
    }
    this.onEditingChange?.(this.editing);
    this.onStatus?.(
      this.editing
        ? 'Chế độ chỉnh bố cục: Chạm vô-lăng, bàn đạp, hộp số hoặc nút bất kỳ để kéo đổi vị trí & chỉnh kích thước.'
        : 'Bố cục đã lưu thành công trên thiết bị.'
    );
  }

  setPalette(actions, groups) {
    this.palette.replaceChildren();
    for (const [group, label] of Object.entries(groups)) {
      const section = document.createElement('section'),
        title = document.createElement('h3'),
        row = document.createElement('div');
      section.className = 'palette-group';
      title.textContent = label;
      row.className = 'palette-row';
      section.append(title, row);

      for (const action of actions.filter(item => item.group === group)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'palette-action';
        button.dataset.action = action.id;
        button.innerHTML = `<span>${this.shortLabel(action)}</span><small>Chạm / kéo</small>`;

        this.bindPaletteDrag(button, action);
        row.append(button);
      }
      if (row.children.length) this.palette.append(section);
    }
  }

  shortLabel(action) {
    const aliases = {
      indicatorLeft: '← Xi-nhan',
      indicatorRight: 'Xi-nhan →',
      lowBeam: 'Đèn cos',
      highBeam: 'Đèn pha',
      flash: 'Đá pha',
      hazards: '⚠ Khẩn cấp',
      horn: '📢 Còi',
      wiperCycle: '🌧️ Gạt mưa',
      parkingBrake: '🅿️ Phanh đỗ',
      cruise: 'Cruise',
      camera: '🎥 Camera',
      lookBack: '👁️ Nhìn sau',
      resetVehicle: '🔄 Reset xe',
      shiftUp: '🔼 Lên số',
      shiftDown: '🔽 Xuống số',
      handbrake: '⚠️ Phanh tay'
    };
    return aliases[action.id] || action.label;
  }

  bindPaletteDrag(button, action) {
    button.addEventListener('pointerdown', event => {
      if (!this.editing) return;
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      const ghost = button.cloneNode(true);
      ghost.className = 'layout-ghost';
      document.body.append(ghost);
      this.drag = {
        type: 'new',
        pointer: event.pointerId,
        action,
        ghost,
        moved: false,
        startX: event.clientX,
        startY: event.clientY
      };
      this.moveGhost(event.clientX, event.clientY);
    });

    button.addEventListener('pointermove', event => {
      if (this.drag?.pointer !== event.pointerId || this.drag.type !== 'new') return;
      this.drag.moved ||= Math.hypot(event.clientX - this.drag.startX, event.clientY - this.drag.startY) > 6;
      this.moveGhost(event.clientX, event.clientY);
    });

    const finish = event => {
      if (this.drag?.pointer !== event.pointerId || this.drag.type !== 'new') return;
      const drag = this.drag;
      this.drag = null;
      drag.ghost.remove();
      const point = this.toPoint(event.clientX, event.clientY);
      if (!drag.moved) this.add(action.id, 50, 45);
      else if (point) this.add(action.id, point.x, point.y);
    };

    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      button.addEventListener(name, finish);
    }
  }

  moveGhost(x, y) {
    if (this.drag?.ghost) {
      this.drag.ghost.style.left = x + 'px';
      this.drag.ghost.style.top = y + 'px';
    }
  }

  toPoint(clientX, clientY) {
    const rect = this.stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: clamp(Math.round(((clientX - rect.left) / rect.width) * 1000) / 10, 6, 94),
      y: clamp(Math.round(((clientY - rect.top) / rect.height) * 1000) / 10, 8, 92)
    };
  }

  add(actionId, x = 50, y = 45) {
    const items = this.items();
    let finalX = Number.isFinite(x) ? x : 50;
    let finalY = Number.isFinite(y) ? y : 45;
    if (finalX === 50 && finalY === 45) {
      const offset = (items.length % 6) * 6;
      finalX = clamp(42 + offset, 15, 85);
      finalY = clamp(36 + (Math.floor(items.length / 6) * 10), 16, 75);
    }
    const item = {
      id: 'btn-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 5),
      actionId,
      x: clamp(Math.round(finalX * 10) / 10, 4, 96),
      y: clamp(Math.round(finalY * 10) / 10, 6, 94),
      size: 60,
      opacity: 1
    };
    items.push(item);
    this.selected = item.id;
    this.save();
    this.render();
    this.updateAdjuster();
    this.onStatus?.('Đã thêm nút mới. Kéo để đổi vị trí hoặc chạm nút để chỉnh kích thước.');
  }

  duplicateSelected() {
    if (!this.selected) return;
    const current = this.items().find(item => item.id === this.selected);
    if (!current) return;

    const newItem = {
      ...current,
      id: 'btn-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 5),
      x: clamp(current.x + 5, 5, 95),
      y: clamp(current.y + 5, 8, 92)
    };

    this.items().push(newItem);
    this.selected = newItem.id;
    this.save();
    this.render();
    this.updateAdjuster();
    this.onStatus?.('📋 Đã nhân bản nút dự phòng! Bạn có thể kéo nút này sang tay còn lại.');
  }

  removeSelected() {
    if (!this.selected) return;
    if (['hud-wheel', 'hud-transmission', 'hud-pedals'].includes(this.selected)) {
      this.onStatus?.('Không thể xóa module điều khiển chính.');
      return;
    }
    this.current().items = this.items().filter(item => item.id !== this.selected);
    this.selected = null;
    this.save();
    this.render();
    this.updateAdjuster();
    this.onStatus?.('Đã xóa nút.');
  }

  setSize(size) {
    if (!this.selected) return;
    if (['hud-wheel', 'hud-transmission', 'hud-pedals'].includes(this.selected)) {
      const w = this.widgets()[this.selected];
      if (!w) return;
      w.scale = clamp(Math.round(size) / 100, 0.5, 1.8);
      this.save();
      this.applyWidgetStyle(this.selected, w);
      this.updateAdjuster();
      window.dispatchEvent(new Event('resize'));
      return;
    }

    const item = this.items().find(v => v.id === this.selected);
    if (!item) return;
    item.size = clamp(Math.round(size), 36, 140);
    this.save();
    this.applyItemStyle(item);
    this.updateAdjuster();
  }

  resizeSelected(delta) {
    if (!this.selected) return;
    if (['hud-wheel', 'hud-transmission', 'hud-pedals'].includes(this.selected)) {
      const w = this.widgets()[this.selected];
      if (!w) return;
      this.setSize(Math.round((w.scale || 1.0) * 100) + delta);
      return;
    }
    const item = this.items().find(v => v.id === this.selected);
    if (!item) return;
    this.setSize((item.size || 60) + delta);
  }

  setOpacity(opacity) {
    const item = this.items().find(v => v.id === this.selected);
    if (!item) return;
    item.opacity = clamp(Math.round(opacity * 100) / 100, 0.3, 1.0);
    this.save();
    this.applyItemStyle(item);
    this.updateAdjuster();
  }

  clear() {
    this.current().items = [];
    this.selected = null;
    this.save();
    this.render();
    this.updateAdjuster();
    this.onStatus?.('Đã xóa toàn bộ nút tùy chỉnh của profile này.');
  }

  updateAdjuster() {
    if (!this.adjuster) return;
    if (!this.editing || !this.selected) {
      this.adjuster.hidden = true;
      return;
    }

    const isCore = ['hud-wheel', 'hud-transmission', 'hud-pedals'].includes(this.selected);
    const btnDup = document.getElementById('layout-duplicate');
    const btnRemove = document.getElementById('layout-remove');
    const opacityGroup = this.adjuster.querySelector('.opacity-group');
    const chipRow = this.adjuster.querySelector('.size-presets');

    if (btnDup) btnDup.hidden = isCore;
    if (btnRemove) btnRemove.hidden = isCore;
    if (opacityGroup) opacityGroup.hidden = isCore;

    if (isCore) {
      const w = this.widgets()[this.selected] || { scale: 1.0 };
      const scalePct = Math.round((w.scale || 1.0) * 100);
      const names = {
        'hud-wheel': '🏎️ VÔ-LĂNG',
        'hud-pedals': '🛑 BÀN ĐẠP (GA / PHANH / CÔN)',
        'hud-transmission': '🕹️ HỘP SỐ & CẦN SỐ'
      };
      if (this.adjusterTitle) this.adjusterTitle.textContent = `⚙️ Đang chỉnh: ${names[this.selected]}`;
      if (this.adjusterSizeVal) this.adjusterSizeVal.textContent = `${scalePct}% (Tỉ lệ)`;
      if (this.adjusterSizeSlider) {
        this.adjusterSizeSlider.min = '50';
        this.adjusterSizeSlider.max = '180';
        this.adjusterSizeSlider.step = '2';
        this.adjusterSizeSlider.value = String(scalePct);
      }
      if (chipRow) {
        chipRow.innerHTML = `
          <button type="button" class="preset-chip ${scalePct===75?'active':''}" data-size="75">Nhỏ 75%</button>
          <button type="button" class="preset-chip ${scalePct===100?'active':''}" data-size="100">Chuẩn 100%</button>
          <button type="button" class="preset-chip ${scalePct===125?'active':''}" data-size="125">Lớn 125%</button>
          <button type="button" class="preset-chip ${scalePct===150?'active':''}" data-size="150">Cực lớn 150%</button>
        `;
        chipRow.querySelectorAll('.preset-chip').forEach(chip => {
          chip.onclick = () => this.setSize(Number(chip.dataset.size));
        });
      }
      this.adjuster.hidden = false;
      return;
    }

    const item = this.items().find(v => v.id === this.selected);
    if (!item) {
      this.adjuster.hidden = true;
      return;
    }

    this.adjuster.hidden = false;
    const actionLabel = this.shortLabel({ id: item.actionId, label: item.actionId });
    if (this.adjusterTitle) {
      this.adjusterTitle.textContent = `⚙️ Đang chọn nút: ${actionLabel}`;
    }

    const size = item.size || 60;
    if (this.adjusterSizeVal) {
      this.adjusterSizeVal.textContent = `${size}px`;
    }
    if (this.adjusterSizeSlider) {
      this.adjusterSizeSlider.min = '36';
      this.adjusterSizeSlider.max = '130';
      this.adjusterSizeSlider.step = '2';
      this.adjusterSizeSlider.value = String(size);
    }

    const opacity = item.opacity !== undefined ? Math.round(item.opacity * 100) : 100;
    if (this.adjusterOpacityVal) {
      this.adjusterOpacityVal.textContent = `${opacity}%`;
    }
    if (this.adjusterOpacitySlider) {
      this.adjusterOpacitySlider.value = String(opacity);
    }

    if (chipRow) {
      chipRow.innerHTML = `
        <button type="button" class="preset-chip ${size===48?'active':''}" data-size="48">Nhỏ 48px</button>
        <button type="button" class="preset-chip ${size===64?'active':''}" data-size="64">Vừa 64px</button>
        <button type="button" class="preset-chip ${size===80?'active':''}" data-size="80">Lớn 80px</button>
        <button type="button" class="preset-chip ${size===100?'active':''}" data-size="100">Cực lớn 100px</button>
      `;
      chipRow.querySelectorAll('.preset-chip').forEach(chip => {
        chip.onclick = () => this.setSize(Number(chip.dataset.size));
      });
    }
  }

  applyWidgetStyle(id, w) {
    const el = document.getElementById(id);
    if (!el || !w) return;
    el.style.setProperty('--x', w.x + '%');
    el.style.setProperty('--y', w.y + '%');
    el.style.setProperty('--widget-scale', String(w.scale !== undefined ? w.scale : 1.0));
  }

  applyItemStyle(item, targetBtn = null) {
    const button = targetBtn || this.layer.querySelector(`[data-layout-id="${item.id}"]`);
    if (!button) return;
    const x = Number.isFinite(item.x) ? item.x : 50;
    const y = Number.isFinite(item.y) ? item.y : 45;
    button.style.left = x + '%';
    button.style.top = y + '%';
    button.style.setProperty('--control-size', (item.size || 60) + 'px');
    button.style.setProperty('--control-opacity', String(item.opacity !== undefined ? item.opacity : 1));
  }

  render() {
    const widgets = this.widgets();
    for (const [id, w] of Object.entries(widgets)) {
      this.applyWidgetStyle(id, w);
    }

    this.layer.replaceChildren();
    for (const item of this.items()) {
      const button = this.onCreate(item.actionId);
      if (!button) continue;
      const unavailable = button.disabled;
      if (this.editing) button.disabled = false;
      button.classList.add('layout-action');
      button.dataset.layoutId = item.id;
      button.classList.toggle('layout-unavailable', unavailable);
      this.bindExistingDrag(button, item);
      this.layer.append(button);
      this.applyItemStyle(item, button);
      button.classList.toggle('layout-selected', this.editing && item.id === this.selected);
    }
    this.renderSelection();
  }

  bindExistingDrag(button, item) {
    button.addEventListener(
      'pointerdown',
      event => {
        if (!this.editing) return;
        event.preventDefault();
        event.stopPropagation();
        this.selected = item.id;
        try { button.setPointerCapture(event.pointerId); } catch {}
        const startPoint = this.toPoint(event.clientX, event.clientY);
        this.drag = {
          type: 'existing',
          pointer: event.pointerId,
          item,
          startPoint,
          origX: item.x,
          origY: item.y
        };
        this.renderSelection();
        this.updateAdjuster();

        const onMove = moveEvent => {
          if (!this.drag || this.drag.type !== 'existing' || this.drag.item !== item) return;
          moveEvent.preventDefault();
          const point = this.toPoint(moveEvent.clientX, moveEvent.clientY);
          if (!point || !this.drag.startPoint) return;
          const dx = point.x - this.drag.startPoint.x;
          const dy = point.y - this.drag.startPoint.y;
          item.x = clamp(Math.round((this.drag.origX + dx) * 10) / 10, 2, 98);
          item.y = clamp(Math.round((this.drag.origY + dy) * 10) / 10, 5, 95);
          button.style.left = item.x + '%';
          button.style.top = item.y + '%';
        };

        const onUp = upEvent => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          window.removeEventListener('pointercancel', onUp);
          try { if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId); } catch {}
          if (!this.drag || this.drag.item !== item) return;
          this.drag = null;
          this.save();
          this.renderSelection();
          this.updateAdjuster();
          this.onStatus?.('Đã lưu vị trí nút.');
        };

        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onUp, { passive: false });
        window.addEventListener('pointercancel', onUp, { passive: false });
      },
      true
    );
  }

  renderSelection() {
    const coreIds = ['hud-wheel', 'hud-transmission', 'hud-pedals'];
    for (const id of coreIds) {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('layout-selected', this.editing && id === this.selected);
    }
    for (const button of this.layer.children) {
      button.classList.toggle('layout-selected', this.editing && button.dataset.layoutId === this.selected);
    }
  }
}

