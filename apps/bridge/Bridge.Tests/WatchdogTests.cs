using System;
using System.Threading;
using System.Threading.Tasks;
using LanRacingWheel.Bridge.Adapters;
using LanRacingWheel.Bridge.Protocol;
using LanRacingWheel.Bridge.Watchdog;
using Xunit;

namespace LanRacingWheel.Bridge.Tests
{
    public class WatchdogTests
    {
        [Fact]
        public async Task Watchdog_ResetsToNeutral_WhenInputStops()
        {
            var mockAdapter = new MockGamepadAdapter();
            mockAdapter.Initialize();

            // Set to full throttle & steering
            var activeState = new ControllerState(0x11, 1, 0, 30000, 0, 255);
            mockAdapter.UpdateState(activeState);

            Assert.Equal(30000, mockAdapter.CurrentState.Steering);
            Assert.Equal(255, mockAdapter.CurrentState.Throttle);

            using var watchdog = new WatchdogTimer(mockAdapter, 100);
            watchdog.Kick();

            // Wait 150ms (> 100ms timeout)
            await Task.Delay(160);

            // Assert watchdog reset adapter to neutral
            Assert.Equal(ControllerState.Neutral, mockAdapter.CurrentState);
            Assert.True(mockAdapter.NeutralResetCount > 0);
        }

        [Fact]
        public async Task Watchdog_DoesNotTrigger_WhenContinuouslyKicked()
        {
            var mockAdapter = new MockGamepadAdapter();
            mockAdapter.Initialize();

            var activeState = new ControllerState(0x11, 1, 0, 15000, 0, 200);
            mockAdapter.UpdateState(activeState);

            using var watchdog = new WatchdogTimer(mockAdapter, 100);

            for (int i = 0; i < 5; i++)
            {
                watchdog.Kick();
                await Task.Delay(30);
            }

            // Should still be active state
            Assert.Equal(15000, mockAdapter.CurrentState.Steering);
            Assert.Equal(200, mockAdapter.CurrentState.Throttle);
        }
    }
}
