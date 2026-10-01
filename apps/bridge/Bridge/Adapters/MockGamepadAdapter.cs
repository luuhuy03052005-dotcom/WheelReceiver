using System;
using System.Collections.Generic;
using LanRacingWheel.Bridge.Protocol;

namespace LanRacingWheel.Bridge.Adapters
{
    public sealed class MockGamepadAdapter : IGamepadAdapter
    {
        public bool IsConnected { get; private set; }
        public ControllerState CurrentState { get; private set; } = ControllerState.Neutral;
        public List<ControllerState> StateHistory { get; } = new();
        public int NeutralResetCount { get; private set; }

        public void Initialize()
        {
            IsConnected = true;
            ResetToNeutral();
        }

        public void UpdateState(ControllerState state)
        {
            CurrentState = state;
            StateHistory.Add(state);
        }

        public void ResetToNeutral()
        {
            NeutralResetCount++;
            UpdateState(ControllerState.Neutral);
        }

        public void Dispose()
        {
            IsConnected = false;
            ResetToNeutral();
        }
    }
}
