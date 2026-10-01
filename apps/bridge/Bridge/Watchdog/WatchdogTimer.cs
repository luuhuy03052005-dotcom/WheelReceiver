using LanRacingWheel.Bridge.Adapters;
using LanRacingWheel.Bridge.Protocol;
namespace LanRacingWheel.Bridge.Watchdog;
public sealed class WatchdogTimer : IDisposable
{
    public const int DefaultTimeoutMs=150;
    private readonly IGamepadAdapter _adapter;
    private readonly Timer _timer;
    private readonly int _deadline;
    private long _lastKick;
    private bool _active, _disposed;
    public object SyncRoot {get;}=new();
    public event Action? OnWatchdogTriggered;
    public WatchdogTimer(IGamepadAdapter adapter,int timeoutMs=DefaultTimeoutMs){
        _adapter=adapter;_deadline=Math.Max(1,timeoutMs-35);
        _timer=new Timer(Check,null,5,5);
    }
    public void Apply(ControllerState state){lock(SyncRoot){
        if(_disposed)return;
        _adapter.UpdateState(state);_lastKick=Environment.TickCount64;_active=true;
    }}
    public void Kick(){lock(SyncRoot){_lastKick=Environment.TickCount64;_active=true;}}
    public void Reset(){lock(SyncRoot){_active=false;_adapter.ResetToNeutral();}}
    private void Check(object? _){lock(SyncRoot){
        if(_disposed||!_active||Environment.TickCount64-_lastKick<_deadline)return;
        _active=false;
        try{_adapter.ResetToNeutral();OnWatchdogTriggered?.Invoke();}
        catch(Exception ex){Console.Error.WriteLine("[Watchdog] "+ex.Message);}
    }}
    public void Dispose(){lock(SyncRoot){if(_disposed)return;_disposed=true;_timer.Dispose();_adapter.ResetToNeutral();}}
}
