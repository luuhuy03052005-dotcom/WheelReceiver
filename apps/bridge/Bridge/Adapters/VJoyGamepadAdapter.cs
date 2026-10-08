using System;
using LanRacingWheel.Bridge.Protocol;
using CoreDX.vJoy.Wrapper;

namespace LanRacingWheel.Bridge.Adapters
{
    public sealed class VJoyGamepadAdapter : IGamepadAdapter
    {
        private VJoyControllerManager? _manager;
        private IVJoyController? _controller;
        private bool _disposed;
        private long _axisMax = 32767;
        private byte _lastGearMode;

        public bool IsConnected => _controller != null && !_controller.HasRelinquished && !_disposed;
        public ControllerState CurrentState { get; private set; } = ControllerState.Neutral;
        public int ButtonCount => (int)(_controller?.ButtonCount ?? 0);

        public VJoyGamepadAdapter(IVJoyController? controller = null)
        {
            _controller = controller;
            if (_controller != null)
            {
                _axisMax = _controller.AxisMaxValue ?? 32767L;
                if (_axisMax <= 0) _axisMax = 32767;
            }
        }

        public void Initialize()
        {
            if (_controller != null) return;

            try
            {
                _manager = VJoyControllerManager.GetManager();
                if (!_manager.IsVJoyEnabled)
                {
                    throw new Exception("vJoy is installed but not enabled or driver is not loaded.");
                }

                // Acquire device ID 1
                _controller = _manager.AcquireController(1);

                if (_controller == null)
                {
                    throw new Exception("Failed to acquire vJoy device ID 1. Is it configured in Configure vJoy?");
                }

                if (_controller.ButtonCount < 70)
                {
                    Console.WriteLine($"[VJoyAdapter] WARNING: vJoy Device 1 has {_controller.ButtonCount}/70 buttons. Configure 70 or more buttons to expose all 64 semantic actions plus primary buttons.");
                }

                _axisMax = _controller.AxisMaxValue ?? 32767L;
                if (_axisMax <= 0) _axisMax = 32767;

                ResetToNeutral();
                Console.WriteLine($"[VJoyAdapter] vJoy Device 1 connected successfully ({_controller.ButtonCount} buttons). Max Axis: " + _axisMax);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[VJoyAdapter] Failed to initialize vJoy: {ex.Message}");
                Dispose();
                throw;
            }
        }

        public void UpdateState(ControllerState state)
        {
            if (_controller == null || _disposed || _controller.HasRelinquished) return;

            // When transmission mode changes, release old buttons so held inputs do not morph
            if (_lastGearMode != state.GearMode)
            {
                ReleaseAllButtons();
                _lastGearMode = state.GearMode;
            }

            CurrentState = state;

            // Map Steering to Axis X
            int steeringNorm = state.Steering + 32768; // 0 to 65535
            int vJoyX = (int)((long)steeringNorm * _axisMax / 65535L);
            if (_controller.HasAxisX) _controller.SetAxisX(vJoyX);

            // Throttle (Y Axis), Brake (Z Axis), Clutch (Rx Axis)
            int vJoyY = (int)((long)state.Throttle * _axisMax / 255L);
            int vJoyZ = (int)((long)state.Brake * _axisMax / 255L);
            int vJoyRx = (int)((long)state.Clutch * _axisMax / 255L);

            if (_controller.HasAxisY) _controller.SetAxisY(vJoyY);
            if (_controller.HasAxisZ) _controller.SetAxisZ(vJoyZ);
            if (_controller.HasAxisRx) _controller.SetAxisRx(vJoyRx);

            ushort buttons = state.Buttons;
            bool park = (buttons & 0x0001) != 0 || (state.ExtendedButtons & (1UL << 7)) != 0;
            bool rev = (buttons & 0x0002) != 0 || (state.ExtendedButtons & (1UL << 6)) != 0;
            bool neutral = (buttons & 0x0004) != 0 || (state.ExtendedButtons & (1UL << 9)) != 0;
            bool drive = (buttons & 0x0008) != 0 || (state.ExtendedButtons & (1UL << 8)) != 0;
            bool handbrake = (buttons & 0x1000) != 0 || (state.ExtendedButtons & (1UL << 34)) != 0;
            bool camera = (buttons & 0x0200) != 0 || (state.ExtendedButtons & (1UL << 58)) != 0;
            bool shiftUp = (buttons & 0x2000) != 0;
            bool shiftDown = (buttons & 0x4000) != 0;
            bool nitro = (buttons & 0x8000) != 0;
            bool clutchBtn = (buttons & 0x0100) != 0;

            if (_controller.ButtonCount >= 16)
            {
                // Buttons 1-10: Transmission gears
                for (int i = 0; i < 10; i++)
                {
                    bool pressed = (state.ExtendedButtons & (1UL << i)) != 0;
                    if (i == 6) pressed = rev;
                    else if (i == 7) pressed = park;
                    else if (i == 8) pressed = drive;
                    else if (i == 9) pressed = neutral;

                    UpdateButton((uint)(i + 1), pressed);
                }

                // Buttons 11-16: Canonical primary buttons
                UpdateButton(11, handbrake); // Canonical Button 11 for Handbrake / parkingBrake
                UpdateButton(12, shiftUp);   // Shift Up
                UpdateButton(13, shiftDown); // Shift Down
                UpdateButton(14, nitro);     // Nitro
                UpdateButton(15, camera);    // Canonical Button 15 for Camera / cameraPrimary
                UpdateButton(16, clutchBtn); // Clutch

                // Buttons 17-70: Auxiliary actions (excluding index 34 and index 58)
                for (int i = 10; i < 64; i++)
                {
                    if (i == 34 || i == 58) continue; // Handled canonically on buttons 11 and 15
                    uint buttonId = (uint)(i + 7);
                    bool pressed = (state.ExtendedButtons & (1UL << i)) != 0;
                    UpdateButton(buttonId, pressed);
                }
            }
            else
            {
                // Compact mode for standard 8-button vJoy devices (no colliding OR between nitro and camera)
                if (state.GearMode == 4) // Mode H
                {
                    for (int i = 0; i < 6; i++) UpdateButton((uint)(i + 1), (state.ExtendedButtons & (1UL << i)) != 0);
                    UpdateButton(7, rev);
                    UpdateButton(8, handbrake);
                }
                else if (state.GearMode == 1) // Mode AT
                {
                    UpdateButton(1, handbrake);
                    UpdateButton(2, camera);
                    UpdateButton(3, nitro);
                    UpdateButton(4, false); // Reserved
                    UpdateButton(5, park);
                    UpdateButton(6, rev);
                    UpdateButton(7, neutral);
                    UpdateButton(8, drive);
                }
                else // Mode MT / MTC
                {
                    UpdateButton(1, handbrake);
                    UpdateButton(2, shiftUp);
                    UpdateButton(3, shiftDown);
                    UpdateButton(4, nitro);
                    UpdateButton(5, camera);
                    UpdateButton(6, state.GearMode == 3 ? clutchBtn : false);
                    UpdateButton(7, false);
                    UpdateButton(8, false);
                }
            }
        }

        private void UpdateButton(uint buttonId, bool pressed)
        {
            if (_controller == null) return;
            if (buttonId < 1 || buttonId > _controller.ButtonCount) return;

            if (pressed)
                _controller.PressButton(buttonId);
            else
                _controller.ReleaseButton(buttonId);
        }

        public void ReleaseAllButtons()
        {
            if (_controller == null) return;
            for (uint b = 1; b <= _controller.ButtonCount; b++)
            {
                _controller.ReleaseButton(b);
            }
        }

        public void ResetToNeutral()
        {
            if (_controller == null || _disposed) return;
            ReleaseAllButtons();
            UpdateState(ControllerState.Neutral);
        }

        public void Dispose()
        {
            if (_disposed) return;
            ResetToNeutral();
            _disposed = true;

            try
            {
                if (_controller != null)
                {
                    _manager?.RelinquishController(_controller);
                    _controller = null;
                }
                if (_manager != null)
                {
                    _manager.Dispose();
                    _manager = null;
                }
            }
            catch
            {
                // Suppress cleanup errors
            }
        }
    }
}
