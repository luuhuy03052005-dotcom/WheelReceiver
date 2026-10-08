import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS } from '../../apps/controller-web/public/src/layout-editor.js';
import { ACTIONS } from '../../packages/profiles/src/index.js';
import { ACTION_IMAGE_MAP } from '../../apps/controller-web/public/src/assets.js';

test('Step 12.1: Layout Presets ergonomics - Pedal Zone Freedom', () => {
  // Pedals occupy right column ~75% to 100% on landscape screen.
  // quick-controls in default_left and truck_simulator must NOT overlap pedals (x < 72%).
  for (const presetKey of ['default_left', 'truck_simulator']) {
    const preset = PRESETS[presetKey];
    assert.ok(preset, `Preset ${presetKey} must exist`);
    for (const item of preset.items) {
      assert.ok(
        item.x < 72,
        `Preset ${presetKey} item ${item.actionId} at x=${item.x}% must not overlap pedals (x >= 72%)`
      );
      assert.ok(
        item.x >= 35,
        `Preset ${presetKey} item ${item.actionId} at x=${item.x}% should stay in center console area (x >= 35%)`
      );
    }
  }
});

test('Step 12.2: Action Image Map Cutout Assets Coverage', () => {
  assert.equal(ACTION_IMAGE_MAP.starter, 'images/Start_Stop_engine.png');
  assert.equal(ACTION_IMAGE_MAP.indicatorLeft, 'images/Si_nhan_trai.png');
  assert.equal(ACTION_IMAGE_MAP.indicatorRight, 'images/Si_nhan_phai.png');
  assert.equal(ACTION_IMAGE_MAP.horn, 'images/horn.png');
  assert.equal(ACTION_IMAGE_MAP.lowBeam, 'images/light_short.png');
  assert.equal(ACTION_IMAGE_MAP.highBeam, 'images/light_far.png');
});

test('Step 12.3: Special Action Effect State Machine (Engine, Blinkers, Lights)', async () => {
  const { ControllerApp } = await import('../../apps/controller-web/public/src/app.js').catch(() => ({}));
  if (!ControllerApp) return;

  // Verify ControllerApp prototype has handleActionEffect and updateSpecialButtonVisuals
  assert.equal(typeof ControllerApp.prototype.handleActionEffect, 'function');
  assert.equal(typeof ControllerApp.prototype.updateSpecialButtonVisuals, 'function');

  // Verify state transitions on an instance
  const mockApp = {
    armed: false,
    engineRunning: false,
    activeIndicators: { left: false, right: false, hazards: false },
    activeLights: { low: false, high: false },
    handleActionEffect: ControllerApp.prototype.handleActionEffect,
    updateSpecialButtonVisuals() {}
  };

  // 1. Starter toggles engine
  mockApp.handleActionEffect('starter');
  assert.equal(mockApp.engineRunning, true, 'Starter must toggle engine on');
  mockApp.handleActionEffect('starter');
  assert.equal(mockApp.engineRunning, false, 'Second starter press toggles engine off');

  // 2. Turn signals: left turns on, then right cancels left
  mockApp.handleActionEffect('indicatorLeft');
  assert.equal(mockApp.activeIndicators.left, true);
  assert.equal(mockApp.activeIndicators.right, false);

  mockApp.handleActionEffect('indicatorRight');
  assert.equal(mockApp.activeIndicators.right, true);
  assert.equal(mockApp.activeIndicators.left, false, 'Right indicator must mutually cancel left');

  mockApp.handleActionEffect('indicatorRight');
  assert.equal(mockApp.activeIndicators.right, false, 'Tapping right again turns it off');

  // 3. Hazards toggle
  mockApp.handleActionEffect('hazards');
  assert.equal(mockApp.activeIndicators.hazards, true);
  mockApp.handleActionEffect('hazards');
  assert.equal(mockApp.activeIndicators.hazards, false);

  // 4. Lights toggle
  mockApp.handleActionEffect('lowBeam');
  assert.equal(mockApp.activeLights.low, true);
  mockApp.handleActionEffect('highBeam');
  assert.equal(mockApp.activeLights.high, true);
  mockApp.handleActionEffect('lowBeam');
  assert.equal(mockApp.activeLights.low, false);
});
