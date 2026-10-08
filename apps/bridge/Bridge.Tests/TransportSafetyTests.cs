using System.Diagnostics;
using LanRacingWheel.Bridge.Adapters;
using LanRacingWheel.Bridge.Ipc;
using LanRacingWheel.Bridge.Protocol;
using LanRacingWheel.Bridge.Watchdog;
using Xunit;

namespace LanRacingWheel.Bridge.Tests;

public class TransportSafetyTests
{
    private sealed class MockSinkAdapter : IGamepadAdapter
    {
        public bool IsConnected => true;
        public ControllerState CurrentState => LastState ?? ControllerState.Neutral;
        public ControllerState? LastState { get; private set; }
        public int ResetCount { get; private set; }
        public List<(double TimestampMs, ControllerState State)> StateHistory { get; } = new();
        private readonly Stopwatch _sw = Stopwatch.StartNew();

        public void Initialize() { }
        public void Dispose() { }

        public void UpdateState(ControllerState state)
        {
            LastState = state;
            StateHistory.Add((_sw.Elapsed.TotalMilliseconds, state));
        }

        public void ResetToNeutral()
        {
            ResetCount++;
            LastState = ControllerState.Neutral;
            StateHistory.Add((_sw.Elapsed.TotalMilliseconds, ControllerState.Neutral));
        }
    }

    [Fact]
    public async Task TestO_WatchdogMeasuresPreciseTimingUnder150ms()
    {
        var sink = new MockSinkAdapter();
        using var watchdog = new WatchdogTimer(sink, WatchdogTimer.DefaultTimeoutMs);
        var tcs = new TaskCompletionSource<double>();
        var sw = new Stopwatch();

        watchdog.OnWatchdogTriggered += () =>
        {
            tcs.TrySetResult(sw.Elapsed.TotalMilliseconds);
        };

        var activeState = new ControllerState(0x11, 1, 0x1000, 15000, 200, 255, 0, 0);
        sw.Start();
        watchdog.Apply(activeState);

        var elapsedMs = await tcs.Task.WaitAsync(TimeSpan.FromSeconds(2));

        // Contract BR-SAFE-01 & BR-SAFE-06: Neutralize virtual controller within 150 ms
        Assert.True(elapsedMs <= 150.0, $"Watchdog elapsed time must be <= 150ms, was {elapsedMs:F2}ms");
        Assert.True(elapsedMs >= 100.0, $"Watchdog elapsed time must be >= 100ms, was {elapsedMs:F2}ms");
        Assert.Equal(ControllerState.Neutral, sink.LastState);
        Assert.True(sink.ResetCount >= 1, "ResetToNeutral must be called");
    }

    [Fact]
    public async Task TestH_IsolatedExtensionsDoNotRefreshWatchdog()
    {
        var sink = new MockSinkAdapter();
        using var watchdog = new WatchdogTimer(sink, WatchdogTimer.DefaultTimeoutMs);
        var assembler = new FrameAssembler();
        var tcs = new TaskCompletionSource<double>();
        var sw = Stopwatch.StartNew();

        watchdog.OnWatchdogTriggered += () =>
        {
            tcs.TrySetResult(sw.Elapsed.TotalMilliseconds);
        };

        // 1. Send valid initial state frame
        var stateBytes = new byte[] { 0x11, 1, 0, 0x10, 0, 0, 0, 255 }; // Handbrake
        Assert.True(assembler.Accept(stateBytes, out var state));
        watchdog.Apply(state);

        // 2. Continually send isolated EXT_A frames (0x12) for 200ms
        var extA = new byte[] { 0x12, 2, 0, 0, 0, 0, 0, 0 };
        for (int i = 0; i < 20; i++)
        {
            var accepted = assembler.Accept(extA, out var s);
            Assert.False(accepted, "Isolated EXT_A frame must NOT be accepted");
            if (accepted) watchdog.Apply(s);
            await Task.Delay(10);
            if (tcs.Task.IsCompleted) break;
        }

        var elapsedMs = await tcs.Task.WaitAsync(TimeSpan.FromSeconds(2));
        Assert.True(elapsedMs <= 150.0, $"Watchdog must fire <= 150ms despite isolated EXT_A traffic, was {elapsedMs:F2}ms");
        Assert.Equal(ControllerState.Neutral, sink.LastState);
    }

    [Fact]
    public async Task TestG_DuplicateAndStaleFramesDoNotRefreshWatchdog()
    {
        var sink = new MockSinkAdapter();
        using var watchdog = new WatchdogTimer(sink, WatchdogTimer.DefaultTimeoutMs);
        var assembler = new FrameAssembler();
        var tcs = new TaskCompletionSource<double>();

        watchdog.OnWatchdogTriggered += () =>
        {
            tcs.TrySetResult(1);
        };

        // Valid frame sequence 5
        var frameSeq5 = new byte[] { 0x11, 5, 0, 0x10, 0, 0, 0, 200 };
        Assert.True(assembler.Accept(frameSeq5, out var s5));
        watchdog.Apply(s5);

        // Send duplicate frame sequence 5 repeatedly
        for (int i = 0; i < 15; i++)
        {
            var accepted = assembler.Accept(frameSeq5, out var s);
            Assert.False(accepted, "Duplicate sequence must NOT be accepted");
            if (accepted) watchdog.Apply(s);
            await Task.Delay(10);
            if (tcs.Task.IsCompleted) break;
        }

        await tcs.Task.WaitAsync(TimeSpan.FromSeconds(2));
        Assert.Equal(ControllerState.Neutral, sink.LastState);
    }

    [Fact]
    public void TestI_MismatchedExtensionsAreRejectedWithoutPartialApply()
    {
        var assembler = new FrameAssembler();

        // Staged EXT_A sequence 10
        var extA = new byte[] { 0x12, 10, 150, 4, 1, 0, 0, 0 };
        Assert.False(assembler.Accept(extA, out _));

        // Mismatched EXT_B sequence 11
        var extB = new byte[] { 0x13, 11, 0, 0, 0, 0, 0, 0 };
        Assert.False(assembler.Accept(extB, out _));

        // State sequence 10
        var state = new byte[] { 0x11, 10, 0, 0, 0, 0, 0, 0 };
        var accepted = assembler.Accept(state, out var result);

        Assert.False(accepted, "Mismatched extension frame must NOT be accepted or downgraded to state-only");
    }

    [Fact]
    public void TestJ_SequenceWrap255To0IsAccepted()
    {
        var assembler = new FrameAssembler();

        var frame255 = new byte[] { 0x11, 255, 0, 0, 0, 0, 0, 100 };
        Assert.True(assembler.Accept(frame255, out var s255));
        Assert.Equal(255, s255.Sequence);

        var frame0 = new byte[] { 0x11, 0, 0, 0, 0, 0, 0, 150 };
        Assert.True(assembler.Accept(frame0, out var s0));
        Assert.Equal(0, s0.Sequence);
        Assert.Equal(150, s0.Throttle);
    }
}
