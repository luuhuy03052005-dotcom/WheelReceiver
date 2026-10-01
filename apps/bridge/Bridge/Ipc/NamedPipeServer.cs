using System.IO.Pipes;
using System.Buffers.Binary;
using System.Text;
using System.Text.Json;
using LanRacingWheel.Bridge.Adapters;
using LanRacingWheel.Bridge.Protocol;
using LanRacingWheel.Bridge.Watchdog;
namespace LanRacingWheel.Bridge.Ipc;
public sealed class NamedPipeServer : IDisposable
{
    public const string PipeName="lan_racing_wheel_ipc";
    private readonly string _name;
    private readonly IGamepadAdapter _adapter;
    private readonly WatchdogTimer _watchdog;
    private readonly CancellationTokenSource _cts=new();
    private Task? _task;
    public event Action<ControllerState>? OnFrameReceived;
    public event Action? OnClientConnected;
    public event Action? OnClientDisconnected;
    public NamedPipeServer(IGamepadAdapter adapter,WatchdogTimer watchdog,string? pipeName=null){_adapter=adapter;_watchdog=watchdog;_name=pipeName??PipeName;}
    public void Start(){_task=Task.Run(()=>Listen(_cts.Token));}
    private object Status(string type="ready",ControllerState? state=null){
        var router=_adapter as RoutedGamepadAdapter;
        return new {type,connected=_adapter.IsConnected,backend=router?.Backend??"mock",
            buttons=router?.ButtonCount??0,keyboard=router?.Backend is "xinput" or "vjoy",
            error=router?.Error,state};
    }
    private static async Task Reply(NamedPipeServerStream pipe,object data,CancellationToken ct){
        var bytes=Encoding.UTF8.GetBytes(JsonSerializer.Serialize(data)+"\n");
        await pipe.WriteAsync(bytes,ct);
    }
    private async Task Listen(CancellationToken ct){
        while(!ct.IsCancellationRequested){
            using var pipe=new NamedPipeServerStream(_name,PipeDirection.InOut,1,PipeTransmissionMode.Byte,PipeOptions.Asynchronous|PipeOptions.CurrentUserOnly);
            var assembler=new FrameAssembler();var buffer=new byte[8];long lastReport=0;
            try{
                await pipe.WaitForConnectionAsync(ct);_watchdog.Reset();OnClientConnected?.Invoke();
                await Reply(pipe,Status(),ct);
                while(pipe.IsConnected&&!ct.IsCancellationRequested){
                    await pipe.ReadExactlyAsync(buffer,ct);
                    bool report=false;ControllerState? applied=null;
                    lock(_watchdog.SyncRoot){
                        if(buffer[0]==0x1f && buffer.AsSpan(1).IndexOfAnyExcept((byte)0)<0){assembler.Reset();_watchdog.Reset();report=true;}
                        else if(buffer[0]==0x15 && buffer[1] is 1 or 2 && buffer[2]==0 && buffer[3]==0 && _adapter is RoutedGamepadAdapter router){
                            _watchdog.Reset();assembler.Reset();router.Configure(buffer[1]);
                            router.TargetPid=BinaryPrimitives.ReadUInt32LittleEndian(buffer.AsSpan(4,4));report=true;
                        }
                        else if(buffer[0]==0x14 && buffer[1]<64 && buffer.AsSpan(3).IndexOfAnyExcept((byte)0)<0 && _adapter is RoutedGamepadAdapter binding){
                            _watchdog.Reset();assembler.Reset();binding.Bind(buffer[1],buffer[2]);
                            report=buffer[1]==63;
                        }
                        else if(assembler.Accept(buffer,out var state)){
                            _watchdog.Apply(state);applied=state;OnFrameReceived?.Invoke(state);
                        }
                    }
                    if(report)await Reply(pipe,Status(buffer[0]==0x14?"configured":"ready"),ct);
                    else if(applied.HasValue && Environment.TickCount64-lastReport>=100){
                        lastReport=Environment.TickCount64;await Reply(pipe,Status("state",applied),ct);
                    }
                }
            }catch(OperationCanceledException){break;}
            catch(Exception ex){if(!ct.IsCancellationRequested)Console.Error.WriteLine("[Pipe] "+ex.Message);}
            finally{_watchdog.Reset();OnClientDisconnected?.Invoke();}
        }
    }
    public void Dispose(){_cts.Cancel();_watchdog.Reset();try{_task?.Wait(1000);}catch{} _cts.Dispose();}
}
