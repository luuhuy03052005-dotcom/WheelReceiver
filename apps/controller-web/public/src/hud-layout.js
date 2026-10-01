/**
 * HUD Layout Manager for LAN Racing Wheel PWA.
 * Enables freeform drag-and-drop, resize, and opacity customization of all cockpit controls,
 * with percentage-based responsive positioning and presets.
 */

const HUD_LAYOUT_KEY = 'lan_wheel_hud_layout_v3';

export const BUTTON_TEMPLATES = {
  'btn-nitro': { type: 'btn-nitro', btnClass: 'nitro-btn', label: '⚡ NITRO (Y)', title: 'Nitro Boost (Y)', btnType: 'Y' },
  'btn-handbrake': { type: 'btn-handbrake', btnClass: 'handbrake-btn', label: '⚠️ E-BRAKE (A)', title: 'Phanh tay (A)', btnType: 'A' },
  'btn-camera': { type: 'btn-camera', btnClass: 'camera-btn', label: '🎥 CAM (RB)', title: 'Đổi góc nhìn (RB)', btnType: 'RB' },
  'btn-clutch-quick': { type: 'btn-clutch-quick', btnClass: 'clutch-quick-btn', label: '⚙️ CÔN (LB)', title: 'Côn tức thì (LB)', btnType: 'LB' },
  'btn-shift-up': { type: 'btn-shift-up', btnClass: 'paddle-up', label: '🔼 SỐ LÊN (B)', title: 'Sang số lên (B)', btnType: 'B' },
  'btn-shift-down': { type: 'btn-shift-down', btnClass: 'paddle-down', label: '🔽 SỐ XUỐNG (X)', title: 'Sang số xuống (X)', btnType: 'X' },
  'btn-throttle': { type: 'btn-throttle', btnClass: 'throttle-btn', label: '🟢 GA', title: 'Chân Ga (Throttle)', btnType: 'THROTTLE' },
  'btn-brake': { type: 'btn-brake', btnClass: 'brake-btn', label: '🔴 PHANH', title: 'Chân Phanh (Brake)', btnType: 'BRAKE' },
  'btn-clutch': { type: 'btn-clutch', btnClass: 'clutch-btn', label: '🟣 CÔN', title: 'Chân Côn (Clutch)', btnType: 'CLUTCH' }
};

export const DEFAULT_HUD_LAYOUT = {
  version: 3,
  widgets: {
    'hud-wheel': { x: 26, y: 52, scale: 1.0, opacity: 1.0, visible: true },
    'hud-telemetry': { x: 26, y: 88, scale: 1.0, opacity: 1.0, visible: true },
    'hud-transmission': { x: 50, y: 22, scale: 1.0, opacity: 1.0, visible: true },
    'hud-auto-shifter': { x: 50, y: 56, scale: 0.9, opacity: 1.0, visible: true },
    'hud-h-shifter': { x: 50, y: 56, scale: 0.9, opacity: 1.0, visible: true },
    'hud-camera': { type: 'btn-camera', x: 62, y: 14, scale: 0.95, opacity: 1.0, visible: true },
    'hud-nitro': { type: 'btn-nitro', x: 76, y: 14, scale: 0.95, opacity: 1.0, visible: true },
    'hud-handbrake': { type: 'btn-handbrake', x: 90, y: 14, scale: 0.95, opacity: 1.0, visible: true },
    'hud-shift-down': { type: 'btn-shift-down', x: 62, y: 30, scale: 0.95, opacity: 1.0, visible: true },
    'hud-clutch-quick': { type: 'btn-clutch-quick', x: 76, y: 30, scale: 0.95, opacity: 1.0, visible: true },
    'hud-shift-up': { type: 'btn-shift-up', x: 90, y: 30, scale: 0.95, opacity: 1.0, visible: true },
    'hud-clutch': { x: 64, y: 68, scale: 0.95, opacity: 1.0, visible: true },
    'hud-brake': { x: 78, y: 68, scale: 0.95, opacity: 1.0, visible: true },
    'hud-throttle': { x: 92, y: 68, scale: 0.95, opacity: 1.0, visible: true }
  }
};

export const PRESET_LAYOUTS = {
  default_mobile: {
    name: '📱 Chuẩn Điện Thoại (Vô lăng Trái)',
    widgets: JSON.parse(JSON.stringify(DEFAULT_HUD_LAYOUT.widgets))
  },
  inverted_mobile: {
    name: '🔄 Đảo Tay Lái (Vô lăng Phải)',
    widgets: {
      'hud-wheel': { x: 74, y: 52, scale: 1.0, opacity: 1.0, visible: true },
      'hud-telemetry': { x: 74, y: 88, scale: 1.0, opacity: 1.0, visible: true },
      'hud-transmission': { x: 50, y: 22, scale: 1.0, opacity: 1.0, visible: true },
      'hud-auto-shifter': { x: 50, y: 56, scale: 0.9, opacity: 1.0, visible: true },
      'hud-h-shifter': { x: 50, y: 56, scale: 0.9, opacity: 1.0, visible: true },
      'hud-handbrake': { type: 'btn-handbrake', x: 10, y: 14, scale: 0.95, opacity: 1.0, visible: true },
      'hud-nitro': { type: 'btn-nitro', x: 24, y: 14, scale: 0.95, opacity: 1.0, visible: true },
      'hud-camera': { type: 'btn-camera', x: 38, y: 14, scale: 0.95, opacity: 1.0, visible: true },
      'hud-shift-down': { type: 'btn-shift-down', x: 10, y: 30, scale: 0.95, opacity: 1.0, visible: true },
      'hud-clutch-quick': { type: 'btn-clutch-quick', x: 24, y: 30, scale: 0.95, opacity: 1.0, visible: true },
      'hud-shift-up': { type: 'btn-shift-up', x: 38, y: 30, scale: 0.95, opacity: 1.0, visible: true },
      'hud-throttle': { x: 8, y: 68, scale: 0.95, opacity: 1.0, visible: true },
      'hud-brake': { x: 22, y: 68, scale: 0.95, opacity: 1.0, visible: true },
      'hud-clutch': { x: 36, y: 68, scale: 0.95, opacity: 1.0, visible: true }
    }
  },
  arcade_center: {
    name: '🏎️ Arcade Pro (Vô lăng Giữa, Phanh Trái, Ga Phải)',
    widgets: {
      'hud-wheel': { x: 50, y: 54, scale: 1.05, opacity: 1.0, visible: true },
      'hud-telemetry': { x: 50, y: 88, scale: 1.0, opacity: 1.0, visible: true },
      'hud-brake': { x: 10, y: 64, scale: 1.1, opacity: 1.0, visible: true },
      'hud-clutch': { x: 22, y: 64, scale: 1.0, opacity: 1.0, visible: true },
      'hud-throttle': { x: 90, y: 64, scale: 1.1, opacity: 1.0, visible: true },
      'hud-handbrake': { type: 'btn-handbrake', x: 78, y: 64, scale: 1.0, opacity: 1.0, visible: true },
      'hud-transmission': { x: 50, y: 22, scale: 1.0, opacity: 1.0, visible: true },
      'hud-auto-shifter': { x: 50, y: 60, scale: 0.9, opacity: 1.0, visible: true },
      'hud-h-shifter': { x: 50, y: 60, scale: 0.9, opacity: 1.0, visible: true },
      'hud-nitro': { type: 'btn-nitro', x: 88, y: 16, scale: 1.0, opacity: 1.0, visible: true },
      'hud-camera': { type: 'btn-camera', x: 12, y: 16, scale: 1.0, opacity: 1.0, visible: true },
      'hud-shift-down': { type: 'btn-shift-down', x: 22, y: 28, scale: 1.0, opacity: 1.0, visible: true },
      'hud-clutch-quick': { type: 'btn-clutch-quick', x: 50, y: 32, scale: 1.0, opacity: 1.0, visible: true },
      'hud-shift-up': { type: 'btn-shift-up', x: 78, y: 28, scale: 1.0, opacity: 1.0, visible: true }
    }
  }
};

export class HUDLayoutManager {
  constructor(containerEl, onLayoutChanged) {
    this.container = containerEl;
    this.onLayoutChanged = onLayoutChanged;
    this.isEditMode = false;
    this.selectedWidgetId = null;

    this.layout = this.loadLayout();
    this.activePointerId = null;
    this.dragTarget = null;
    this.dragOffset = { x: 0, y: 0 };

    this.initDOM();
    this.applyLayout();
  }

  loadLayout() {
    let loaded = JSON.parse(JSON.stringify(DEFAULT_HUD_LAYOUT));
    try {
      const stored = localStorage.getItem(HUD_LAYOUT_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.widgets) {
          loaded.widgets = { ...DEFAULT_HUD_LAYOUT.widgets, ...parsed.widgets };
        }
      }
    } catch {}

    // Migration for old action buttons
    const actionMapping = {
      'hud-nitro': 'btn-nitro',
      'hud-handbrake': 'btn-handbrake',
      'hud-camera': 'btn-camera',
      'hud-clutch-quick': 'btn-clutch-quick',
      'hud-shift-up': 'btn-shift-up',
      'hud-shift-down': 'btn-shift-down'
    };
    
    Object.keys(loaded.widgets).forEach(key => {
       if (actionMapping[key] && !loaded.widgets[key].type) {
         loaded.widgets[key].type = actionMapping[key];
       }
    });

    return loaded;
  }

  saveLayout() {
    localStorage.setItem(HUD_LAYOUT_KEY, JSON.stringify(this.layout));
    if (this.onLayoutChanged) this.onLayoutChanged(this.layout);
  }

  applyPreset(presetKey) {
    const preset = PRESET_LAYOUTS[presetKey];
    if (preset) {
      this.layout.widgets = JSON.parse(JSON.stringify(preset.widgets));
      this.saveLayout();
      this.applyLayout();
    }
  }

  resetToDefault() {
    this.layout = JSON.parse(JSON.stringify(DEFAULT_HUD_LAYOUT));
    this.saveLayout();
    this.applyLayout();
  }

  initDOM() {
    // Toolbar in Edit Mode
    this.editorBar = document.createElement('div');
    this.editorBar.id = 'hud-editor-bar';
    this.editorBar.innerHTML = `
      <div class="hud-editor-header">
        <div class="hud-editor-title-wrap">
          <span class="hud-editor-title">✏️ KÉO THẢ VỊ TRÍ & KÍCH THƯỚC NÚT</span>
        </div>
        <div class="hud-editor-actions">
          <select id="hud-preset-select" class="hud-select" title="Chọn bố cục mẫu">
            <option value="default_mobile">📱 Chuẩn Điện Thoại</option>
            <option value="inverted_mobile">🔄 Đảo Vô Lăng Phải</option>
            <option value="arcade_center">🏎️ Vô Lăng Giữa</option>
          </select>
          <button id="btn-hud-toggle-toolbox" class="hud-btn hud-btn-sec" title="Bật/tắt bảng kéo nút">➕ Thêm Nút</button>
          <button id="btn-hud-minimize" class="hud-btn hud-btn-sec" title="Thu nhỏ thanh công cụ để không bị che nút">🔽 Ẩn Bảng</button>
          <button id="btn-hud-reset" class="hud-btn hud-btn-sec" title="Khôi phục mặc định">🔄 Reset</button>
          <button id="btn-hud-save" class="hud-btn hud-btn-pri" title="Lưu và khóa vị trí">💾 Xong / Lưu</button>
        </div>
      </div>
      
      <div id="hud-toolbox" class="hud-toolbox" style="display: none;">
        <div class="hud-toolbox-title">Kéo nút mới ra màn hình:</div>
        <div class="hud-toolbox-items">
          ${Object.values(BUTTON_TEMPLATES).map(t => 
            `<div class="toolbox-item" draggable="true" data-template="${t.type}">
              <button class="cockpit-btn ${t.btnClass}" style="transform: scale(0.6); pointer-events: none;"><span>${t.label}</span></button>
            </div>`
          ).join('')}
        </div>
      </div>

      <div id="hud-widget-adjuster" style="display: none;">
        <span id="hud-selected-name" style="font-weight: 800; color: #38bdf8; font-size: 12px;">Đang chọn nút</span>
        <div class="hud-adj-row">
          <label>Kích thước (Scale): <span id="val-widget-scale">100%</span></label>
          <input type="range" id="slider-widget-scale" min="60" max="180" step="5" value="100">
        </div>
        <div class="hud-adj-row">
          <label>Độ mờ (Opacity): <span id="val-widget-opacity">100%</span></label>
          <input type="range" id="slider-widget-opacity" min="30" max="100" step="5" value="100">
        </div>
        <button id="btn-hud-delete-widget" class="hud-btn" style="background:#ef4444; margin-left:10px; display:none;">🗑️ Xóa Nút</button>
      </div>
    `;
    this.container.appendChild(this.editorBar);

    // Floating Minimized Pill when toolbar is hidden
    this.miniPill = document.createElement('div');
    this.miniPill.id = 'hud-minimized-pill';
    this.miniPill.className = 'hud-minimized-pill';
    this.miniPill.style.display = 'none';
    this.miniPill.innerHTML = `
      <button id="btn-hud-expand" class="hud-mini-btn expand" title="Mở lại bảng tùy chỉnh">⚙️ Mở Bảng Chỉnh Nút</button>
      <button id="btn-hud-mini-save" class="hud-mini-btn save" title="Lưu và thoát">💾 Xong</button>
    `;
    this.container.appendChild(this.miniPill);

    const btnSave = this.editorBar.querySelector('#btn-hud-save');
    const btnReset = this.editorBar.querySelector('#btn-hud-reset');
    const btnMinimize = this.editorBar.querySelector('#btn-hud-minimize');
    const btnToggleToolbox = this.editorBar.querySelector('#btn-hud-toggle-toolbox');
    const btnExpand = this.miniPill.querySelector('#btn-hud-expand');
    const btnMiniSave = this.miniPill.querySelector('#btn-hud-mini-save');
    const presetSelect = this.editorBar.querySelector('#hud-preset-select');
    const sliderScale = this.editorBar.querySelector('#slider-widget-scale');
    const sliderOpacity = this.editorBar.querySelector('#slider-widget-opacity');
    const btnDelete = this.editorBar.querySelector('#btn-hud-delete-widget');

    btnSave.addEventListener('click', () => this.setEditMode(false));
    btnMiniSave.addEventListener('click', () => this.setEditMode(false));
    btnReset.addEventListener('click', () => this.resetToDefault());
    presetSelect.addEventListener('change', (e) => this.applyPreset(e.target.value));
    
    if (btnToggleToolbox) {
      btnToggleToolbox.addEventListener('click', () => {
        const toolbox = this.editorBar.querySelector('#hud-toolbox');
        if (toolbox) toolbox.style.display = toolbox.style.display === 'none' ? 'flex' : 'none';
      });
    }

    btnMinimize.addEventListener('click', () => {
      this.editorBar.classList.remove('active');
      this.miniPill.style.display = 'flex';
      const toolbox = this.editorBar.querySelector('#hud-toolbox');
      if (toolbox) toolbox.style.display = 'none'; // Auto hide toolbox on minimize
    });

    btnExpand.addEventListener('click', () => {
      this.miniPill.style.display = 'none';
      this.editorBar.classList.add('active');
    });

    sliderScale.addEventListener('input', (e) => {
      if (this.selectedWidgetId && this.layout.widgets[this.selectedWidgetId]) {
        const val = Number(e.target.value) / 100;
        this.layout.widgets[this.selectedWidgetId].scale = val;
        this.editorBar.querySelector('#val-widget-scale').textContent = `${e.target.value}%`;
        this.applyWidgetStyle(this.selectedWidgetId);
        this.saveLayout();
      }
    });

    sliderOpacity.addEventListener('input', (e) => {
      if (this.selectedWidgetId && this.layout.widgets[this.selectedWidgetId]) {
        const val = Number(e.target.value) / 100;
        this.layout.widgets[this.selectedWidgetId].opacity = val;
        this.editorBar.querySelector('#val-widget-opacity').textContent = `${e.target.value}%`;
        this.applyWidgetStyle(this.selectedWidgetId);
        this.saveLayout();
      }
    });

    btnDelete.addEventListener('click', () => {
      if (this.selectedWidgetId && this.layout.widgets[this.selectedWidgetId]) {
        delete this.layout.widgets[this.selectedWidgetId];
        this.selectedWidgetId = null;
        this.saveLayout();
        this.applyLayout();
        this.editorBar.querySelector('#hud-widget-adjuster').style.display = 'none';
      }
    });

    this.bindToolboxDrag();
    this.bindWidgetDraggables();
  }

  bindToolboxDrag() {
    const items = this.editorBar.querySelectorAll('.toolbox-item');
    let draggedTemplate = null;

    items.forEach(item => {
      item.addEventListener('touchstart', (e) => {
        draggedTemplate = item.getAttribute('data-template');
        e.dataTransfer = { setData: () => {} }; // polyfill
      }, { passive: true });

      item.addEventListener('dragstart', (e) => {
        draggedTemplate = item.getAttribute('data-template');
        e.dataTransfer.setData('text/plain', draggedTemplate);
      });
    });

    this.container.addEventListener('dragover', (e) => {
      e.preventDefault(); // allow drop
    });

    this.container.addEventListener('drop', (e) => {
      e.preventDefault();
      const templateType = e.dataTransfer.getData('text/plain') || draggedTemplate;
      if (!templateType) return;

      const rect = this.container.getBoundingClientRect();
      const xPct = (e.clientX - rect.left) / rect.width * 100;
      const yPct = (e.clientY - rect.top) / rect.height * 100;

      const newId = 'hud-dyn-' + Date.now();
      this.layout.widgets[newId] = {
        type: templateType,
        x: Math.round(xPct * 10) / 10,
        y: Math.round(yPct * 10) / 10,
        scale: 1.0,
        opacity: 1.0,
        visible: true
      };

      this.saveLayout();
      this.applyLayout();
      this.selectWidget(newId);
      draggedTemplate = null;
    });

    // Touch support for drop
    let touchDragging = false;
    let touchEl = null;
    
    items.forEach(item => {
      item.addEventListener('touchmove', (e) => {
        if (!draggedTemplate) return;
        e.preventDefault(); // Prevent scroll while dragging
        touchDragging = true;
        
        if (!touchEl) {
          touchEl = item.cloneNode(true);
          touchEl.style.position = 'absolute';
          touchEl.style.zIndex = '9999';
          touchEl.style.opacity = '0.7';
          document.body.appendChild(touchEl);
        }
        
        const touch = e.touches[0];
        touchEl.style.left = touch.clientX - 20 + 'px';
        touchEl.style.top = touch.clientY - 20 + 'px';
      }, { passive: false });

      item.addEventListener('touchend', (e) => {
        if (!touchDragging || !draggedTemplate) {
          draggedTemplate = null;
          return;
        }
        
        const touch = e.changedTouches[0];
        const rect = this.container.getBoundingClientRect();
        
        if (touch.clientY < rect.bottom && touch.clientY > rect.top) {
          const xPct = (touch.clientX - rect.left) / rect.width * 100;
          const yPct = (touch.clientY - rect.top) / rect.height * 100;

          const newId = 'hud-dyn-' + Date.now();
          this.layout.widgets[newId] = {
            type: draggedTemplate,
            x: Math.round(xPct * 10) / 10,
            y: Math.round(yPct * 10) / 10,
            scale: 1.0,
            opacity: 1.0,
            visible: true
          };

          this.saveLayout();
          this.applyLayout();
          this.selectWidget(newId);
        }
        
        if (touchEl) {
          touchEl.remove();
          touchEl = null;
        }
        touchDragging = false;
        draggedTemplate = null;
      });
    });
  }

  bindWidgetDraggables(elements = null) {
    const widgets = elements || this.container.querySelectorAll('.hud-widget:not(.bound-drag)');
    widgets.forEach((widget) => {
      widget.classList.add('bound-drag');
      
      widget.addEventListener('pointerdown', (e) => {
        if (!this.isEditMode) return;
        const widgetId = widget.id;
        if (!this.layout.widgets[widgetId]) return;

        e.stopPropagation();
        e.preventDefault();

        this.selectWidget(widgetId);
        this.activePointerId = e.pointerId;
        this.dragTarget = widget;

        try { widget.setPointerCapture(e.pointerId); } catch {}

        const rect = this.container.getBoundingClientRect();
        const widgetRect = widget.getBoundingClientRect();

        const currentX = (widgetRect.left + widgetRect.width / 2 - rect.left) / rect.width * 100;
        const currentY = (widgetRect.top + widgetRect.height / 2 - rect.top) / rect.height * 100;

        const pointerPctX = (e.clientX - rect.left) / rect.width * 100;
        const pointerPctY = (e.clientY - rect.top) / rect.height * 100;

        this.dragOffset = {
          x: pointerPctX - currentX,
          y: pointerPctY - currentY
        };
      });

      widget.addEventListener('pointermove', (e) => {
        if (!this.isEditMode || this.activePointerId !== e.pointerId || !this.dragTarget) return;
        const widgetId = widget.id;

        const rect = this.container.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const pointerPctX = (e.clientX - rect.left) / rect.width * 100;
        const pointerPctY = (e.clientY - rect.top) / rect.height * 100;

        let newX = pointerPctX - this.dragOffset.x;
        let newY = pointerPctY - this.dragOffset.y;

        newX = Math.max(4, Math.min(96, newX));
        newY = Math.max(6, Math.min(94, newY));

        this.layout.widgets[widgetId].x = Math.round(newX * 10) / 10;
        this.layout.widgets[widgetId].y = Math.round(newY * 10) / 10;

        this.applyWidgetStyle(widgetId);
      });

      const release = (e) => {
        if (this.activePointerId !== e.pointerId) return;
        this.activePointerId = null;
        this.dragTarget = null;
        try { widget.releasePointerCapture(e.pointerId); } catch {}
        this.saveLayout();
      };

      widget.addEventListener('pointerup', release);
      widget.addEventListener('pointercancel', release);
      widget.addEventListener('lostpointercapture', release);
    });
  }

  selectWidget(widgetId) {
    this.selectedWidgetId = widgetId;
    const allWidgets = this.container.querySelectorAll('.hud-widget');
    allWidgets.forEach((w) => w.classList.remove('hud-selected'));

    const target = document.getElementById(widgetId);
    if (target) target.classList.add('hud-selected');

    const adjuster = this.editorBar.querySelector('#hud-widget-adjuster');
    const nameLbl = this.editorBar.querySelector('#hud-selected-name');
    const sliderScale = this.editorBar.querySelector('#slider-widget-scale');
    const lblScale = this.editorBar.querySelector('#val-widget-scale');
    const sliderOpacity = this.editorBar.querySelector('#slider-widget-opacity');
    const lblOpacity = this.editorBar.querySelector('#val-widget-opacity');
    const btnDelete = this.editorBar.querySelector('#btn-hud-delete-widget');

    const config = this.layout.widgets[widgetId] || { scale: 1.0, opacity: 1.0 };
    const isDynamic = !!config.type;
    btnDelete.style.display = isDynamic ? 'inline-block' : 'none';

    adjuster.style.display = 'flex';
    nameLbl.textContent = `⚙️ Đang chỉnh: ${(config.type || widgetId).replace('hud-', '').toUpperCase()}`;
    sliderScale.value = Math.round((config.scale || 1.0) * 100);
    lblScale.textContent = `${sliderScale.value}%`;
    sliderOpacity.value = Math.round((config.opacity || 1.0) * 100);
    lblOpacity.textContent = `${sliderOpacity.value}%`;
  }

  setEditMode(enabled) {
    this.isEditMode = enabled;
    const toolbox = this.editorBar.querySelector('#hud-toolbox');
    if (enabled) {
      this.container.classList.add('hud-edit-mode');
      this.editorBar.classList.add('active');
      toolbox.style.display = 'flex';
      if (this.miniPill) this.miniPill.style.display = 'none';
    } else {
      this.container.classList.remove('hud-edit-mode');
      this.editorBar.classList.remove('active');
      toolbox.style.display = 'none';
      if (this.miniPill) this.miniPill.style.display = 'none';
      this.selectedWidgetId = null;
      const allWidgets = this.container.querySelectorAll('.hud-widget');
      allWidgets.forEach((w) => w.classList.remove('hud-selected'));
      const adjuster = this.editorBar.querySelector('#hud-widget-adjuster');
      if (adjuster) adjuster.style.display = 'none';
      this.saveLayout();
    }
  }

  applyLayout() {
    // 1. Core widgets (static DOM elements)
    const coreWidgets = ['hud-wheel', 'hud-telemetry', 'hud-transmission', 'hud-auto-shifter', 'hud-h-shifter', 'hud-clutch', 'hud-brake', 'hud-throttle'];
    
    coreWidgets.forEach(widgetId => {
      this.applyWidgetStyle(widgetId);
    });

    // 2. Dynamic Action Buttons
    const layer = document.getElementById('dynamic-widgets-layer');
    if (!layer) return;

    // Remove old dynamic buttons not in layout
    Array.from(layer.children).forEach(child => {
      if (!this.layout.widgets[child.id]) {
        layer.removeChild(child);
      }
    });

    // Create or update dynamic buttons
    const newElements = [];
    Object.keys(this.layout.widgets).forEach(widgetId => {
      if (coreWidgets.includes(widgetId)) return;
      
      const cfg = this.layout.widgets[widgetId];
      if (!cfg.type) return; 

      let el = document.getElementById(widgetId);
      if (!el) {
        el = this.createDynamicWidgetElement(widgetId, cfg.type);
        layer.appendChild(el);
        newElements.push(el);
      }
      this.applyWidgetStyle(widgetId);
    });

    if (newElements.length > 0) {
      this.bindWidgetDraggables(newElements);
    }
  }

  createDynamicWidgetElement(widgetId, type) {
    const tmpl = BUTTON_TEMPLATES[type];
    if (!tmpl) return document.createElement('div');
    
    const el = document.createElement('div');
    el.id = widgetId;
    el.className = 'hud-widget hud-btn-widget';
    el.innerHTML = `
      <button class="cockpit-btn ${tmpl.btnClass}" title="${tmpl.title}" data-btn-type="${tmpl.btnType}">
        <span>${tmpl.label}</span>
      </button>
    `;
    return el;
  }

  applyWidgetStyle(widgetId) {
    const el = document.getElementById(widgetId);
    const cfg = this.layout.widgets[widgetId];
    if (!el || !cfg) return;

    el.style.left = `${cfg.x}%`;
    el.style.top = `${cfg.y}%`;
    el.style.transform = `translate(-50%, -50%) scale(${cfg.scale || 1.0})`;
    el.style.opacity = `${cfg.opacity !== undefined ? cfg.opacity : 1.0}`;
  }
}
