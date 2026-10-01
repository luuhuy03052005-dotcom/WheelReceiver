using System.Runtime.InteropServices;
using LanRacingWheel.Bridge.Protocol;
namespace LanRacingWheel.Bridge.Adapters;

/// One analog backend at a time. Keyboard auxiliary bindings are foreground-gated.
public sealed class RoutedGamepadAdapter : IGamepadAdapter
{
    private IGamepadAdapter? _output;
    private readonly bool _mock;
    private readonly byte[] _keys=new byte[64];
    private HashSet<byte> _pressed=new();
    public uint TargetPid {get;set;}
    public string Backend {get;private set;}="none";
    public string? Error {get;private set;}
    public int ButtonCount => _output is VJoyGamepadAdapter joy ? joy.ButtonCount : 0;
    public bool IsConnected => _output?.IsConnected==true;
    public ControllerState CurrentState {get;private set;}=ControllerState.Neutral;
    public RoutedGamepadAdapter(bool mock=false){_mock=mock;}
    public void Initialize()=>Configure(1);
    public void Configure(byte backend)
    {
        ResetToNeutral();Array.Clear(_keys);TargetPid=0;
        string desired=_mock?"mock":backend==2?"vjoy":"xinput";
        if(Backend==desired && IsConnected)return;
        _output?.Dispose();_output=null;Error=null;Backend="none";
        try {
            _output=_mock?new MockGamepadAdapter():backend==2?new VJoyGamepadAdapter():new ViGEmGamepadAdapter();
            _output.Initialize();Backend=desired;
        } catch(Exception ex){Error=ex.Message;_output?.Dispose();_output=null;}
    }
    public void Bind(int index,byte key){if(index<64)_keys[index]=key;}
    public void UpdateState(ControllerState state)
    {
        CurrentState=state;
        ulong virtualBits=state.ExtendedButtons;
        var desired=new HashSet<byte>();
        bool focused=false;
        if(!_mock && OperatingSystem.IsWindows()){
            if(TargetPid!=0){
                try {
                    GetWindowThreadProcessId(GetForegroundWindow(),out uint foreground);
                    using var p = System.Diagnostics.Process.GetProcessById((int)TargetPid);
                    focused=(foreground==TargetPid);
                } catch {
                    TargetPid=0;
                    focused=false;
                }
            } else {
                focused=false;
            }
        }
        else if(_mock){
            focused=true;
        }
        for(int i=0;i<64;i++)if(_keys[i]!=0){
            virtualBits &= ~(1UL<<i);
            if(focused && (state.ExtendedButtons&(1UL<<i))!=0)desired.Add(_keys[i]);
        }
        foreach(byte key in _pressed.Except(desired))SendKey(key,false);
        foreach(byte key in desired.Except(_pressed))SendKey(key,true);
        _pressed=desired;
        _output?.UpdateState(state with {ExtendedButtons=virtualBits});
    }
    public void ResetToNeutral(){foreach(byte key in _pressed)SendKey(key,false);_pressed.Clear();_output?.ResetToNeutral();CurrentState=ControllerState.Neutral;}
    public void Dispose(){ResetToNeutral();_output?.Dispose();_output=null;}
    private static void SendKey(byte key,bool down){
        if(!OperatingSystem.IsWindows()||key==0)return;
        ushort scan=(ushort)MapVirtualKey(key,0);
        uint flags=down?0u:2u;
        if(scan!=0)flags|=8u; // KEYEVENTF_SCANCODE (0x0008) for DirectInput / DirectX games (ETS2, etc.)
        if(key is 37 or 38 or 39 or 40 or 33 or 34 or 35 or 36 or 45 or 46)flags|=1u;
        var input=new INPUT{type=1,data=new INPUTUNION{keyboard=new KEYBDINPUT{vk=key,scan=scan,flags=flags}}};
        SendInput(1,new[]{input},Marshal.SizeOf<INPUT>());
    }
    [StructLayout(LayoutKind.Sequential)] private struct INPUT{public uint type;public INPUTUNION data;}
    [StructLayout(LayoutKind.Explicit,Size=32)] private struct INPUTUNION{[FieldOffset(0)]public KEYBDINPUT keyboard;}
    [StructLayout(LayoutKind.Sequential)] private struct KEYBDINPUT{public ushort vk,scan;public uint flags,time;public UIntPtr extra;}
    [DllImport("user32.dll",SetLastError=true)]private static extern uint SendInput(uint count,INPUT[] inputs,int size);
    [DllImport("user32.dll")]private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]private static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
    [DllImport("user32.dll")]private static extern uint MapVirtualKey(uint uCode,uint uMapType);
}
