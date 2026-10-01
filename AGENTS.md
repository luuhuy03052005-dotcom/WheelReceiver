# Project Guidelines: LAN Racing Wheel

## Invariants
- Allow at most one active controller session per Receiver (`BR-CON-01`).
- Start every new or reconnected session at neutral state (`BR-CON-04`).
- Neutralize steering, triggers, and buttons within 150 ms of missing valid input (`BR-SAFE-01`).
- Enforce the watchdog inside the C# bridge even if Node also has one (`BR-SAFE-03`).
- Treat analog data as latest-state-wins and button taps as latched edge events (`BR-STATE-01`, `BR-STATE-02`).
- Clamp steering to `[-32768, 32767]` and triggers to `[0, 255]` (`BR-STR-02`, `BR-PED-01`).
- Reject unsupported versions and packets whose length is not exactly 8 bytes (`BR-SEC-05`).
- Use explicit little-endian reads and writes for multi-byte fields.
- Protocol v1 state remains `0x11`; exact 8-byte extension types `0x12`/`0x13` stage clutch and auxiliary controls for the matching state sequence. IPC-only `0x14`/`0x15` configure bindings/output, and `0x1f` resets the session. Never accept IPC configuration from a controller binary frame. See `docs/PROTOCOL.md`.
- Release clutch and shift state on MT → AT transition (`BR-MODE-03`).
- Keep pairing mandatory and prevent silent takeover by a second device (`BR-SEC-01`, `BR-SEC-03`).
