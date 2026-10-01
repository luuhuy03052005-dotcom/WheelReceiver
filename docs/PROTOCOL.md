# Protocol v1 + 8-byte Extension Specification

Every binary frame is exactly 8 bytes and every multi-byte value is little-endian. The controller may send only `0x11`, `0x12`, and `0x13`. Headers `0x14`, `0x15`, and `0x1f` are trusted local IPC between Gateway and C# bridge and are rejected from WebSocket input.

## Controller State Frame (8 Bytes)

| Offset | Size (Bytes) | Field | Encoding | Description |
| ---: | ---: | --- | --- | --- |
| 0 | 1 | Header | `0x11` | High nibble = 1 (version 1), Low nibble = 1 (State message) |
| 1 | 1 | Sequence | `uint8` | Increments modulo 256 per frame |
| 2 | 2 | Buttons | `uint16` LE | Bitmask of active XInput buttons |
| 4 | 2 | Steering | `int16` LE | `-32768` (Full Left) to `32767` (Full Right), `0` = Center |
| 6 | 1 | Brake | `uint8` | `0` (Released) to `255` (Full Brake) |
| 7 | 1 | Throttle | `uint8` | `0` (Released) to `255` (Full Throttle) |

## Button Bitmasks (XInput Standard)
- `0x0100`: Clutch (Left Shoulder / LB)
- `0x0200`: Camera (Right Shoulder / RB)
- `0x1000`: Handbrake (A Button)
- `0x2000`: Shift Up (B Button)
- `0x4000`: Shift Down (X Button)

## Extension A (`0x12`, 8 bytes)

| Offset | Size | Field | Encoding |
| ---: | ---: | --- | --- |
| 0 | 1 | Header | `0x12` |
| 1 | 1 | Sequence | Same sequence as the state frame |
| 2 | 1 | Clutch | `0..255` |
| 3 | 1 | GearMode | Transmission mode: 1=AT, 2=MT, 3=MTC, 4=H (0=unspecified) |
| 4 | 4 | Auxiliary actions 0..31 | `uint32` LE |

## Extension B (`0x13`, 8 bytes)

| Offset | Size | Field | Encoding |
| ---: | ---: | --- | --- |
| 0 | 1 | Header | `0x13` |
| 1 | 1 | Sequence | Same sequence as the state frame |
| 2 | 4 | Auxiliary actions 32..63 | `uint32` LE |
| 6 | 2 | Reserved | Must be zero |

The sender transmits Extension A, Extension B, then State. Gateway and bridge stage extensions and commit only when all three sequences match. A missing, reordered, stale, malformed, or cross-session frame never refreshes the watchdog.

## Trusted local IPC frames

- `0x14`: configure one auxiliary binding index and virtual key; 64 exact 8-byte records complete a profile configuration.
- `0x15`: select exactly one output backend (`1` XInput, `2` vJoy) and carry the foreground target PID.
- `0x1f`: reset/neutralize the session. Bytes 1..7 must be zero.

Keyboard bindings are emitted only while the configured game PID owns the foreground window. Output configuration and profile changes first neutralize all analog, gamepad, and keyboard state.

## Sequence Validation Math
Given received `next` and previous `last`:
```text
delta = (next - last + 256) % 256
```
- `1 <= delta <= 127`: Newer frame (Accepted)
- `delta == 0`: Duplicate frame (Dropped)
- `128 <= delta <= 255`: Stale out-of-order frame (Dropped)

## Golden Test Vectors

### 1. Neutral
- **State**: header=0x11, seq=0, buttons=0, steering=0, brake=0, throttle=0
- **Hex**: `11 00 00 00 00 00 00 00`

### 2. Full Right + Full Throttle
- **State**: header=0x11, seq=1, buttons=0, steering=32767, brake=0, throttle=255
- **Hex**: `11 01 00 00 FF 7F 00 FF`

### 3. Full Left + Full Brake + Clutch + Shift Up
- **State**: header=0x11, seq=255, buttons=0x2100, steering=-32768, brake=255, throttle=0
- **Hex**: `11 FF 00 21 00 80 FF 00`
