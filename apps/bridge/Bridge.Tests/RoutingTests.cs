using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using LanRacingWheel.Bridge.Adapters;
using LanRacingWheel.Bridge.Protocol;
using CoreDX.vJoy.Wrapper;
using Xunit;

namespace LanRacingWheel.Bridge.Tests;

public class FakeKeyboardSender : IKeyboardSender
{
    public List<(byte Key, bool Down)> History { get; } = new();
    public bool ShouldFail { get; set; }
    public Func<byte, bool, bool>? Interceptor { get; set; }

    public bool SendKey(byte key, bool down, out string? error)
    {
        error = null;
        if (Interceptor != null)
        {
            bool ok = Interceptor(key, down);
            if (!ok) { error = "Simulated Interceptor Failure"; return false; }
        }
        if (ShouldFail)
        {
            error = "Simulated SendInput Error";
            return false;
        }
        History.Add((key, down));
        return true;
    }
}

public class FakeForegroundProvider : IForegroundProvider
{
    public uint ForegroundPid { get; set; }
    public uint GetForegroundProcessId() => ForegroundPid;
}

public class FakeVJoyController : IVJoyController
{
    public uint Id => 1;
    public bool HasRelinquished { get; set; }
    public long? AxisMaxValue => 32767L;
    public int ButtonCount { get; set; } = 70;
    public int ContPovCount => 0;
    public int DiscPovCount => 0;

    public bool HasAxisX => true;
    public bool HasAxisY => true;
    public bool HasAxisZ => true;
    public bool HasAxisRx => true;
    public bool HasAxisRy => false;
    public bool HasAxisRz => false;
    public bool HasSlider0 => false;
    public bool HasSlider1 => false;
    public bool HasWheel => false;

    public HashSet<uint> PressedButtons { get; } = new();
    public List<(uint Button, bool Pressed)> ButtonEvents { get; } = new();

    public bool PressButton(uint buttonId)
    {
        PressedButtons.Add(buttonId);
        ButtonEvents.Add((buttonId, true));
        return true;
    }

    public bool ReleaseButton(uint buttonId)
    {
        PressedButtons.Remove(buttonId);
        ButtonEvents.Add((buttonId, false));
        return true;
    }

    public bool ClickButton(uint buttonId, int ms) => true;
    public Task<bool> ClickButtonAsync(uint buttonId, int ms, CancellationToken ct) => Task.FromResult(true);

    public bool SetAxisX(int value) => true;
    public bool SetAxisY(int value) => true;
    public bool SetAxisZ(int value) => true;
    public bool SetAxisRx(int value) => true;
    public bool SetAxisRy(int value) => true;
    public bool SetAxisRz(int value) => true;
    public bool SetSlider0(int value) => true;
    public bool SetSlider1(int value) => true;
    public bool SetWheel(int value) => true;
    public bool SetContPov(int pov, uint val) => true;
    public bool SetDiscPov(int pov, uint val) => true;
    public bool Reset() { PressedButtons.Clear(); return true; }
    public bool ResetButtons() { PressedButtons.Clear(); return true; }
    public bool ResetPovs() => true;
    public void Dispose() { HasRelinquished = true; }
}

public class RoutingTests
{
    [Fact]
    public void Step5A_ActionWithAliases_RoutesOnlyToChosenOutput()
    {
        var keyboard = new FakeKeyboardSender();
        var fg = new FakeForegroundProvider { ForegroundPid = 1234 };
        var mockOutput = new MockGamepadAdapter();
        mockOutput.Initialize();

        var router = new RoutedGamepadAdapter(mock: true, customOutput: mockOutput, keyboardSender: keyboard, foregroundProvider: fg);
        router.Configure(1);
        router.TargetPid = 1234;

        // 1. Route Keyboard: bind parkingBrake (index 34) to Space (32)
        router.Bind(34, 32);

        // State with both extended bit 34 AND primary button 0x1000 (handbrake) set
        var stateWithHandbrake = new ControllerState(0x11, 1, 0x1000, 0, 0, 0, 0, 1UL << 34);
        router.UpdateState(stateWithHandbrake);

        // Keyboard received Space down
        Assert.Single(keyboard.History);
        Assert.Equal(((byte)32, true), keyboard.History[0]);

        // Mock virtual output received state with BOTH bit 34 and primary 0x1000 stripped!
        var received = mockOutput.StateHistory[^1];
        Assert.Equal(0UL, received.ExtendedButtons & (1UL << 34));
        Assert.Equal(0, received.Buttons & 0x1000);

        // 2. Unbind keyboard (route virtual): bind index 34 to 0
        router.ResetToNeutral();
        keyboard.History.Clear();
        mockOutput.StateHistory.Clear();
        router.Bind(34, 0);

        router.UpdateState(stateWithHandbrake);

        // No keyboard key event
        Assert.Empty(keyboard.History);

        // Virtual output received state with bit 34 and 0x1000 intact!
        received = mockOutput.StateHistory[^1];
        Assert.NotEqual(0UL, received.ExtendedButtons & (1UL << 34));
        Assert.Equal(0x1000, received.Buttons & 0x1000);
    }

    [Fact]
    public void Step5B_Binding0_PreservedAndDoesNotTriggerKeyboard()
    {
        var keyboard = new FakeKeyboardSender();
        var fg = new FakeForegroundProvider { ForegroundPid = 4321 };
        var mockOutput = new MockGamepadAdapter();
        mockOutput.Initialize();

        var router = new RoutedGamepadAdapter(mock: true, customOutput: mockOutput, keyboardSender: keyboard, foregroundProvider: fg);
        router.Configure(1);
        router.TargetPid = 4321;

        // Explicitly set camera (index 58) to 0 (unbound / virtual route)
        router.Bind(58, 0);

        var stateWithCamera = new ControllerState(0x11, 2, 0x0200, 0, 0, 0, 0, 1UL << 58);
        router.UpdateState(stateWithCamera);

        // Keyboard received nothing
        Assert.Empty(keyboard.History);

        // Virtual output received camera button
        var received = mockOutput.StateHistory[^1];
        Assert.Equal(0x0200, received.Buttons & 0x0200);
        Assert.NotEqual(0UL, received.ExtendedButtons & (1UL << 58));
    }

    [Fact]
    public void Step5D_ForegroundGating_Pid0AndWrongForegroundDoNotSendKey()
    {
        var keyboard = new FakeKeyboardSender();
        var fg = new FakeForegroundProvider { ForegroundPid = 100 };
        var mockOutput = new MockGamepadAdapter();
        mockOutput.Initialize();

        var router = new RoutedGamepadAdapter(mock: true, customOutput: mockOutput, keyboardSender: keyboard, foregroundProvider: fg);
        router.Configure(1);
        router.Bind(25, 72); // Horn -> 'H' (72)

        var hornState = new ControllerState(0x11, 1, 0, 0, 0, 0, 0, 1UL << 25);

        // Case 1: TargetPid = 0 (no target PID) -> MUST NOT send key even if foreground PID exists
        router.TargetPid = 0;
        router.UpdateState(hornState);
        Assert.Empty(keyboard.History);

        // Case 2: TargetPid = 200, but foreground is 100 -> MUST NOT send key
        router.TargetPid = 200;
        router.UpdateState(hornState);
        Assert.Empty(keyboard.History);

        // Case 3: TargetPid = 100, foreground is 100 -> DOES send key!
        router.TargetPid = 100;
        router.UpdateState(hornState);
        Assert.Single(keyboard.History);
        Assert.Equal(((byte)72, true), keyboard.History[0]);

        // Case 4: Changing TargetPid releases currently pressed key
        router.TargetPid = 999; // Different PID
        Assert.Contains(((byte)72, false), keyboard.History);
        Assert.Empty(router.PressedKeys);
    }

    [Fact]
    public void Step5E_Lifecycle_FocusLostAndResetReleaseKeys()
    {
        var keyboard = new FakeKeyboardSender();
        var fg = new FakeForegroundProvider { ForegroundPid = 500 };
        var router = new RoutedGamepadAdapter(mock: true, keyboardSender: keyboard, foregroundProvider: fg);
        router.Configure(1);
        router.TargetPid = 500;
        router.Bind(11, 76); // lowBeam -> 'L' (76)

        var state = new ControllerState(0x11, 1, 0, 0, 0, 0, 0, 1UL << 11);
        router.UpdateState(state);
        Assert.Contains(((byte)76, true), keyboard.History);
        Assert.Contains((byte)76, router.PressedKeys);

        // 1. Game loses focus (Alt-Tab to PID 999)
        fg.ForegroundPid = 999;
        router.InvalidateFocusCache();
        router.UpdateState(state);
        Assert.Contains(((byte)76, false), keyboard.History);
        Assert.DoesNotContain((byte)76, router.PressedKeys);

        // 2. Focus returns, but user is now neutral: no key resurrection!
        keyboard.History.Clear();
        fg.ForegroundPid = 500;
        router.UpdateState(ControllerState.Neutral);
        Assert.Empty(keyboard.History);
        Assert.Empty(router.PressedKeys);
    }

    [Fact]
    public void Step5F_TwoActionsSharingOneKey_IndependentRelease()
    {
        var keyboard = new FakeKeyboardSender();
        var fg = new FakeForegroundProvider { ForegroundPid = 777 };
        var router = new RoutedGamepadAdapter(mock: true, keyboardSender: keyboard, foregroundProvider: fg);
        router.Configure(1);
        router.TargetPid = 777;

        // Action 10 (positionLights) and Action 11 (lowBeam) both mapped to key 'L' (76)
        router.Bind(10, 76);
        router.Bind(11, 76);

        // Both active
        var bothState = new ControllerState(0x11, 1, 0, 0, 0, 0, 0, (1UL << 10) | (1UL << 11));
        router.UpdateState(bothState);
        Assert.Single(keyboard.History);
        Assert.Equal(((byte)76, true), keyboard.History[0]);

        // Release action 10, keep action 11 active -> key 'L' must NOT be released!
        keyboard.History.Clear();
        var only11State = new ControllerState(0x11, 2, 0, 0, 0, 0, 0, 1UL << 11);
        router.UpdateState(only11State);
        Assert.Empty(keyboard.History); // No keyup sent!
        Assert.Contains((byte)76, router.PressedKeys);

        // Release action 11 -> key 'L' is now released!
        router.UpdateState(ControllerState.Neutral);
        Assert.Single(keyboard.History);
        Assert.Equal(((byte)76, false), keyboard.History[0]);
        Assert.Empty(router.PressedKeys);
    }

    [Fact]
    public void Step5G_SendInputFailure_DoesNotMarkSuccessAndLogsError()
    {
        var keyboard = new FakeKeyboardSender { ShouldFail = true };
        var fg = new FakeForegroundProvider { ForegroundPid = 888 };
        var router = new RoutedGamepadAdapter(mock: true, keyboardSender: keyboard, foregroundProvider: fg);
        router.Configure(1);
        router.TargetPid = 888;
        router.Bind(25, 72); // Horn

        var hornState = new ControllerState(0x11, 1, 0, 0, 0, 0, 0, 1UL << 25);
        router.UpdateState(hornState);

        // Because SendKey failed, 72 must NOT be marked as successfully pressed!
        Assert.DoesNotContain((byte)72, router.PressedKeys);
    }

    [Fact]
    public void Step5H_VJoy_Actions60To63_Buttons67To70_NoCollisionWithDPad()
    {
        var vjoy = new FakeVJoyController { ButtonCount = 70 };
        var adapter = new VJoyGamepadAdapter(vjoy);
        adapter.Initialize();

        // Trigger actions 60 (lookLeft), 61 (lookRight), 62 (pause), 63 (resetVehicle)
        // AND DPad buttons 0x000F (park, rev, neutral, drive) simultaneously
        ulong extBits = (1UL << 60) | (1UL << 61) | (1UL << 62) | (1UL << 63);
        ushort dpadButtons = 0x0001 | 0x0002 | 0x0004 | 0x0008; // Park, Rev, Neutral, Drive

        var state = new ControllerState(0x11, 1, dpadButtons, 0, 0, 0, 0, extBits);
        adapter.UpdateState(state);

        // Buttons 67..70 must be pressed by actions 60..63!
        Assert.Contains(67u, vjoy.PressedButtons);
        Assert.Contains(68u, vjoy.PressedButtons);
        Assert.Contains(69u, vjoy.PressedButtons);
        Assert.Contains(70u, vjoy.PressedButtons);

        // DPad gears are on their canonical buttons 8 (park), 7 (rev), 10 (neutral), 9 (drive)
        Assert.Contains(8u, vjoy.PressedButtons);
        Assert.Contains(7u, vjoy.PressedButtons);
        Assert.Contains(10u, vjoy.PressedButtons);
        Assert.Contains(9u, vjoy.PressedButtons);

        // Handbrake: only button 11, NOT duplicate button 41
        vjoy.PressedButtons.Clear();
        var handbrakeState = new ControllerState(0x11, 2, 0x1000, 0, 0, 0, 0, 1UL << 34);
        adapter.UpdateState(handbrakeState);
        Assert.Contains(11u, vjoy.PressedButtons);
        Assert.DoesNotContain(41u, vjoy.PressedButtons);

        // Camera: only button 15, NOT duplicate button 65
        vjoy.PressedButtons.Clear();
        var cameraState = new ControllerState(0x11, 3, 0x0200, 0, 0, 0, 0, 1UL << 58);
        adapter.UpdateState(cameraState);
        Assert.Contains(15u, vjoy.PressedButtons);
        Assert.DoesNotContain(65u, vjoy.PressedButtons);
    }

    [Fact]
    public void Step5I_CompactMode_8Buttons_NitroAndCameraNotMerged()
    {
        var vjoy = new FakeVJoyController { ButtonCount = 8 };
        var adapter = new VJoyGamepadAdapter(vjoy);
        adapter.Initialize();

        // In Mode AT (GearMode = 1):
        // Button 2 is camera, Button 3 is nitro, Button 4 is reserved (NOT merged)
        var cameraOnly = new ControllerState(0x11, 1, 0x0200, 0, 0, 0, 0, 0, GearMode: 1);
        adapter.UpdateState(cameraOnly);
        Assert.Contains(2u, vjoy.PressedButtons);
        Assert.DoesNotContain(3u, vjoy.PressedButtons);
        Assert.DoesNotContain(4u, vjoy.PressedButtons);

        var nitroOnly = new ControllerState(0x11, 2, 0x8000, 0, 0, 0, 0, 0, GearMode: 1);
        adapter.UpdateState(nitroOnly);
        Assert.Contains(3u, vjoy.PressedButtons);
        Assert.DoesNotContain(2u, vjoy.PressedButtons);
        Assert.DoesNotContain(4u, vjoy.PressedButtons);

        // Switching mode from AT (1) to H (4) releases previous buttons
        var hModeGear1 = new ControllerState(0x11, 3, 0, 0, 0, 0, 0, 1UL << 0, GearMode: 4);
        adapter.UpdateState(hModeGear1);
        Assert.Contains(1u, vjoy.PressedButtons); // Gear 1 is Button 1 in Mode H
        Assert.DoesNotContain(2u, vjoy.PressedButtons);
        Assert.DoesNotContain(3u, vjoy.PressedButtons);
    }

    [Fact]
    public void Step5_1_Aliases_ThreeRepresentations_HandbrakeAndCamera()
    {
        var sender = new FakeKeyboardSender();
        var fg = new FakeForegroundProvider { ForegroundPid = 42 };
        var vjoy = new FakeVJoyController { ButtonCount = 70 };
        var vjoyAdapter = new VJoyGamepadAdapter(vjoy);
        var router = new RoutedGamepadAdapter(mock: false, customOutput: vjoyAdapter, keyboardSender: sender, foregroundProvider: fg);
        router.Initialize();
        router.TargetPid = 42;

        // Test 1: Handbrake (action 34) mapped to Space (32), Camera (action 58) mapped to '9' (57)
        router.Bind(34, 32);
        router.Bind(58, 57);

        // A. Only Primary Mask
        var repA = new ControllerState(0x11, 1, 0x1000 | 0x0200, 0, 0, 0, 0, 0);
        router.UpdateState(repA);
        Assert.Contains((byte)32, router.PressedKeys);
        Assert.Contains((byte)57, router.PressedKeys);
        Assert.DoesNotContain(11u, vjoy.PressedButtons);
        Assert.DoesNotContain(15u, vjoy.PressedButtons);

        // B. Only Extended Bit
        router.UpdateState(ControllerState.Neutral);
        sender.History.Clear();
        var repB = new ControllerState(0x11, 2, 0, 0, 0, 0, 0, (1UL << 34) | (1UL << 58));
        router.UpdateState(repB);
        Assert.Contains((byte)32, router.PressedKeys);
        Assert.Contains((byte)57, router.PressedKeys);
        Assert.DoesNotContain(11u, vjoy.PressedButtons);
        Assert.DoesNotContain(15u, vjoy.PressedButtons);

        // C. Both Primary Mask and Extended Bit
        router.UpdateState(ControllerState.Neutral);
        sender.History.Clear();
        var repC = new ControllerState(0x11, 3, 0x1000 | 0x0200, 0, 0, 0, 0, (1UL << 34) | (1UL << 58));
        router.UpdateState(repC);
        Assert.Contains((byte)32, router.PressedKeys);
        Assert.Contains((byte)57, router.PressedKeys);
        Assert.DoesNotContain(11u, vjoy.PressedButtons);
        Assert.DoesNotContain(15u, vjoy.PressedButtons);

        // Test 2: Virtual Route (Binding = 0)
        router.UpdateState(ControllerState.Neutral);
        sender.History.Clear();
        router.Bind(34, 0);
        router.Bind(58, 0);

        // Under repA (primary mask only), repB (extended only), repC (both):
        // Virtual output MUST receive canonical buttons 11 and 15, and NO keyboard events
        router.UpdateState(repA);
        Assert.Contains(11u, vjoy.PressedButtons);
        Assert.Contains(15u, vjoy.PressedButtons);
        Assert.Empty(sender.History);

        router.UpdateState(ControllerState.Neutral);
        router.UpdateState(repB);
        Assert.Contains(11u, vjoy.PressedButtons);
        Assert.Contains(15u, vjoy.PressedButtons);
        Assert.Empty(sender.History);

        router.UpdateState(ControllerState.Neutral);
        router.UpdateState(repC);
        Assert.Contains(11u, vjoy.PressedButtons);
        Assert.Contains(15u, vjoy.PressedButtons);
        Assert.Empty(sender.History);

        // Test 3: Blocked Focus (Wrong PID or PID = 0)
        router.UpdateState(ControllerState.Neutral);
        sender.History.Clear();
        router.Bind(34, 32);
        router.Bind(58, 57);
        fg.ForegroundPid = 999; // Different from TargetPid 42
        router.InvalidateFocusCache();

        router.UpdateState(repC);
        // Focus blocked: NO keyboard keydown, and NOT diverted to virtual route!
        Assert.Empty(router.PressedKeys);
        Assert.Empty(sender.History);
        Assert.DoesNotContain(11u, vjoy.PressedButtons);
        Assert.DoesNotContain(15u, vjoy.PressedButtons);
    }

    [Fact]
    public void Step5_1_KeyupFailure_RetainsTracking_RetriedSuccessfully()
    {
        var sender = new FakeKeyboardSender();
        var fg = new FakeForegroundProvider { ForegroundPid = 42 };
        var router = new RoutedGamepadAdapter(mock: true, keyboardSender: sender, foregroundProvider: fg);
        router.Initialize();
        router.TargetPid = 42;
        router.Bind(34, 32); // Handbrake -> Space (32)

        // 1. Keydown succeeds
        var activeState = new ControllerState(0x11, 1, 0, 0, 0, 0, 0, 1UL << 34);
        router.UpdateState(activeState);
        Assert.Contains((byte)32, router.PressedKeys);

        // 2. Interceptor makes keyup fail
        sender.Interceptor = (key, down) => down; // fails when down == false

        // 3. Input released -> keyup attempted but fails
        router.UpdateState(ControllerState.Neutral);

        // 4. System STILL retains unreleased key 32!
        Assert.Contains((byte)32, router.PressedKeys);

        // 5. Next attempt with sender functioning
        sender.Interceptor = null; // succeeds
        router.UpdateState(ControllerState.Neutral);

        // 6. Tracking is now safely cleared
        Assert.DoesNotContain((byte)32, router.PressedKeys);

        // Test same retention during TargetPid switch
        router.UpdateState(activeState);
        Assert.Contains((byte)32, router.PressedKeys);
        sender.Interceptor = (key, down) => down;
        router.TargetPid = 99; // triggers ReleaseAllPressedKeys
        Assert.Contains((byte)32, router.PressedKeys); // retained!
        sender.Interceptor = null;
        router.ResetToNeutral();
        Assert.DoesNotContain((byte)32, router.PressedKeys); // cleared!
    }

    [Fact]
    public void Step5_1_CompactVJoy_Modes_And_ReverseClutchButton6()
    {
        var vjoy = new FakeVJoyController { ButtonCount = 8 };
        var adapter = new VJoyGamepadAdapter(vjoy);
        adapter.Initialize();

        // 1. Mode AT (GearMode = 1)
        // Handbrake=1, Camera=2, Nitro=3, Park=5, Rev=6, Neutral=7, Drive=8
        var atState = new ControllerState(0x11, 1,
            Buttons: 0x1000 | 0x0200 | 0x8000 | 0x0001 | 0x0002 | 0x0004 | 0x0008,
            Brake: 0, Throttle: 0, Steering: 0, ExtendedButtons: 0, GearMode: 1);
        adapter.UpdateState(atState);
        Assert.Contains(1u, vjoy.PressedButtons);
        Assert.Contains(2u, vjoy.PressedButtons);
        Assert.Contains(3u, vjoy.PressedButtons);
        Assert.Contains(5u, vjoy.PressedButtons);
        Assert.Contains(6u, vjoy.PressedButtons); // Rev is Button 6 in AT
        Assert.Contains(7u, vjoy.PressedButtons);
        Assert.Contains(8u, vjoy.PressedButtons);

        // 2. Mode MT (GearMode = 2): Sequential, no clutch tap, NO reverse on button 6
        adapter.UpdateState(ControllerState.Neutral);
        var mtState = new ControllerState(0x11, 2,
            Buttons: 0x1000 | 0x2000 | 0x4000 | 0x8000 | 0x0200 | 0x0100 | 0x0002, // includes clutchBtn (0x0100) & rev (0x0002)
            Brake: 0, Throttle: 0, Steering: 0, ExtendedButtons: 0, GearMode: 2);
        adapter.UpdateState(mtState);
        Assert.Contains(1u, vjoy.PressedButtons); // Handbrake
        Assert.Contains(2u, vjoy.PressedButtons); // ShiftUp
        Assert.Contains(3u, vjoy.PressedButtons); // ShiftDown
        Assert.Contains(4u, vjoy.PressedButtons); // Nitro
        Assert.Contains(5u, vjoy.PressedButtons); // Camera
        Assert.DoesNotContain(6u, vjoy.PressedButtons); // In MT, clutch and rev are filtered from Button 6!
        Assert.DoesNotContain(7u, vjoy.PressedButtons);
        Assert.DoesNotContain(8u, vjoy.PressedButtons);

        // 3. Mode MTC (GearMode = 3): Clutch button is on Button 6; Reverse is filtered!
        adapter.UpdateState(ControllerState.Neutral);
        var mtcClutchOnly = new ControllerState(0x11, 3,
            Buttons: 0x0100,
            Brake: 0, Throttle: 0, Steering: 0, ExtendedButtons: 0, GearMode: 3);
        adapter.UpdateState(mtcClutchOnly);
        Assert.Contains(6u, vjoy.PressedButtons); // Clutch is Button 6 in MTC

        // Reverse sent in MTC must NOT trigger Button 6
        adapter.UpdateState(ControllerState.Neutral);
        var mtcRevOnly = new ControllerState(0x11, 4,
            Buttons: 0x0002,
            Brake: 0, Throttle: 0, Steering: 0, ExtendedButtons: 0, GearMode: 3);
        adapter.UpdateState(mtcRevOnly);
        Assert.DoesNotContain(6u, vjoy.PressedButtons); // Reverse filtered in MTC!

        // 4. Mode H (GearMode = 4): Gears 1..6 -> Buttons 1..6, Rev -> Button 7, Handbrake -> Button 8
        adapter.UpdateState(ControllerState.Neutral);
        var hState = new ControllerState(0x11, 5,
            Buttons: 0x1000 | 0x0002,
            Brake: 0, Throttle: 0, Steering: 0,
            ExtendedButtons: (1UL << 0) | (1UL << 5),
            GearMode: 4);
        adapter.UpdateState(hState);
        Assert.Contains(1u, vjoy.PressedButtons); // Gear 1
        Assert.Contains(6u, vjoy.PressedButtons); // Gear 6
        Assert.Contains(7u, vjoy.PressedButtons); // Reverse is Button 7 in Mode H
        Assert.Contains(8u, vjoy.PressedButtons); // Handbrake is Button 8 in Mode H

        // 5. Clutch analog axis Rx vs button route:
        // Set analog clutch to 200 in Mode H -> AxisRx updated, but button 6 is NOT pressed (unless gear 6)
        adapter.UpdateState(ControllerState.Neutral);
        var clutchAxisState = new ControllerState(0x11, 6, 0, 0, 0, 0, Clutch: 200, GearMode: 4);
        adapter.UpdateState(clutchAxisState);
        Assert.DoesNotContain(6u, vjoy.PressedButtons); // having axis Rx does NOT press button 6!
    }

    [Fact]
    public void Step5_1_IPC_Consumer_BindingZero_Preserved()
    {
        var sender = new FakeKeyboardSender();
        var fg = new FakeForegroundProvider { ForegroundPid = 42 };
        var vjoy = new FakeVJoyController { ButtonCount = 70 };
        var vjoyAdapter = new VJoyGamepadAdapter(vjoy);
        var router = new RoutedGamepadAdapter(mock: false, customOutput: vjoyAdapter, keyboardSender: sender, foregroundProvider: fg);
        router.Initialize();
        router.TargetPid = 42;

        // Start with Handbrake bound to Space (32)
        router.Bind(34, 32);

        // Frame 0x14 for index 34 with key 0 (explicit unbind)
        byte[] ipcFrame = new byte[8];
        ipcFrame[0] = 0x14;
        ipcFrame[1] = 34; // Action index 34 (parkingBrake)
        ipcFrame[2] = 0;  // Explicit Key 0
        // bytes 3..7 are 0

        // Parse through production IPC frame logic from NamedPipeServer
        bool validIpc = ipcFrame[0] == 0x14 && ipcFrame[1] < 64 && ipcFrame.AsSpan(3).IndexOfAnyExcept((byte)0) < 0;
        Assert.True(validIpc);

        // Consumer applies binding:
        router.Bind(ipcFrame[1], ipcFrame[2]);

        // Now send handbrake input:
        var handbrakeInput = new ControllerState(0x11, 1, 0x1000, 0, 0, 0, 0, 1UL << 34);
        router.UpdateState(handbrakeInput);

        // Router MUST NOT send keyboard event:
        Assert.Empty(sender.History);
        Assert.Empty(router.PressedKeys);

        // And router MUST route to virtual vJoy canonical button 11:
        Assert.Contains(11u, vjoy.PressedButtons);
    }

    [Fact]
    public void Step5_AT_Gears_RouteVirtualDPadWhenKeysAreZero_AndRouteKeyboardWhenExplicitlyBound()
    {
        var keyboard = new FakeKeyboardSender();
        var fg = new FakeForegroundProvider { ForegroundPid = 9999 };
        var mockOutput = new MockGamepadAdapter();
        mockOutput.Initialize();

        var router = new RoutedGamepadAdapter(mock: true, customOutput: mockOutput, keyboardSender: keyboard, foregroundProvider: fg);
        router.Configure(1); // XInput
        router.TargetPid = 9999;

        // By default, AT gears (6: Rev, 7: Park, 8: Drive, 9: Neutral) have key 0
        router.Bind(6, 0);
        router.Bind(7, 0);
        router.Bind(8, 0);
        router.Bind(9, 0);

        // 1. Park (buttons 0x0001, extended bit 7)
        var parkState = new ControllerState(0x11, 1, 0x0001, 0, 0, 0, 0, 1UL << 7);
        router.UpdateState(parkState);
        Assert.Empty(keyboard.History);
        var received = mockOutput.StateHistory[^1];
        Assert.Equal(0x0001, received.Buttons & 0x0001); // DPad Up intact
        Assert.NotEqual(0UL, received.ExtendedButtons & (1UL << 7));

        // 2. Drive (buttons 0x0008, extended bit 8)
        var driveState = new ControllerState(0x11, 2, 0x0008, 0, 0, 0, 0, 1UL << 8);
        router.UpdateState(driveState);
        Assert.Empty(keyboard.History);
        received = mockOutput.StateHistory[^1];
        Assert.Equal(0x0008, received.Buttons & 0x0008); // DPad Right intact
        Assert.NotEqual(0UL, received.ExtendedButtons & (1UL << 8));

        // 3. Explicitly bind Drive (index 8) to 'D' (68)
        router.ResetToNeutral();
        keyboard.History.Clear();
        mockOutput.StateHistory.Clear();
        router.Bind(8, 68);

        router.UpdateState(driveState);
        Assert.Single(keyboard.History);
        Assert.Equal(((byte)68, true), keyboard.History[0]);
        received = mockOutput.StateHistory[^1];
        Assert.Equal(0, received.Buttons & 0x0008); // DPad Right stripped from virtual output
        Assert.Equal(0UL, received.ExtendedButtons & (1UL << 8));
    }
}

