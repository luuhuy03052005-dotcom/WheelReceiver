# LAN Racing Wheel Test Report

Updated 2026-09-27.

## Decision

**PARTIALLY VERIFIED — software pipeline is ready for controlled hardware/game acceptance.**

No automated failures remain. This does not prove compatibility with every game, phone, cable, ViGEm/vJoy installation, privilege level or in-game binding.

## Verified evidence

| Area | Result | Evidence |
| --- | --- | --- |
| JavaScript unit/integration/fault tests | 31 passed, 0 failed | `npm test` |
| C# codec/assembler/watchdog tests | 10 passed, 0 failed | `npm run test:dotnet` |
| Real Gateway → Named Pipe → C# mock bridge | 1 passed, 0 failed | `npm run test:e2e-bridge` |
| PWA mobile viewport | Passed | Physical-device cockpit remains fixed at 844×390, 667×375, 640×360 and 568×320; 390×844 shows the rotate prompt. iPhone Safari and Android Chrome emulation retain scale 1 after focusing the PIN field, synchronize browser-height changes and have no document overflow or page/console errors |
| Saved layout interaction | Passed | Dragged a palette action onto the cockpit, moved it, resized it, finished editing and confirmed its per-profile position/size after reload |
| QR and network selection | Passed | QR deep link automatically paired; Receiver selected the usable Wi-Fi address, excluded VMware adapters, and unit tests cover Android RNDIS/NCM USB classification |
| Accessibility | Passed | axe WCAG A/AA: 0 violations; the contrast rule remains indeterminate for text over card gradients and can also be indeterminate where a user deliberately overlaps a custom action |
| Electron Receiver mock runtime | Passed | Final packaged renderer loaded without page errors; packaged PWA paired, armed and acknowledged 60 Hz before a neutral pause |
| Dedicated port ownership | Passed | Default port is fixed at 32178; startup may terminate only a verified stale Wheel Receiver owner and refuses to kill unrelated applications |
| H-pattern shifter | Passed | Six forward gates plus reverse; real pointer drag selected first gear, then crossing/releasing at the center returned to neutral at 667×375 |
| Installed virtual drivers | Startup passed | ViGEm/XInput and vJoy Device 1 both initialized and remained neutral; no in-game assertion |
| Windows portable package | Passed | `npm run build:desktop` generated unpacked and portable outputs |
| Dependency audit | Passed | `npm audit`: 0 vulnerabilities after controlled dependency upgrades |

The automated suites exercise golden vectors, exact frame lengths, extension assembly, sequence rollover/stale rejection, NaN neutralization, short-tap latching, MT→AT release, pairing, token rejection, session exclusivity, initial neutral, both watchdog layers and end-to-end committed state.

## Implemented scope

- Exact 8-byte state and extension protocol with little-endian fields.
- Fixed landscape wheel/pedals/gearbox UI and a stable catalogue of 64 vehicle/game actions, including all major lighting groups.
- Empty-by-default auxiliary layer with drag/drop placement, move, resize, remove, clear and automatic per-profile `localStorage` persistence.
- Auto foreground-game detection with stable matching and Manual profile override.
- Profiles for Generic, Forza Horizon, BeamNG.drive, ETS2, ATS, Assetto Corsa and DiRT/EA WRC.
- One selected XInput/vJoy backend and optional foreground-PID-gated keyboard bindings.
- LAN and USB-tether network selection with automatic USB preference, RNDIS/NCM/ECM/Apple/Android adapter recognition, virtual-adapter filtering and explicit no-IP diagnostics.
- Windows Electron Receiver, revocable paired devices, QR/PIN flow and Private/LocalSubnet firewall helper.

## Hardware acceptance still required

1. Physical iPhone Safari and Android Chrome simultaneous multi-touch.
2. USB tethering on both platforms, including unplug, reconnect and transport-label verification.
3. ViGEm/XInput in Forza; vJoy and bindings in BeamNG, ETS2/ATS, Assetto and WRC.
4. Every light, wiper, truck and auxiliary control against the target game's actual control menu.
5. Focus/Alt-Tab behavior and keyboard injection when the game runs at equal or higher privilege.
6. Watchdog timing, latency and jitter under real CPU/network/game load.

## Known release limitations

- Game recognition selects a configured profile; it does not infer the active vehicle, transmission or assists.
- There is no game telemetry integration, so RPM, speed, gear and light state are not claimed as game-confirmed.
- “Cable” currently means OS USB tethering/networking. USB-A, USB-C and Lightning connectors are supported when the cable carries data and Windows exposes a tether adapter; charge-only cables cannot work. Dedicated raw USB is not implemented.
- The portable executable is unsigned and uses the default Electron icon.
- This machine's vJoy Device 1 currently exposes only 8 buttons; configure at least 70 before full auxiliary-control acceptance.

## Next acceptance task

Install/configure the required ViGEm/vJoy drivers, pair one real phone, then complete a per-game matrix for Forza Horizon, BeamNG.drive and ETS2 first. Record backend, transmission mode, every bound action, focus behavior, disconnect neutralization and measured latency.
