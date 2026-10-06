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

        public bool IsConnected => _controller != null && !_controller.HasRelinquished && !_disposed;
        public ControllerState CurrentState { get; private set; } = ControllerState.Neutral;
        public int ButtonCount => (int)(_controller?.ButtonCount ?? 0);

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
                    Console.WriteLine($"[VJoyAdapter] WARNING: vJoy Device 1 has {_controller.ButtonCount}/70 buttons. Configure 70 or more buttons to expose all 64 semantic actions plus the six primary buttons.");
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

            CurrentState = state;

            // Map Steering to Axis X
            // state.Steering is [-32768, 32767]. vJoy axis is usually [0, _axisMax], where center is _axisMax/2
            int steeringNorm = state.Steering + 32768; // 0 to 65535
            int vJoyX = (int)((long)steeringNorm * _axisMax / 65535L);
            if (_controller.HasAxisX) _controller.SetAxisX(vJoyX);

            // Keep Y, Z, Rx centered at 0 if no pedals, else we map them below
            // Throttle (Y Axis), Brake (Z Axis), Clutch (Rx Axis)
            // state.Throttle, Brake, Clutch are 0..255. We map to 0.._axisMax
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

            if (_controller.ButtonCount >= 16)
            {
                for (int i = 0; i < 64; i++)
                {
                    bool pressed = (state.ExtendedButtons & (1UL << i)) != 0;
                    if (i == 6) pressed = rev;
                    else if (i == 7) pressed = park;
                    else if (i == 8) pressed = drive;
                    else if (i == 9) pressed = neutral;
                    else if (i == 34) pressed = handbrake;
                    else if (i == 58) pressed = camera;

                    UpdateButton((uint)(i < 10 ? i + 1 : i + 7), pressed);
                }

                // Action Buttons (11-16)
                UpdateButton(11, handbrake); // Handbrake (A)
                UpdateButton(12, (buttons & 0x2000) != 0); // Shift Up (B)
                UpdateButton(13, (buttons & 0x4000) != 0); // Shift Down (X)
                UpdateButton(14, (buttons & 0x8000) != 0); // Nitro (Y)
                UpdateButton(15, camera); // Camera (RB)
                UpdateButton(16, (buttons & 0x0100) != 0); // Clutch (LB)

                // DPad as vJoy buttons for AT gear selection (also mirrored to 67-70 if device has 70+ buttons)
                if (_controller.ButtonCount >= 70)
                {
                    UpdateButton(67, park); // DPad Up (P - Park)
                    UpdateButton(68, rev); // DPad Down (R - Reverse)
                    UpdateButton(69, neutral); // DPad Left (N - Neutral)
                    UpdateButton(70, drive); // DPad Right (D - Drive)
                }
            }
            else
            {
                // Compact mode for standard 8-button vJoy devices
                if (state.GearMode == 4)
                {
                    for (int i = 0; i < 7; i++) UpdateButton((uint)(i + 1), (state.ExtendedButtons & (1UL << i)) != 0);
                    UpdateButton(8, handbrake); // Handbrake
                }
                else
                {
                    UpdateButton(1, handbrake); // Handbrake (A)
                    UpdateButton(2, (buttons & 0x2000) != 0); // Shift Up (B)
                    UpdateButton(3, (buttons & 0x4000) != 0); // Shift Down (X)
                    UpdateButton(4, (buttons & 0x8000) != 0 || camera); // Nitro / Camera
                    UpdateButton(5, park); // Park (P) -> Button 5
                    UpdateButton(6, rev); // Reverse (R) -> Button 6
                    UpdateButton(7, neutral); // Neutral (N) -> Button 7
                    UpdateButton(8, drive); // Drive (D) -> Button 8
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

        public void ResetToNeutral()
        {
            if (_controller == null || _disposed) return;
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
