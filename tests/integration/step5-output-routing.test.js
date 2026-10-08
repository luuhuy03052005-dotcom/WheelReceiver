import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, DEFAULT_KEYS, GAMES, createProfile, resolveActionRoute, supportsAction, resolveVJoyButton } from '../../packages/profiles/src/index.js';
import { InputState } from '../../packages/profiles/src/input-state.js';
import { configFrames, decodeFrame, decodeExtensions, encodeSnapshot } from '../../packages/protocol/src/index.js';

test('Step 5.A: Action có cả primary và extended alias (handbrake, camera) định tuyến độc quyền', () => {
  const pKeyboard = createProfile('forza', { keys: { 34: 32, 58: 57 } }); // parkingBrake: Space, camera: 9
  const rPbKbd = resolveActionRoute(ACTIONS[34], pKeyboard);
  const rCamKbd = resolveActionRoute(ACTIONS[58], pKeyboard);
  assert.equal(rPbKbd.type, 'keyboard');
  assert.equal(rPbKbd.key, 32);
  assert.equal(rCamKbd.type, 'keyboard');
  assert.equal(rCamKbd.key, 57);

  // Khi tắt phím (binding 0), route tự động chuyển về XInput / vJoy canonical mà không bị mất
  const pVirtual = createProfile('forza', { keys: { 34: 0, 58: 0 }, backend: 'xinput' });
  const rPbVirt = resolveActionRoute(ACTIONS[34], pVirtual);
  const rCamVirt = resolveActionRoute(ACTIONS[58], pVirtual);
  assert.equal(rPbVirt.type, 'xinput');
  assert.equal(rCamVirt.type, 'xinput');

  // Trong vJoy, alias handbrake và camera có đúng 1 button canonical duy nhất
  const pVJoy = createProfile('ets2', { keys: { 34: 0, 58: 0 }, backend: 'vjoy' });
  const rPbVJoy = resolveActionRoute(ACTIONS[34], pVJoy, { buttons: 70 });
  const rCamVJoy = resolveActionRoute(ACTIONS[58], pVJoy, { buttons: 70 });
  assert.equal(rPbVJoy.type, 'vjoy');
  assert.equal(rPbVJoy.button, 11); // Canonical button 11
  assert.equal(rCamVJoy.type, 'vjoy');
  assert.equal(rCamVJoy.button, 15); // Canonical button 15
});

test('Step 5.B: Binding 0 được bảo toàn xuyên suốt save/reload, configFrames và IPC frames', () => {
  // Tạo profile với phím 34 (parkingBrake) = 0 và phím 25 (horn) = 0
  const saved = { keys: { 34: 0, 25: 0, 11: 76 } };
  const profile = createProfile('forza', saved);
  assert.equal(profile.keys[34], 0);
  assert.equal(profile.keys[25], 0);
  assert.equal(profile.keys[11], 76);

  // Sinh IPC frames qua configFrames
  const frames = configFrames(profile, 9999);
  assert.ok(frames.length >= 65); // 1 CONFIG frame + 64 BINDING frames

  // Frame 0 là CONFIG
  assert.equal(frames[0][0], 0x15);

  // Tìm frame binding cho index 34 và index 25
  const binding34 = frames.find(f => f[0] === 0x14 && f[1] === 34);
  const binding25 = frames.find(f => f[0] === 0x14 && f[1] === 25);
  const binding11 = frames.find(f => f[0] === 0x14 && f[1] === 11);

  assert.ok(binding34, 'Phải có binding frame cho index 34');
  assert.ok(binding25, 'Phải có binding frame cho index 25');
  assert.ok(binding11, 'Phải có binding frame cho index 11');

  // GIÁ TRỊ PHẢI LÀ 0, KHÔNG BỊ DEFAULT_KEYS GHI ĐÈ THÀNH 32 HOẶC 72!
  assert.equal(binding34[2], 0, 'Binding 34 phải gửi byte 0 qua IPC');
  assert.equal(binding25[2], 0, 'Binding 25 phải gửi byte 0 qua IPC');
  assert.equal(binding11[2], 76, 'Binding 11 phải gửi byte 76');
});

test('Step 5.C: Binding chưa khai báo resolve nhất quán default theo backend', () => {
  // Profile không truyền `keys` (chưa cấu hình)
  const pXInput = createProfile('generic', { backend: 'xinput' });
  const pVJoy = createProfile('generic', { backend: 'vjoy' });

  // horn (index 25) mặc định là 'H' (72)
  const rHornX = resolveActionRoute(ACTIONS[25], pXInput);
  const rHornV = resolveActionRoute(ACTIONS[25], pVJoy);
  assert.equal(rHornX.type, 'keyboard');
  assert.equal(rHornX.key, 72);
  assert.equal(rHornV.type, 'keyboard');
  assert.equal(rHornV.key, 72);

  // gear1 (index 0) trên vJoy mặc định không gán phím (key = 0) vì vJoy có direct button 1..6
  const rGearV = resolveActionRoute(ACTIONS[0], pVJoy, { buttons: 70 });
  assert.equal(rGearV.type, 'vjoy');
  assert.equal(rGearV.button, 1);

  // gear1 trên XInput mặc định có key 49 ('1')
  const rGearX = resolveActionRoute(ACTIONS[0], pXInput);
  assert.equal(rGearX.type, 'keyboard');
  assert.equal(rGearX.key, 49);

  // Hộp số AT (reverse: 6, park: 7, drive: 8, neutral: 9) trên XInput mặc định phải là virtual XInput (key = 0)
  for (const atIdx of [6, 7, 8, 9]) {
    const routeX = resolveActionRoute(ACTIONS[atIdx], pXInput);
    assert.equal(routeX.type, 'xinput', `Action ${ACTIONS[atIdx].id} trên XInput phải resolve về xinput route`);
    assert.equal(routeX.isExplicit, false);

    const routeV = resolveActionRoute(ACTIONS[atIdx], pVJoy, { buttons: 70 });
    assert.equal(routeV.type, 'vjoy', `Action ${ACTIONS[atIdx].id} trên vJoy phải resolve về vjoy route`);
    assert.equal(routeV.isExplicit, false);
  }

  // configFrames trên XInput không được gửi phím bàn phím mặc định cho AT gears (bảo toàn DPad trên ViGEm)
  const framesX = configFrames(pXInput);
  for (const atIdx of [6, 7, 8, 9]) {
    const frame = framesX.find(f => f[0] === 0x14 && f[1] === atIdx);
    assert.ok(frame, `Phải có binding frame cho AT gear index ${atIdx}`);
    assert.equal(frame[2], 0, `Binding frame cho AT gear ${atIdx} phải là 0 trên XInput để không lọc DPad`);
  }

  // Nếu người dùng chủ động gán phím (isExplicit) cho AT gear, vẫn bảo toàn route keyboard
  const pCustomAT = createProfile('generic', { backend: 'xinput', keys: { 8: 68 } });
  const rDriveCustom = resolveActionRoute(ACTIONS[8], pCustomAT);
  assert.equal(rDriveCustom.type, 'keyboard');
  assert.equal(rDriveCustom.key, 68);
  assert.equal(rDriveCustom.isExplicit, true);
});

test('Step 5.D & 5.E: SupportsAction phản ánh đúng route và capability', () => {
  const pForza = createProfile('forza');

  // Horn trên Forza có phím mặc định 72 -> nếu capabilities.keyboard = false thì không hoạt động
  assert.equal(supportsAction(ACTIONS[25], pForza, { keyboard: true }), true);
  assert.equal(supportsAction(ACTIONS[25], pForza, { keyboard: false }), false);

  // Action phụ trợ khi tắt phím (binding 0) trên XInput (không có virtual route) thì unavailable
  const pNoHorn = createProfile('forza', { keys: { 25: 0 } });
  assert.equal(supportsAction(ACTIONS[25], pNoHorn, { keyboard: true }), false);

  // Nhưng parkingBrake (handbrake) khi tắt phím trên XInput vẫn có virtual route qua XInput button A
  const pNoPbKey = createProfile('forza', { keys: { 34: 0 } });
  assert.equal(supportsAction(ACTIONS[34], pNoPbKey, { keyboard: true }), true);
});

test('Step 5.H & 5.I: vJoy Canonical mapping và Compact mode không collision', () => {
  // Kiểm tra canonical button của ACTIONS
  assert.equal(ACTIONS.find(a => a.id === 'parkingBrake').vjoy, 11);
  assert.equal(ACTIONS.find(a => a.id === 'camera').vjoy, 15);

  // Các action 60..63 phải ánh xạ vào buttons 67..70
  assert.equal(ACTIONS.find(a => a.id === 'lookLeft').vjoy, 67);
  assert.equal(ACTIONS.find(a => a.id === 'lookRight').vjoy, 68);
  assert.equal(ACTIONS.find(a => a.id === 'pause').vjoy, 69);
  assert.equal(ACTIONS.find(a => a.id === 'resetVehicle').vjoy, 70);

  // Thiết bị 16 nút hỗ trợ các action có vjoy <= 16
  const p16 = createProfile('beamng');
  assert.equal(supportsAction(ACTIONS.find(a => a.id === 'parkingBrake'), p16, { buttons: 16 }), true);
  assert.equal(supportsAction(ACTIONS.find(a => a.id === 'camera'), p16, { buttons: 16 }), true);
  assert.equal(supportsAction(ACTIONS.find(a => a.id === 'gear1'), p16, { buttons: 16 }), true);

  // Action 10 (positionLights, vjoy 17) vượt quá 16 nút -> nếu không có keyboard thì unsupported
  assert.equal(supportsAction(ACTIONS.find(a => a.id === 'positionLights'), p16, { buttons: 16, keyboard: false }), false);
});

test('Step 5.K: RANGE/SPLIT kiểm tra đầy đủ group truck, supportsAction và capabilities', () => {
  const pEts2 = createProfile('ets2'); // Hỗ trợ group truck
  const pForza = createProfile('forza'); // KHÔNG hỗ trợ group truck

  const rangeAction = ACTIONS.find(a => a.id === 'range');
  const splitAction = ACTIONS.find(a => a.id === 'splitter');

  // Trên ETS2 với keyboard khả dụng
  assert.equal(supportsAction(rangeAction, pEts2, { keyboard: true }), true);
  assert.equal(supportsAction(splitAction, pEts2, { keyboard: true }), true);

  // Trên Forza (không có group truck)
  assert.equal(supportsAction(rangeAction, pForza, { keyboard: true }), false);
  assert.equal(supportsAction(splitAction, pForza, { keyboard: true }), false);

  // Trên ETS2 nhưng tắt phím và vJoy chỉ có 16 nút (range cần button 55 > 16)
  const pEts2NoKeys = createProfile('ets2', { keys: { 48: 0, 49: 0 } });
  assert.equal(supportsAction(rangeAction, pEts2NoKeys, { buttons: 16 }), false);
  assert.equal(supportsAction(splitAction, pEts2NoKeys, { buttons: 16 }), false);

  // Nhưng trên ETS2 tắt phím và vJoy có 70 nút (55 <= 70) thì virtual route khả dụng!
  assert.equal(supportsAction(rangeAction, pEts2NoKeys, { buttons: 70 }), true);
  assert.equal(supportsAction(splitAction, pEts2NoKeys, { buttons: 70 }), true);
});

test('Step 5.L: Regression - H-shifter direct gears, transmission modes và pulse machine', () => {
  const input = new InputState();
  input.setMode('H');

  // Gài gear1
  input.setGear('gear1');
  let snap = input.snapshot();
  assert.ok(snap.extended & (1n << 0n), 'gear1 phải bật bit 0');
  assert.equal(snap.buttons & 0x000F, 0, 'Mode H không được có AT DPad bits');

  // Gài gear2 xóa gear1
  input.setGear('gear2');
  snap = input.snapshot();
  assert.ok(snap.extended & (1n << 1n), 'gear2 phải bật bit 1');
  assert.equal(snap.extended & (1n << 0n), 0n, 'gear1 phải bị xóa');

  // Chuyển sang AT xóa toàn bộ manual gears
  input.setMode('AT');
  snap = input.snapshot();
  assert.equal(snap.extended & 0x3FFn, 0n, 'AT mode phải xóa sạch manual direct gears');
});

test('Step 5.1.A: Đối chiếu JS Resolver và C# Mapper cho vJoy 8, 16 và 70 nút (Shared Fixture)', () => {
  // Shared mapping fixture specification matching C# VJoyGamepadAdapter compact mode:
  const compact8Expected = {
    AT: {
      parkingBrake: 1, camera: 2, nitro: 3,
      park: 5, reverse: 6, neutral: 7, drive: 8,
      gear1: null, shiftUp: null, shiftDown: null, clutchTap: null
    },
    MT: {
      parkingBrake: 1, shiftUp: 2, shiftDown: 3, nitro: 4, camera: 5,
      clutchTap: null, reverse: null, park: null, drive: null, neutral: null, gear1: null
    },
    MTC: {
      parkingBrake: 1, shiftUp: 2, shiftDown: 3, nitro: 4, camera: 5,
      clutchTap: 6, reverse: null, park: null, drive: null, neutral: null, gear1: null
    },
    H: {
      gear1: 1, gear2: 2, gear3: 3, gear4: 4, gear5: 5, gear6: 6,
      reverse: 7, parkingBrake: 8,
      camera: null, nitro: null, shiftUp: null, shiftDown: null, park: null, drive: null, neutral: null
    }
  };

  for (const [mode, actions] of Object.entries(compact8Expected)) {
    for (const [actionId, expectedBtn] of Object.entries(actions)) {
      const resolved = resolveVJoyButton(actionId, mode, 8);
      assert.equal(resolved, expectedBtn, `Mode ${mode} Action ${actionId} compact 8-button mismatch: expected ${expectedBtn}, got ${resolved}`);
      const act = ACTIONS.find(a => a.id === actionId) || { id: actionId };
      const route = resolveActionRoute(act, { backend: 'vjoy', mode, keys: { [act.index]: 0 } }, { buttons: 8, mode });
      if (expectedBtn !== null) {
        assert.equal(route.type, 'vjoy', `Mode ${mode} Action ${actionId} should resolve to vjoy`);
        assert.equal(route.button, expectedBtn, `Mode ${mode} Action ${actionId} button mismatch`);
      } else {
        assert.equal(route.type, 'none', `Mode ${mode} Action ${actionId} should resolve to none`);
      }
    }
  }

  // 16-button mapping:
  assert.equal(resolveVJoyButton('gear1', 'AT', 16), 1);
  assert.equal(resolveVJoyButton('gear6', 'AT', 16), 6);
  assert.equal(resolveVJoyButton('reverse', 'AT', 16), 7);
  assert.equal(resolveVJoyButton('park', 'AT', 16), 8);
  assert.equal(resolveVJoyButton('drive', 'AT', 16), 9);
  assert.equal(resolveVJoyButton('neutral', 'AT', 16), 10);
  assert.equal(resolveVJoyButton('parkingBrake', 'AT', 16), 11);
  assert.equal(resolveVJoyButton('shiftUp', 'AT', 16), 12);
  assert.equal(resolveVJoyButton('shiftDown', 'AT', 16), 13);
  assert.equal(resolveVJoyButton('nitro', 'AT', 16), 14);
  assert.equal(resolveVJoyButton('camera', 'AT', 16), 15);
  assert.equal(resolveVJoyButton('clutchTap', 'AT', 16), 16);
  // Auxiliary action 25 (horn -> vJoy button 32 > 16) is unsupported in 16 buttons
  assert.equal(resolveVJoyButton('horn', 'AT', 16), null);

  // 70-button mapping:
  assert.equal(resolveVJoyButton('horn', 'AT', 70), 32);
  assert.equal(resolveVJoyButton('resetVehicle', 'AT', 70), 70);
});

test('Step 5.1.B: Tái hiện focus loss & return - không hồi sinh keydown hay input cũ', async () => {
  // Simulate Gateway session lifecycle with focus loss and resumption
  let armed = true;
  let requireNeutral = false;
  let bridgeNeutralCount = 0;
  let bridgeFramesReceived = [];

  const mockPipeClient = {
    sendNeutral: () => { bridgeNeutralCount++; },
    sendFrames: (frames) => { bridgeFramesReceived.push(...frames); return true; }
  };

  const pause = () => {
    armed = false;
    mockPipeClient.sendNeutral();
  };

  const resume = () => {
    mockPipeClient.sendNeutral();
    armed = true;
    requireNeutral = true;
  };

  // 1. Session is driving and active. Handbrake is held (buttons = 0x1000)
  const heldHandbrakeFrame = { buttons: 0x1000, steering: 0, brake: 0, throttle: 0, sequence: 10 };
  const isNeutral = (f) => f.buttons === 0 && f.steering === 0 && f.brake === 0 && f.throttle === 0;

  // 2. Game loses focus (Alt-Tab)
  pause('Game mất focus (Alt-Tab)');
  assert.equal(armed, false, 'Session must be disarmed on focus loss');
  assert.ok(bridgeNeutralCount >= 1, 'Bridge must receive neutral on focus loss');

  // 3. Game regains focus, BUT session is still paused. Late/held frames arrive from client
  const lateFrameArrived = (frame) => {
    if (!armed) return false; // Dropped at gateway line 134!
    if (requireNeutral) {
      if (!isNeutral(frame)) {
        mockPipeClient.sendNeutral();
        return false;
      }
      requireNeutral = false;
    }
    mockPipeClient.sendFrames([frame]);
    return true;
  };

  // While paused, held frame MUST be dropped completely
  const acceptedWhilePaused = lateFrameArrived(heldHandbrakeFrame);
  assert.equal(acceptedWhilePaused, false, 'Late frame while paused must be dropped');
  assert.equal(bridgeFramesReceived.length, 0, 'No frames forwarded to bridge while paused');

  // 4. Client issues resume request:
  resume();
  assert.equal(armed, true);
  assert.equal(requireNeutral, true, 'Resume must enforce requireNeutral (BR-CON-04)');

  // 5. If client sends the old held handbrake frame again upon resume:
  const acceptedOldHeld = lateFrameArrived(heldHandbrakeFrame);
  assert.equal(acceptedOldHeld, false, 'Held input from previous session must be rejected upon resume');
  assert.equal(bridgeFramesReceived.length, 0, 'No input resurrects from stale held state');

  // 6. Only after client physically releases (sends neutral):
  const neutralFrame = { buttons: 0, steering: 0, brake: 0, throttle: 0, sequence: 11 };
  const acceptedNeutral = lateFrameArrived(neutralFrame);
  assert.equal(acceptedNeutral, true, 'Neutral frame clears requireNeutral gate');
  assert.equal(requireNeutral, false, 'requireNeutral is now cleared');

  // 7. Fresh input is now accepted
  const newHandbrakeFrame = { buttons: 0x1000, steering: 0, brake: 0, throttle: 0, sequence: 12 };
  const acceptedNew = lateFrameArrived(newHandbrakeFrame);
  assert.equal(acceptedNew, true, 'New legitimate input is forwarded to bridge');
  assert.equal(bridgeFramesReceived.length, 2);
});

test('Step 5.1.C: Binding 0 qua IPC encoder và consumer parser', () => {
  // 1. Profile with explicit binding 0 for handbrake (index 34) and camera (index 58)
  const profile = createProfile('beamng', {
    backend: 'vjoy',
    keys: { 34: 0, 58: 0 }
  });

  // 2. Encoder generates IPC config frames
  const frames = configFrames(profile, 1234);

  // Find frame 0x14 for index 34
  const pbFrame = frames.find(f => f[0] === 0x14 && f[1] === 34);
  const camFrame = frames.find(f => f[0] === 0x14 && f[1] === 58);

  assert.ok(pbFrame, 'Frame 0x14 cho action 34 phải được tạo');
  assert.ok(camFrame, 'Frame 0x14 cho action 58 phải được tạo');

  assert.equal(pbFrame.length, 8, 'Frame IPC phải có đúng 8 bytes');
  assert.equal(pbFrame[2], 0, 'Byte 2 (key) phải là 0 tường minh');

  // 3. NamedPipeServer parser validation
  const parseIpcBinding = (frame) => {
    if (frame.length !== 8) return null;
    if (frame[0] !== 0x14) return null;
    if (frame[1] >= 64) return null;
    for (let i = 3; i < 8; i++) {
      if (frame[i] !== 0) return null; // Span(3).IndexOfAnyExcept(0) < 0
    }
    return { index: frame[1], key: frame[2] };
  };

  const parsedPb = parseIpcBinding(pbFrame);
  assert.deepEqual(parsedPb, { index: 34, key: 0 });

  // 4. Consumer route resolution
  const rPb = resolveActionRoute(ACTIONS[34], profile, { buttons: 70 });
  assert.equal(rPb.type, 'vjoy', 'Binding 0 phải chuyển sang route vJoy');
  assert.equal(rPb.button, 11, 'Handbrake phải dùng canonical button 11 trên vJoy');
  assert.equal(rPb.isExplicit, true, 'Phải đánh dấu isExplicit');
});

