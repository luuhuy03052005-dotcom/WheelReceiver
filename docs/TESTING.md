# Testing Strategy

## Test Layers

1. **Unit Tests (JS/TS)**:
   - `packages/protocol`: 8-byte encoder/decoder, sequence comparison math, golden test vectors.
   - `packages/control-math`: Steering curve, deadzone, auto-centering, pedal deadzone/saturation, clutch threshold, shift pulse latching (50ms).
   - Executed via `npm test`.

2. **Unit & Watchdog Tests (C# .NET 9)**:
   - Frame decoding & validation.
   - 150ms Watchdog neutralization test (simulate active input then pause, assert neutral report within <= 150ms).
   - Golden test vector matching in C#.
   - Executed via `dotnet test`.

3. **Integration Tests**:
   - Node ↔ C# Named Pipe IPC loopback test.
   - WebSocket streaming stress test.
   - Exact `Extension A → Extension B → State` commit through the real C# mock bridge.
   - Execute with `npm run test:e2e-bridge`.

4. **Interactive Verification**:
   - PWA multi-touch gesture testing on iOS Safari & Chrome emulation.
   - Windows Game Controllers / joy.cpl visual inspection.
   - Receiver Electron renderer startup and console-error check.
   - Auto/manual profile switching, foreground loss, cable removal and reconnect.

## Current automated commands

```powershell
npm test
npm run test:dotnet
npm run test:e2e-bridge
npm run build:desktop
```

Automated mock results do not prove real ViGEm/vJoy/game behavior. A release candidate must record the phone OS, cable/network adapter, driver versions, game version, selected vehicle/transmission, measured watchdog behavior and every mapped control in a per-game acceptance matrix.
