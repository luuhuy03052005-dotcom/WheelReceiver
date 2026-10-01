using LanRacingWheel.Bridge.Adapters;
using LanRacingWheel.Bridge.Ipc;
using LanRacingWheel.Bridge.Watchdog;
namespace LanRacingWheel.Bridge;
internal static class Program {
    private static async Task Main(string[] args){
        using var adapter=new RoutedGamepadAdapter(args.Contains("--mock"));
        adapter.Initialize();
        using var watchdog=new WatchdogTimer(adapter);
        var pipeArg=Array.IndexOf(args,"--pipe");
        using var pipe=new NamedPipeServer(adapter,watchdog,pipeArg>=0&&pipeArg+1<args.Length?args[pipeArg+1]:null);
        if(args.Contains("--observe"))pipe.OnFrameReceived+=state=>Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(state));
        pipe.Start();
        Console.WriteLine("[Bridge] Active: "+adapter.Backend);
        var stop=new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        Console.CancelKeyPress+=(s,e)=>{e.Cancel=true;watchdog.Reset();stop.TrySetResult();};
        AppDomain.CurrentDomain.ProcessExit+=(s,e)=>{try{watchdog.Reset();}catch{}};
        await stop.Task;
    }
}
