import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { RuntimeManager } from '../../apps/gateway/src/runtime.js';
import { createProfile } from '../../packages/profiles/src/index.js';

test('RuntimeManager - full path and quotes stripping for executable', () => {
  const tmpFile = path.join(os.tmpdir(), `wheel-test-prof-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const runtime = new RuntimeManager({ file: tmpFile, detect: false });
  try {
    // 1. Quoted full windows path
    runtime.choose({
      gameId: 'ets2',
      executable: '"C:\\Program Files (x86)\\Steam\\steamapps\\common\\Euro Truck Simulator 2\\bin\\win_x64\\eurotrucks2.exe"'
    });
    assert.equal(runtime.settings.custom['eurotrucks2.exe'], 'ets2');

    // 2. Forward slash path
    runtime.choose({
      gameId: 'beamng',
      executable: 'D:/Games/BeamNG.drive/BeamNG.drive.x64.exe'
    });
    assert.equal(runtime.settings.custom['beamng.drive.x64.exe'], 'beamng');

    // 3. Status includes profiles and custom
    const status = runtime.status();
    assert.ok(status.profiles);
    assert.ok(status.custom);
    assert.equal(status.custom['eurotrucks2.exe'], 'ets2');
    assert.equal(status.custom['beamng.drive.x64.exe'], 'beamng');
  } finally {
    runtime.close();
    try { fs.unlinkSync(tmpFile); } catch {}
  }
});

test('RuntimeManager - profile customization, persistence to disk, and reset', () => {
  const tmpFile = path.join(os.tmpdir(), `wheel-test-prof-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const runtime1 = new RuntimeManager({ file: tmpFile, detect: false });
  try {
    // Save custom profile for forza
    const customForza = createProfile('forza', {
      mode: 'H',
      range: 720,
      keys: { 25: 72, 11: 76 }
    });
    runtime1.choose({
      selection: 'manual',
      gameId: 'forza',
      profile: customForza,
      executable: 'ForzaHorizon5.exe'
    });

    assert.equal(runtime1.profile.gameId, 'forza');
    assert.equal(runtime1.profile.mode, 'H');
    assert.equal(runtime1.profile.range, 720);
    assert.equal(runtime1.profile.keys[25], 72);
    assert.equal(runtime1.settings.custom['forzahorizon5.exe'], 'forza');

    // Ensure persisted to disk
    assert.ok(fs.existsSync(tmpFile));
    const saved = JSON.parse(fs.readFileSync(tmpFile, 'utf8'));
    assert.equal(saved.settings.manualGame, 'forza');
    assert.equal(saved.settings.profiles.forza.mode, 'H');
    assert.equal(saved.settings.profiles.forza.range, 720);
    assert.equal(saved.settings.custom['forzahorizon5.exe'], 'forza');

    // Re-open with new RuntimeManager to verify reload
    const runtime2 = new RuntimeManager({ file: tmpFile, detect: false });
    try {
      assert.equal(runtime2.profile.gameId, 'forza');
      assert.equal(runtime2.profile.mode, 'H');
      assert.equal(runtime2.profile.range, 720);
      assert.equal(runtime2.settings.profiles.forza.keys[25], 72);
      assert.equal(runtime2.settings.custom['forzahorizon5.exe'], 'forza');

      // Test reset profile
      runtime2.choose({
        gameId: 'forza',
        reset: true
      });
      assert.equal(runtime2.settings.profiles.forza, undefined);
      assert.equal(runtime2.settings.custom['forzahorizon5.exe'], undefined);
      // Returns to default forza profile
      assert.equal(runtime2.profile.mode, 'AT');
      assert.equal(runtime2.profile.range, 360);
    } finally {
      runtime2.close();
    }
  } finally {
    runtime1.close();
    try { fs.unlinkSync(tmpFile); } catch {}
  }
});

test('RuntimeManager - game switching does not overwrite other game profiles', () => {
  const tmpFile = path.join(os.tmpdir(), `wheel-test-prof-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  const runtime = new RuntimeManager({ file: tmpFile, detect: false });
  try {
    // Customize ETS2
    runtime.choose({
      gameId: 'ets2',
      profile: createProfile('ets2', { mode: 'H', range: 900 })
    });
    // Customize Forza
    runtime.choose({
      gameId: 'forza',
      profile: createProfile('forza', { mode: 'MT', range: 540 })
    });

    // Check that both profiles remain isolated
    assert.equal(runtime.settings.profiles.ets2.mode, 'H');
    assert.equal(runtime.settings.profiles.ets2.range, 900);
    assert.equal(runtime.settings.profiles.forza.mode, 'MT');
    assert.equal(runtime.settings.profiles.forza.range, 540);

    // Switch back to ETS2
    runtime.choose({ gameId: 'ets2' });
    assert.equal(runtime.profile.gameId, 'ets2');
    assert.equal(runtime.profile.mode, 'H');
    assert.equal(runtime.profile.range, 900);
  } finally {
    runtime.close();
    try { fs.unlinkSync(tmpFile); } catch {}
  }
});
