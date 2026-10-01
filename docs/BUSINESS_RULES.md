# Business Rules

## Session & Ownership
- **BR-CON-01:** Allow at most one active controller session per Receiver.
- **BR-CON-02:** Allow multiple remembered devices, but never multiple active input owners.
- **BR-CON-03:** Reject a second controller unless current session ends or PC owner approves takeover.
- **BR-CON-04:** Start every connection, reconnect, and takeover at neutral state.
- **BR-CON-05:** Never restore analog or button state from a previous session.
- **BR-CON-06:** Do not enter Active state until the virtual controller and bridge are ready.

## Security & Pairing
- **BR-SEC-01:** Require pairing before accepting controller state.
- **BR-SEC-02:** Make each pairing nonce single-use and expire it after 120 seconds.
- **BR-SEC-03:** Exchange the nonce for a revocable device token; do not reuse nonce as session token.
- **BR-SEC-04:** Limit the Receiver to private LAN interfaces by default.
- **BR-SEC-05:** Validate origin, token, message type, length (8 bytes), version (`0x11`), sequence, and rate.
- **BR-SEC-06:** PC owner can list and revoke paired devices.
- **BR-SEC-07:** Do not place reusable secrets in URL query strings or logs.

## Input & Control Math
- **BR-INP-01:** Assign each active control to exactly one pointer ID.
- **BR-INP-02:** Do not let one pointer control two regions.
- **BR-INP-03:** Allow steering, throttle, brake, and buttons to operate simultaneously.
- **BR-INP-04:** Release affected control on pointer up, cancel, or lost capture.
- **BR-INP-05:** Reset pedals on release; return steering to center using auto-center duration.
- **BR-INP-06:** Convert invalid numeric input (`NaN`, infinities) to neutral before encoding.
- **BR-STR-01:** Normalize steering to `[-1, 1]` after angle unwrap, calibration, deadzone, and curve.
- **BR-STR-02:** Clamp final XInput steering to `[-32768, 32767]`.
- **BR-PED-01:** Normalize each pedal to `[0, 1]` and encode to `[0, 255]`.
- **BR-PED-02:** Allow throttle and brake simultaneously.
- **BR-PED-03:** Apply lower deadzone, upper saturation, and curve before quantization.

## Transmission & Modes
- **BR-MODE-01:** AT mode hides/disables clutch and shift controls.
- **BR-MODE-02:** MT mode enables clutch, shift up, and shift down.
- **BR-MODE-03:** Switching MT to AT releases clutch and both shift buttons in next state.
- **BR-MODE-04:** Switching modes does not reset steering or pedals.
- **BR-CLT-01:** Setting is named `Clutch activation threshold`.
- **BR-CLT-02:** Set XInput clutch button (LB) while clutch input >= threshold.
- **BR-GEAR-01:** Convert one shift tap into exactly one button pulse.
- **BR-GEAR-02:** Hold shift pulse for at least 50 ms so it is registered by game polling.
- **BR-GEAR-03:** Do not repeat a gear action until a new press edge occurs.

## Fail-Safe
- **BR-SAFE-01:** Neutralize virtual controller within 150 ms of missing valid input.
- **BR-SAFE-02:** Neutralize immediately when WebSocket or Named Pipe closes cleanly.
- **BR-SAFE-03:** C# watchdog is authoritative and independent of Node.
- **BR-SAFE-04:** Neutral state: steering `0`, brake `0`, throttle `0`, buttons `0`.
- **BR-SAFE-05:** Neutralize before Receiver shutdown or virtual-controller detach.
- **BR-SAFE-06:** Watchdog timeout (150 ms) is fixed and not user-configurable.

## Settings & Calibration
- **BR-SET-01:** Versioned settings schema in storage, validated on load.
- **BR-SET-02:** Require completed calibration or explicit default confirmation.
- **BR-SET-03:** Keep pairing credentials separate from driving settings.
- **BR-SET-04:** `Reset settings` preserves calibration and pairing.
- **BR-SET-05:** `Reset calibration` preserves pairing, resets calibration.
- **BR-SET-06:** `Factory reset` clears settings, calibration, and pairing.

## Game Profiles & Vehicle Functions
- **BR-PRO-01:** Auto mode matches a supported executable and foreground PID using two stable observations before proposing a profile change.
- **BR-PRO-02:** Manual mode remains selected until the user explicitly reenables Auto.
- **BR-PRO-03:** A profile revision must be configured in the bridge and acknowledged by the client before input can resume.
- **BR-PRO-04:** Losing target-game focus pauses an active session and releases keyboard output.
- **BR-PRO-05:** Detecting a game does not claim knowledge of its vehicle, gearbox, assists, speed, or RPM without a supported telemetry source.
- **BR-VEH-01:** The semantic action catalogue has stable IDs for driving, gearbox, lighting, visibility, cabin, assists, drivetrain, truck/special and game-utility controls.
- **BR-VEH-02:** A function is enabled only when the selected backend or an explicit keyboard binding can produce it.
- **BR-OUT-01:** Use one analog output backend at a time; an action must not be duplicated through gamepad/vJoy and keyboard.
- **BR-OUT-02:** Keyboard output is foreground-PID-gated and every pressed key is released on neutralization, focus loss, disconnect, reconfigure and shutdown.
- **BR-CAB-01:** Label USB only from an enumerated USB-tethering network adapter; address shape alone is not proof of a cable path.
