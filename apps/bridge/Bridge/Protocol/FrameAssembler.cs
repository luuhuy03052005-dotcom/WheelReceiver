using System.Buffers.Binary;
namespace LanRacingWheel.Bridge.Protocol;
public sealed class FrameAssembler
{
    private byte[]? _a,_b;
    private byte? _last;
    public void Reset(){_a=null;_b=null;_last=null;}
    public bool Accept(ReadOnlySpan<byte> frame,out ControllerState state)
    {
        state=ControllerState.Neutral;
        if(frame.Length!=8)return false;
        if(frame[0]==0x12){_a=frame.ToArray();_b=null;return false;}
        if(frame[0]==0x13){
            if(_a!=null && _a[1]==frame[1] && frame[6]==0 && frame[7]==0)_b=frame.ToArray();
            else {_a=null;_b=null;}
            return false;
        }
        if(!ControllerState.TryParse(frame,out state)){_a=null;_b=null;return false;}
        int delta=_last.HasValue?(state.Sequence-_last.Value+256)%256:1;
        if(delta==0||delta>=128){_a=null;_b=null;return false;}
        if(_a!=null || _b!=null){
            if(_a==null||_b==null||_a[1]!=state.Sequence||_b[1]!=state.Sequence){_a=null;_b=null;return false;}
            ulong bits=BinaryPrimitives.ReadUInt32LittleEndian(_a.AsSpan(4,4))|
                ((ulong)BinaryPrimitives.ReadUInt32LittleEndian(_b.AsSpan(2,4))<<32);
            state=state with {Clutch=_a[2],GearMode=_a[3],ExtendedButtons=bits};
        }
        _last=state.Sequence;_a=null;_b=null;return true;
    }
}
