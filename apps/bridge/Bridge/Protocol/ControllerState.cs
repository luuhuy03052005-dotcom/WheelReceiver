using System.Buffers.Binary;
namespace LanRacingWheel.Bridge.Protocol;
public readonly record struct ControllerState(byte Header, byte Sequence, ushort Buttons,
    short Steering, byte Brake, byte Throttle, byte Clutch = 0,
    ulong ExtendedButtons = 0, byte GearMode = 0)
{
    public const byte ExpectedHeader = 0x11;
    public const int FrameSize = 8;
    public static readonly ControllerState Neutral = new(ExpectedHeader,0,0,0,0,0);
    public static bool TryParse(ReadOnlySpan<byte> buffer,out ControllerState state)
    {
        state=Neutral;
        if(buffer.Length!=FrameSize || buffer[0]!=ExpectedHeader) return false;
        state=new(buffer[0],buffer[1],BinaryPrimitives.ReadUInt16LittleEndian(buffer[2..4]),
            BinaryPrimitives.ReadInt16LittleEndian(buffer[4..6]),buffer[6],buffer[7]);
        return true;
    }
    public byte[] ToBytes()
    {
        byte[] buffer=new byte[FrameSize];buffer[0]=ExpectedHeader;buffer[1]=Sequence;
        BinaryPrimitives.WriteUInt16LittleEndian(buffer.AsSpan(2,2),Buttons);
        BinaryPrimitives.WriteInt16LittleEndian(buffer.AsSpan(4,2),Steering);
        buffer[6]=Brake;buffer[7]=Throttle;return buffer;
    }
}
