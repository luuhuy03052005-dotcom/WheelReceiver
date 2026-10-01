using System;
using LanRacingWheel.Bridge.Protocol;

namespace LanRacingWheel.Bridge.Adapters
{
    public interface IGamepadAdapter : IDisposable
    {
        bool IsConnected { get; }
        ControllerState CurrentState { get; }
        void Initialize();
        void UpdateState(ControllerState state);
        void ResetToNeutral();
    }
}
