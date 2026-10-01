using System;
using Nefarius.ViGEm.Client;
using Nefarius.ViGEm.Client.Targets;
using Nefarius.ViGEm.Client.Targets.Xbox360;
using LanRacingWheel.Bridge.Protocol;

namespace LanRacingWheel.Bridge.Adapters
{
    public sealed class ViGEmGamepadAdapter : IGamepadAdapter
    {
        private ViGEmClient? _client;
        private IXbox360Controller? _controller;
        private bool _disposed;

        public bool IsConnected => _controller != null && !_disposed;
        public ControllerState CurrentState { get; private set; } = ControllerState.Neutral;

        public void Initialize()
        {
            if (_controller != null) return;

            try
            {
                _client = new ViGEmClient();
                _controller = _client.CreateXbox360Controller();
                _controller.Connect();
                ResetToNeutral();
                Console.WriteLine("[ViGEmAdapter] Virtual Xbox 360 controller connected successfully via ViGEmBus.");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[ViGEmAdapter] Warning: ViGEmBus driver not available: {ex.Message}");
                Dispose();
                throw;
            }
        }

        public void UpdateState(ControllerState state)
        {
            if (_controller == null || _disposed) return;

            CurrentState = state;

            // Map Steering to LeftThumbX (int16: -32768 to 32767)
            _controller.SetAxisValue(Xbox360Axis.LeftThumbX, state.Steering);

            // Keep other axes centered at 0
            _controller.SetAxisValue(Xbox360Axis.LeftThumbY, 0);
            _controller.SetAxisValue(Xbox360Axis.RightThumbX, 0);

            // Map Clutch (0..255 from dedicated byte) to RightThumbY (0 to 32767)
            // When released (0), stick rests at neutral center (0) to avoid camera drift
            short clutchAxis = 0; // Clutch uses LB; leave camera axes neutral in XInput games.
            _controller.SetAxisValue(Xbox360Axis.RightThumbY, clutchAxis);

            // Map Brake to LeftTrigger (uint8: 0 to 255)
            _controller.SetSliderValue(Xbox360Slider.LeftTrigger, state.Brake);

            // Map Throttle to RightTrigger (uint8: 0 to 255)
            _controller.SetSliderValue(Xbox360Slider.RightTrigger, state.Throttle);

            // Map Buttons (using specific mask bits from V2 protocol)
            ushort buttons = state.Buttons;
            _controller.SetButtonState(Xbox360Button.A, (buttons & 0x1000) != 0);
            _controller.SetButtonState(Xbox360Button.B, (buttons & 0x2000) != 0);
            _controller.SetButtonState(Xbox360Button.X, (buttons & 0x4000) != 0);
            _controller.SetButtonState(Xbox360Button.Y, (buttons & 0x8000) != 0);
            _controller.SetButtonState(Xbox360Button.LeftShoulder, (buttons & 0x0100) != 0);
            _controller.SetButtonState(Xbox360Button.RightShoulder, (buttons & 0x0200) != 0);

            // DPad buttons for AT gear selection and general use
            _controller.SetButtonState(Xbox360Button.Up, (buttons & 0x0001) != 0);
            _controller.SetButtonState(Xbox360Button.Down, (buttons & 0x0002) != 0);
            _controller.SetButtonState(Xbox360Button.Left, (buttons & 0x0004) != 0);
            _controller.SetButtonState(Xbox360Button.Right, (buttons & 0x0008) != 0);

            _controller.SubmitReport();
        }

        public void ResetToNeutral()
        {
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
                    ResetToNeutral();
                    _controller.Disconnect();
                    _controller = null;
                }
                _client?.Dispose();
                _client = null;
            }
            catch
            {
                // Suppress cleanup errors
            }
        }
    }
}
