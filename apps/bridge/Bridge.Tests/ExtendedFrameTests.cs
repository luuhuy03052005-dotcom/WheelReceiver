using System.Diagnostics;
using LanRacingWheel.Bridge.Protocol;
using LanRacingWheel.Bridge.Adapters;
using LanRacingWheel.Bridge.Watchdog;
using Xunit;
namespace LanRacingWheel.Bridge.Tests;
public class ExtendedFrameTests {
 [Fact] public void CommitRequiresMatchingExtensionSequence(){
  var assembler=new FrameAssembler();
  Assert.False(assembler.Accept(new byte[]{0x12,1,201,0,3,0,0,0},out _));
  Assert.False(assembler.Accept(new byte[]{0x13,1,0,0,0,128,0,0},out _));
  Assert.True(assembler.Accept(new byte[]{0x11,1,0,0,0,128,0,255},out var state));
  Assert.Equal((byte)201,state.Clutch);Assert.Equal((1UL<<63)|3,state.ExtendedButtons);Assert.Equal(-32768,state.Steering);
  Assert.False(assembler.Accept(state.ToBytes(),out _));
  assembler.Reset();Assert.True(assembler.Accept(state.ToBytes(),out var plain));Assert.Equal(0UL,plain.ExtendedButtons);
 }
 [Fact] public void MalformedLengthsAndIncompleteBundlesDoNotApply(){
  var assembler=new FrameAssembler();
  Assert.False(ControllerState.TryParse(new byte[]{0x11,0,0,0,0,0,0,0,0},out _));
  assembler.Accept(new byte[]{0x12,2,255,0,0,0,0,0},out _);
  Assert.False(assembler.Accept(new byte[]{0x11,2,0,0,0,0,0,255},out _));
 }
 [Fact] public async Task DefaultWatchdogNeutralizesFullInputWithin150Milliseconds(){
  using var adapter=new MockGamepadAdapter();adapter.Initialize();
  using var watchdog=new WatchdogTimer(adapter);
  var completion=new TaskCompletionSource<double>(TaskCreationOptions.RunContinuationsAsynchronously);
  var clock=Stopwatch.StartNew();watchdog.OnWatchdogTriggered+=()=>completion.TrySetResult(clock.Elapsed.TotalMilliseconds);
  watchdog.Apply(new ControllerState(0x11,1,0xffff,32767,255,255,255,ulong.MaxValue));
  var elapsed=await completion.Task.WaitAsync(TimeSpan.FromSeconds(2));
  Assert.InRange(elapsed,1,150);Assert.Equal(ControllerState.Neutral,adapter.CurrentState);
 }
}
