using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using LanRacingWheel.Bridge.Protocol;

namespace LanRacingWheel.Bridge.Adapters;

public interface IKeyboardSender
{
    bool SendKey(byte key, bool down, out string? error);
}

public interface IForegroundProvider
{
    uint GetForegroundProcessId();
}

public sealed class WindowsKeyboardSender : IKeyboardSender
{
    [StructLayout(LayoutKind.Sequential)] private struct INPUT { public uint type; public INPUTUNION data; }
    [StructLayout(LayoutKind.Explicit, Size = 32)] private struct INPUTUNION { [FieldOffset(0)] public KEYBDINPUT keyboard; }
    [StructLayout(LayoutKind.Sequential)] private struct KEYBDINPUT { public ushort vk, scan; public uint flags, time; public UIntPtr extra; }
    [DllImport("user32.dll", SetLastError = true)] private static extern uint SendInput(uint count, INPUT[] inputs, int size);
    [DllImport("user32.dll")] private static extern uint MapVirtualKey(uint uCode, uint uMapType);

    public bool SendKey(byte key, bool down, out string? error)
    {
        error = null;
        if (!OperatingSystem.IsWindows() || key == 0) return true;
        ushort scan = (ushort)MapVirtualKey(key, 0);
        uint flags = down ? 0u : 2u;
        if (scan != 0) flags |= 8u; // KEYEVENTF_SCANCODE (0x0008)
        if (key is 37 or 38 or 39 or 40 or 33 or 34 or 35 or 36 or 45 or 46) flags |= 1u;
        var input = new INPUT { type = 1, data = new INPUTUNION { keyboard = new KEYBDINPUT { vk = key, scan = scan, flags = flags } } };
        uint sent = SendInput(1, new[] { input }, Marshal.SizeOf<INPUT>());
        if (sent != 1)
        {
            int err = Marshal.GetLastWin32Error();
            error = $"SendInput failed (Win32 error {err})";
            return false;
        }
        return true;
    }
}

public sealed class WindowsForegroundProvider : IForegroundProvider
{
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);

    public uint GetForegroundProcessId()
    {
        if (!OperatingSystem.IsWindows()) return 0;
        IntPtr hwnd = GetForegroundWindow();
        GetWindowThreadProcessId(hwnd, out uint pid);
        return pid;
    }
}

/// One analog backend at a time. Keyboard auxiliary bindings are foreground-gated.
public sealed class RoutedGamepadAdapter : IGamepadAdapter
{
    private IGamepadAdapter? _output;
    private readonly bool _mock;
    private readonly IGamepadAdapter? _customOutput;
    private readonly IKeyboardSender _keyboardSender;
    private readonly IForegroundProvider _foregroundProvider;
    private readonly byte[] _keys = new byte[64];
    private readonly HashSet<byte> _pressed = new();
    private readonly HashSet<byte> _desired = new();
    private long _lastFocusCheckMs;
    private bool _cachedFocused;
    private uint _targetPid;
    private long _lastErrorTimeMs;
    private string? _lastErrorMessage;

    public uint TargetPid
    {
        get => _targetPid;
        set
        {
            if (_targetPid != value)
            {
                _targetPid = value;
                _lastFocusCheckMs = 0;
                _cachedFocused = false;
                ReleaseAllPressedKeys();
            }
        }
    }

    public string Backend { get; private set; } = "none";
    public string? Error { get; private set; }
    public int ButtonCount => _output is VJoyGamepadAdapter joy ? joy.ButtonCount : (_output is MockGamepadAdapter ? 70 : 0);
    public bool IsConnected => _output?.IsConnected == true;
    public ControllerState CurrentState { get; private set; } = ControllerState.Neutral;
    public IReadOnlyCollection<byte> PressedKeys => _pressed;

    public void InvalidateFocusCache() => _lastFocusCheckMs = 0;

    public RoutedGamepadAdapter(bool mock = false, IGamepadAdapter? customOutput = null,
        IKeyboardSender? keyboardSender = null, IForegroundProvider? foregroundProvider = null)
    {
        _mock = mock;
        _customOutput = customOutput;
        _keyboardSender = keyboardSender ?? new WindowsKeyboardSender();
        _foregroundProvider = foregroundProvider ?? new WindowsForegroundProvider();
    }

    public void Initialize() => Configure(1);

    public void Configure(byte backend)
    {
        ResetToNeutral();
        Array.Clear(_keys);
        TargetPid = 0;
        _lastFocusCheckMs = 0;
        _cachedFocused = false;
        string desired = _mock ? "mock" : backend == 2 ? "vjoy" : "xinput";
        if (Backend == desired && IsConnected) return;
        _output?.Dispose();
        _output = null;
        Error = null;
        Backend = "none";
        try
        {
            _output = _customOutput ?? (_mock ? new MockGamepadAdapter() : backend == 2 ? new VJoyGamepadAdapter() : new ViGEmGamepadAdapter());
            _output.Initialize();
            Backend = desired;
        }
        catch (Exception ex)
        {
            Error = ex.Message;
            _output?.Dispose();
            _output = null;
        }
    }

    public void Bind(int index, byte key)
    {
        if (index < 64)
        {
            byte oldKey = _keys[index];
            _keys[index] = key;
            if (oldKey != key && oldKey != 0)
            {
                ulong effectiveExtended = CurrentState.ExtendedButtons;
                if ((CurrentState.Buttons & 0x1000) != 0) effectiveExtended |= (1UL << 34);
                if ((CurrentState.Buttons & 0x0200) != 0) effectiveExtended |= (1UL << 58);
                if ((CurrentState.Buttons & 0x0001) != 0) effectiveExtended |= (1UL << 7);
                if ((CurrentState.Buttons & 0x0002) != 0) effectiveExtended |= (1UL << 6);
                if ((CurrentState.Buttons & 0x0004) != 0) effectiveExtended |= (1UL << 9);
                if ((CurrentState.Buttons & 0x0008) != 0) effectiveExtended |= (1UL << 8);

                bool stillNeeded = false;
                for (int i = 0; i < 64; i++)
                {
                    if (_keys[i] == oldKey && (effectiveExtended & (1UL << i)) != 0)
                    {
                        stillNeeded = true;
                        break;
                    }
                }
                if (!stillNeeded && _pressed.Contains(oldKey))
                {
                    if (_keyboardSender.SendKey(oldKey, false, out string? err))
                    {
                        _pressed.Remove(oldKey);
                    }
                    else
                    {
                        LogKeyError(err);
                    }
                }
            }
        }
    }

    public void UpdateState(ControllerState state)
    {
        CurrentState = state;
        _desired.Clear();

        // Normalize semantic action aliases: combine primary buttons into effective extended bits
        ulong effectiveExtended = state.ExtendedButtons;
        if ((state.Buttons & 0x1000) != 0) effectiveExtended |= (1UL << 34); // parkingBrake / handbrake
        if ((state.Buttons & 0x0200) != 0) effectiveExtended |= (1UL << 58); // camera / cameraPrimary
        if ((state.Buttons & 0x0001) != 0) effectiveExtended |= (1UL << 7);  // park
        if ((state.Buttons & 0x0002) != 0) effectiveExtended |= (1UL << 6);  // reverse
        if ((state.Buttons & 0x0004) != 0) effectiveExtended |= (1UL << 9);  // neutral
        if ((state.Buttons & 0x0008) != 0) effectiveExtended |= (1UL << 8);  // drive

        bool focused = false;
        if (TargetPid != 0)
        {
            long now = Environment.TickCount64;
            if (now - _lastFocusCheckMs > 100 || _lastFocusCheckMs == 0)
            {
                _lastFocusCheckMs = now;
                uint currentPid = _foregroundProvider.GetForegroundProcessId();
                _cachedFocused = (currentPid == TargetPid);
            }
            focused = _cachedFocused;
        }

        if (focused)
        {
            for (int i = 0; i < 64; i++)
            {
                byte key = _keys[i];
                if (key != 0 && (effectiveExtended & (1UL << i)) != 0)
                {
                    _desired.Add(key);
                }
            }
        }

        // Release keys no longer in desired set
        List<byte>? toRemove = null;
        foreach (byte key in _pressed)
        {
            if (!_desired.Contains(key))
            {
                if (_keyboardSender.SendKey(key, false, out string? err))
                {
                    toRemove ??= new List<byte>();
                    toRemove.Add(key);
                }
                else
                {
                    LogKeyError(err);
                }
            }
        }
        if (toRemove != null)
        {
            foreach (byte k in toRemove) _pressed.Remove(k);
        }

        // Press newly desired keys
        foreach (byte key in _desired)
        {
            if (!_pressed.Contains(key))
            {
                if (_keyboardSender.SendKey(key, true, out string? err))
                {
                    _pressed.Add(key);
                }
                else
                {
                    LogKeyError(err);
                }
            }
        }

        // Filter out actions with keyboard bindings from the virtual output state
        ushort filteredButtons = state.Buttons;
        ulong filteredExtended = state.ExtendedButtons;
        for (int i = 0; i < 64; i++)
        {
            if (_keys[i] != 0)
            {
                filteredExtended &= ~(1UL << i);
                if (i == 34) filteredButtons = (ushort)(filteredButtons & ~0x1000);       // parkingBrake / handbrake
                else if (i == 58) filteredButtons = (ushort)(filteredButtons & ~0x0200); // camera / cameraPrimary
                else if (i == 7) filteredButtons = (ushort)(filteredButtons & ~0x0001);  // park
                else if (i == 6) filteredButtons = (ushort)(filteredButtons & ~0x0002);  // reverse
                else if (i == 9) filteredButtons = (ushort)(filteredButtons & ~0x0004);  // neutral
                else if (i == 8) filteredButtons = (ushort)(filteredButtons & ~0x0008);  // drive
            }
            else
            {
                // If keyboard binding is disabled (_keys[i] == 0) and extended bit is set, mirror to primary bit
                // so XInput (which reads state.Buttons) receives the action
                if ((state.ExtendedButtons & (1UL << i)) != 0)
                {
                    if (i == 34) filteredButtons |= 0x1000;
                    else if (i == 58) filteredButtons |= 0x0200;
                    else if (i == 7) filteredButtons |= 0x0001;
                    else if (i == 6) filteredButtons |= 0x0002;
                    else if (i == 9) filteredButtons |= 0x0004;
                    else if (i == 8) filteredButtons |= 0x0008;
                }
            }
        }

        var outputState = state with { Buttons = filteredButtons, ExtendedButtons = filteredExtended };
        _output?.UpdateState(outputState);
    }

    private void ReleaseAllPressedKeys()
    {
        if (_pressed.Count == 0) return;
        List<byte>? released = null;
        foreach (byte key in _pressed)
        {
            if (_keyboardSender.SendKey(key, false, out string? err))
            {
                released ??= new List<byte>();
                released.Add(key);
            }
            else
            {
                LogKeyError(err);
            }
        }
        if (released != null)
        {
            foreach (byte k in released) _pressed.Remove(k);
        }
    }

    public void ResetToNeutral()
    {
        ReleaseAllPressedKeys();
        _output?.ResetToNeutral();
        CurrentState = ControllerState.Neutral;
    }

    public void Dispose()
    {
        ResetToNeutral();
        if (_pressed.Count > 0)
        {
            Console.Error.WriteLine($"[KeyboardRouter] WARNING: Failed to release {_pressed.Count} keys on shutdown. Retaining tracking; cleanup required by OS.");
        }
        _output?.Dispose();
        _output = null;
    }

    private void LogKeyError(string? err)
    {
        if (err == null) return;
        long now = Environment.TickCount64;
        if (now - _lastErrorTimeMs > 2000 || _lastErrorMessage != err)
        {
            _lastErrorTimeMs = now;
            _lastErrorMessage = err;
            Console.Error.WriteLine($"[KeyboardRouter] {err}");
        }
    }
}
