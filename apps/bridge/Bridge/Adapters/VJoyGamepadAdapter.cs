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
            if (_controller.ButtonCount >= 16)
            {
                for (int i=0;i<64;i++) UpdateButton((uint)(i<10?i+1:i+7), (state.ExtendedButtons & (1UL<<i))!=0);

                // Action Buttons
                UpdateButton(11, (buttons & 0x1000) != 0); // Handbrake (A)
                UpdateButton(12, (buttons & 0x2000) != 0); // Shift Up (B)
                UpdateButton(13, (buttons & 0x4000) != 0); // Shift Down (X)
                UpdateButton(14, (buttons & 0x8000) != 0); // Nitro (Y)
                UpdateButton(15, (buttons & 0x0200) != 0); // Camera (RB)
                UpdateButton(16, (buttons & 0x0100) != 0); // Clutch (LB)

                // DPad as vJoy buttons for AT gear selection
                if (_controller.ButtonCount >= 70)
                {
                    UpdateButton(67, (buttons & 0x0001) != 0); // DPad Up (P · Park)
                    UpdateButton(68, (buttons & 0x0002) != 0); // DPad Down (R · Reverse)
                    UpdateButton(69, (buttons & 0x0004) != 0); // DPad Left (N · Neutral)
                    UpdateButton(70, (buttons & 0x0008) != 0); // DPad Right (D · Drive)
                }
            }
            else
            {
                // Compact mode for standard 8-button vJoy devices
                if (state.GearMode == 4)
                {
                    for (int i=0;i<7;i++) UpdateButton((uint)(i+1), (state.ExtendedButtons & (1UL<<i))!=0);
                    UpdateButton(8, (buttons & 0x1000) != 0); // Handbrake
                }
                else
                {
                    UpdateButton(1, (buttons & 0x1000) != 0); // Handbrake (A)
                    UpdateButton(2, (buttons & 0x2000) != 0); // Shift Up (B)
                    UpdateButton(3, (buttons & 0x4000) != 0); // Shift Down (X)
                    UpdateButton(4, (buttons & 0x8000) != 0); // Nitro (Y)
                    UpdateButton(5, (buttons & 0x0200) != 0); // Camera (RB)
                    UpdateButton(6, (buttons & 0x0100) != 0); // Clutch (LB)
                    UpdateButton(7, (buttons & 0x0001) != 0 || (buttons & 0x0004) != 0);
                    UpdateButton(8, (buttons & 0x0002) != 0 || (buttons & 0x0008) != 0);
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
