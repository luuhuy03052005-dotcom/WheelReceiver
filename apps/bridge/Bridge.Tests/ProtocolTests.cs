using System;
using LanRacingWheel.Bridge.Protocol;
using Xunit;

namespace LanRacingWheel.Bridge.Tests
{
    public class ProtocolTests
    {
        [Fact]
        public void GoldenVector_Neutral()
        {
            byte[] bytes = new byte[] { 0x11, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 };
            bool parsed = ControllerState.TryParse(bytes, out var state);

            Assert.True(parsed);
            Assert.Equal(0x11, state.Header);
            Assert.Equal(0, state.Sequence);
            Assert.Equal(0, state.Buttons);
            Assert.Equal(0, state.Steering);
            Assert.Equal(0, state.Brake);
            Assert.Equal(0, state.Throttle);
            Assert.Equal(bytes, state.ToBytes());
        }

        [Fact]
        public void GoldenVector_FullRight_FullThrottle()
        {
            byte[] bytes = new byte[] { 0x11, 0x01, 0x00, 0x00, 0xFF, 0x7F, 0x00, 0xFF };
            bool parsed = ControllerState.TryParse(bytes, out var state);

            Assert.True(parsed);
            Assert.Equal(0x11, state.Header);
            Assert.Equal(1, state.Sequence);
            Assert.Equal(0, state.Buttons);
            Assert.Equal(32767, state.Steering);
            Assert.Equal(0, state.Brake);
            Assert.Equal(255, state.Throttle);
            Assert.Equal(bytes, state.ToBytes());
        }

        [Fact]
        public void GoldenVector_FullLeft_FullBrake_Clutch_ShiftUp()
        {
            // Buttons: Clutch (0x0100) | Shift Up (0x2000) = 0x2100 -> LE: 0x00, 0x21
            // Steering: -32768 -> 0x8000 -> LE: 0x00, 0x80
            byte[] bytes = new byte[] { 0x11, 0xFF, 0x00, 0x21, 0x00, 0x80, 0xFF, 0x00 };
            bool parsed = ControllerState.TryParse(bytes, out var state);

            Assert.True(parsed);
            Assert.Equal(0x11, state.Header);
            Assert.Equal(255, state.Sequence);
            Assert.Equal(0x2100, state.Buttons);
            Assert.Equal(-32768, state.Steering);
            Assert.Equal(255, state.Brake);
            Assert.Equal(0, state.Throttle);
            Assert.Equal(bytes, state.ToBytes());
        }

        [Fact]
        public void Rejects_InvalidLength()
        {
            byte[] tooShort = new byte[] { 0x11, 0x00, 0x00 };
            byte[] tooLong = new byte[9];

            Assert.False(ControllerState.TryParse(tooShort, out _));
            Assert.False(ControllerState.TryParse(tooLong, out _));
        }

        [Fact]
        public void Rejects_InvalidHeader()
        {
            byte[] invalidHeader = new byte[] { 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 };
            Assert.False(ControllerState.TryParse(invalidHeader, out _));
        }
    }
}
