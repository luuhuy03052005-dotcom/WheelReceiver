# BÁO CÁO BƯỚC 3 — INPUT SEMANTICS

**Dự án:** LAN Racing Wheel / WheelReceiver  
**Mã commit cơ sở:** `f71ce3b50439db2e0f618671efaba7b0db3c616c` (branch `main`)  
**Ngày thực hiện & kiểm thử:** 2026-10-07  
**Môi trường chạy:** Windows (PowerShell/Node.js v24.11.1 / .NET SDK 9.0)

---

## 1. Tóm tắt Hiện trạng & Tiến độ Thực tế Bước 3

Trước khi tiến hành sửa đổi, tiến độ Bước 3 trong repository như sau:
1. **Control-math chép trùng:** `apps/controller-web/public/src/control-math.js` trước đó tồn tại độc lập hoặc dẫn link tuyệt đối không khả dụng ở môi trường Node test; logic chuẩn tại `packages/control-math/src/index.js` chưa được dùng làm Single Source of Truth đồng nhất cho cả client web và backend test.
2. **Hold collision đa nguồn:** `InputState` chỉ lưu một tập hợp phẳng `this.held = new Set()`. Khi hai nguồn cùng kích hoạt một action (ví dụ: touch bấm còi và phím 'H' bàn phím bấm còi), việc nhả ngón tay touch lập tức xóa còi khỏi `this.held`, làm mất tín hiệu còi dù phím 'H' vẫn đang bị giữ.
3. **Pulse bị kẹt khi giữ lâu:** Hành động dạng pulse (`shiftUp`, `camera`, `wiperCycle`...) bị `const active = new Set(this.held)` giữ bit 1 liên tục trong suốt thời gian ngón tay đè lên nút (thậm chí kéo dài cả giây), trái ngược với semantic của xung xung điện (pulse).
4. **Hai tap nhanh bị dính liền không có release gap:** Hai lần nhấn phím sang số (`shiftUp`/`shiftDown`) trong thời gian ngắn chỉ cập nhật `pulses.set(id, now + 60)`, khiến snapshot liên tục giữ bit 1 nối tiếp mà không có trạng thái nhả (bit = 0) ở giữa. Game và bridge chỉ nhận 1 lần sang số duy nhất.
5. **ACK cũ làm sai lệch tap mới:** Hàm `acknowledge(snapshot)` đánh dấu theo tên action phẳng (`sent.add(id)`), khiến ACK muộn của snapshot trước có thể xóa hoặc xác nhận nhầm tap mới được phát sau đó.
6. **Lọc mode ở snapshot cuối:** `InputState.setMode` chưa lọc triệt để các bit đầu ra tại snapshot. Mode `AT` vẫn có thể lọt `SHIFT_UP`/`SHIFT_DOWN`; mode `MT` thiếu lọc direct gears; mode `H` chưa bảo đảm tính loại trừ lẫn nhau giữa các số trực tiếp (chỉ cho phép tối đa 1 số hoạt động).
7. **Reset phiên cũ:** Khi reset session, các pulse đang chờ trong hàng đợi không được dọn sạch triệt để, có thể rò rỉ sang phiên mới.

**Kết quả sau khi triển khai Bước 3:**  
Toàn bộ 7 vấn đề trên đã được sửa đổi hoàn tất trong mã nguồn thực tế và được bảo đảm bằng bộ kiểm thử tự động chuyên biệt `tests/integration/step3-input-semantics.test.js` (7/7 pass), kiểm thử toàn bộ dự án (`npm test`: 72/72 pass, `dotnet test`: 10/10 pass, `npm run test:e2e-bridge`: 1/1 pass).

---

## 2. Danh sách File Thực sự Thay đổi

| File thay đổi | Loại thay đổi | Mô tả tóm tắt |
|---|---|---|
| `packages/profiles/src/input-state.js` | Refactor cốt lõi | Quản lý hold theo `heldSources` (Map<actionId, Set<sourceId>>); state machine cho pulse với hàng đợi và release gap bắt buộc (>= 50ms, bit=0); tương quan ACK theo `pulseId`; lọc mode cứng cho AT, MT, MTC, H tại `snapshot()`; `reset()` dọn sạch toàn bộ queue và sources. |
| `apps/controller-web/public/src/control-math.js` | Đồng bộ logic chuẩn | Re-export trực tiếp từ `packages/control-math/src/index.js`, loại bỏ hoàn toàn mã trùng lặp, dùng chung 1 source of truth. |
| `apps/controller-web/public/src/protocol.js` | Đồng bộ logic chuẩn | Re-export trực tiếp từ `packages/protocol/src/index.js`. |
| `apps/controller-web/public/src/app.js` | Tích hợp nguồn & mode | Gán `_sourceId` riêng biệt cho từng button element DOM và prefix `kbd:` cho phím bàn phím; gọi `this.input.setMode(this.profile.mode)` khi khởi tạo, đổi profile, nhận status; lọc nút `SHIFT_UP`/`SHIFT_DOWN` trong `sendStateFrame` khi ở mode AT/H. |
| `docs/BUSINESS_RULES.md` | Cập nhật quy tắc nghiệp vụ | Bổ sung và cập nhật chi tiết quy tắc truyền động cho 4 mode (`BR-MODE-01` đến `BR-MODE-06`) và xung phím (`BR-GEAR-03`, `BR-GEAR-04`). |
| `docs/FIX_STATUS.md` | Cập nhật theo dõi lỗi | Đánh dấu COMPLETE cho 7 issue của Bước 3 kèm bằng chứng test. |
| `tests/integration/step3-input-semantics.test.js` | Test tích hợp mới | 7 bài kiểm thử chuyên biệt tái hiện và chứng minh hành vi trước/sau sửa của Bước 3. |

---

## 3. Ca Tái Hiện, Hành Vi Sau Sửa và Tên Test Tương Ứng

### Ca 3.1: Duplicate control-math & lệch chuẩn tính toán
- **Ca tái hiện:** File `apps/controller-web/public/src/control-math.js` dẫn đường dẫn tuyệt đối `/packages/...` khiến môi trường test Node.js lỗi phân giải import, hoặc có nguy cơ lệch chuẩn công thức tính góc lái, deadzone, saturation, curve và auto-center spring giữa Web và Node.
- **Hành vi sau sửa:** Re-export trực tiếp từ `packages/control-math/src/index.js`. Tham chiếu class/hàm và kết quả tính toán số học trên toàn bộ miền giá trị (bao gồm biên clamp, deadzone, số không hữu hạn NaN/Infinity) đồng nhất 100%.
- **Test tương ứng:** `Step 3.1: Control-math single source of truth verification` trong [step3-input-semantics.test.js](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/tests/integration/step3-input-semantics.test.js).

### Ca 3.2: Multi-source collision (Touch và Keyboard dẫm trạng thái nhau)
- **Ca tái hiện:** Nguồn touch ấn giữ Còi (Horn), sau đó người dùng bấm thêm phím 'H' trên bàn phím. Khi nhả ngón tay trên màn hình cảm ứng, `release('horn')` xóa key `horn` khỏi `this.held`, làm mất tín hiệu còi của phím 'H' đang giữ.
- **Hành vi sau sửa:** `InputState` quản lý `heldSources` theo `Map<actionId, Set<sourceId>>`. Nguồn touch có `sourceId = btn:horn:<id>`, bàn phím có `sourceId = kbd:KeyH`. Khi touch nhả, chỉ xóa `sourceId` của touch; nguồn bàn phím vẫn còn trong set nên còi tiếp tục được giữ nguyên trạng thái. Còi chỉ ngắt khi toàn bộ các nguồn sở hữu cùng nhả.
- **Test tương ứng:** `Step 3.2: Multi-source hold tracking (touch + keyboard independent release)` trong [step3-input-semantics.test.js](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/tests/integration/step3-input-semantics.test.js).

### Ca 3.3: Pulse action giữ ngón tay lâu bị kẹt bit liên tục
- **Ca tái hiện:** Người dùng nhấn giữ lẫy số `shiftUp` hoặc nút `camera` trong 1 giây mà không nhấc ngón tay. Do `this.held` chứa action, `snapshot()` liên tục trả về bit 1 trong suốt 1000ms.
- **Hành vi sau sửa:** Pulse action tuân thủ state machine: kích hoạt đúng 1 lần trên press edge mới, duy trì bit 1 tối thiểu 50-60ms cho game polling, sau đó tự động de-assert về bit 0 (GAP/IDLE) ngay cả khi ngón tay vẫn đang đè trên màn hình. Không tự động phát sinh xung mới nếu không có press edge mới.
- **Test tương ứng:** `Step 3.3: Pulse action held for extended duration does not stay asserted nor repeat` trong [step3-input-semantics.test.js](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/tests/integration/step3-input-semantics.test.js).

### Ca 3.4: Hai tap nhanh bị gộp thành một xung dài (mất cạnh release)
- **Ca tái hiện:** Người dùng tap nhanh 2 lần nút sang số liên tiếp (ví dụ t=0ms và t=30ms). Bản snapshot cũ gia hạn `now + 60`, khiến các frame snapshot liên tục có bit 1 từ t=0 đến t=90ms mà không có frame 0 ở giữa. Game và bridge chỉ nhận 1 lần sang số duy nhất.
- **Hành vi sau sửa:** Pulse queue tuần tự hóa các xung: Tap 1 hoàn tất duration (60ms), sau đó bắt buộc đi qua release gap (>= 50ms, bit = 0) trước khi Tap 2 được kích hoạt (bit = 1). Các snapshot quan sát được chuỗi: `1 -> 1 -> 0 -> 0 -> 1 -> 1 -> 0`.
- **Test tương ứng:** `Step 3.4: Rapid double tap produces observable release gap between pulses` trong [step3-input-semantics.test.js](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/tests/integration/step3-input-semantics.test.js).

### Ca 3.5: ACK chậm xác nhận hoặc xóa nhầm tap mới
- **Ca tái hiện:** Tap 1 được gửi đi. Ngay sau đó Tap 2 được bấm. Một ACK đến trễ từ frame của Tap 1 gọi `sent.add(id)` làm ảnh hưởng trạng thái đang chờ của Tap 2.
- **Hành vi sau sửa:** Mỗi xung được cấp phát `pulseId` đơn vị tăng dần. Snapshot ghi nhận danh sách `pulseIds` chứa trong frame đó. Hàm `acknowledge(snapshot)` chỉ xác nhận đúng các `pulseId` tương ứng; ACK của frame cũ không bao giờ xác nhận hoặc xóa xung của Tap 2.
- **Test tương ứng:** `Step 3.5: Stale or late ACK does not confirm or erase a newer queued tap` trong [step3-input-semantics.test.js](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/tests/integration/step3-input-semantics.test.js).

### Ca 3.6: Thiếu lọc mode truyền động ở snapshot cuối (AT / MT / MTC / H)
- **Ca tái hiện:**
  - Ở mode `AT`, phím bấm hoặc binding ngoài vẫn có thể phát sinh `SHIFT_UP`/`SHIFT_DOWN` hoặc số tay `gear1-6`.
  - Ở mode `MT`, chân côn hoặc phím côn vẫn có thể kích hoạt `BUTTONS.CLUTCH`.
  - Ở mode `H`, người dùng bấm nhiều số cùng lúc tạo ra nhiều bit direct gear đồng thời trong extended bits.
- **Hành vi sau sửa:**
  - `AT`: Chặn triệt để `BUTTONS.CLUTCH`, `BUTTONS.SHIFT_UP`, `BUTTONS.SHIFT_DOWN` và các bit số tay 0-5. Cho phép P, R, N, D.
  - `MT`: Cho phép `SHIFT_UP`, `SHIFT_DOWN`. Chặn triệt để `BUTTONS.CLUTCH` và toàn bộ 10 bit số direct gear (0-9).
  - `MTC`: Cho phép `SHIFT_UP`, `SHIFT_DOWN`, côn `BUTTONS.CLUTCH`. Chặn toàn bộ 10 bit số direct gear.
  - `H`: Cho phép các số tay 1-6, R và côn. Chặn `SHIFT_UP`, `SHIFT_DOWN` và P, D, N. Áp dụng loại trừ lẫn nhau: chỉ tối đa 1 bit số direct gear được bật trong extended bits.
  - Chuyển mode (ví dụ `MTC` sang `AT`): Ngay lập tức neutralize và xóa bỏ toàn bộ côn và số cũ theo `BR-MODE-05`.
- **Test tương ứng:** `Step 3.6: Transmission mode filtering at final snapshot stage (AT, MT, MTC, H)` trong [step3-input-semantics.test.js](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/tests/integration/step3-input-semantics.test.js).

### Ca 3.7: Reset session không dọn sạch input/pulse cũ
- **Ca tái hiện:** Khi controller reset phiên (do pause, reconnect, hoặc require_neutral), các xung đang chờ trong hàng đợi vẫn tiếp tục được phát lại sau reset.
- **Hành vi sau sửa:** `reset()` dọn sạch toàn bộ `heldSources`, `pulseQueues`, `currentPulse`, `gear` và `sent`. Sau khi reset, `snapshot()` trả về trạng thái trung tính 100% (buttons = 0, extended = 0n).
- **Test tương ứng:** `Step 3.7: Reset isolates session: does not replay previous inputs or queued pulses` trong [step3-input-semantics.test.js](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/tests/integration/step3-input-semantics.test.js).

---

## 4. Lệnh Đã Chạy & Kết Quả Thực Tế

### Lệnh 1: Kiểm thử toàn bộ Unit & Integration Tests (Bao gồm Bước 1, Bước 2 và Bước 3)
```powershell
npm test
```
**Kết quả thực tế:**
```text
✔ H-pattern exposes six forward gears and reverse in the expected gates (2.0129ms)
✔ H-pattern does not select an unavailable output (0.4385ms)
✔ major wheel-compatible game profiles expose H-pattern mode (0.4382ms)
✔ visual viewport drives a stable integer controller surface (3.3248ms)
✔ mobile connection fields cannot trigger focus zoom (3.4473ms)
✔ dedicated Receiver port is stable and process takeover is narrowly scoped (1.8548ms)
✔ invalid Receiver ports are rejected before process inspection (1.9077ms)
✔ foreign port owners are preserved while stale Wheel owners are released (506.1128ms)
✔ PairingManager - Nonce Generation & 120s Single-Use Token Exchange (3.084ms)
✔ Steering Normalization - Deadzone, Limits & NaN Safety (1.5204ms)
✔ Pedal Normalization - Deadzone, Saturation & NaN Safety (2.5749ms)
✔ TransmissionController - Mode Switch, Clutch & Shift Pulse Latching (0.9434ms)
✔ vehicle catalogue has stable unique controls including every lighting group (2.4889ms)
✔ profile validation and actual output capabilities gate auxiliary actions (1.9316ms)
✔ short taps survive until acknowledged; mode changes and reset clear held input (2.9226ms)
✔ detection uses foreground executable; manual choice survives other games (1.8529ms)
✔ USB label requires adapter evidence; public addresses are excluded (3.3646ms)
✔ USB discovery recognizes NCM/RNDIS phones and excludes virtual adapters (1.0346ms)
✔ InputState: AT gear sets extended bit and snapshot contains it (1.305ms)
✔ InputState: H-pattern gears set correct extended bits (1.0863ms)
✔ InputState: auxiliary buttons (horn, wipers, lights) set correct extended bits (1.1408ms)
✔ InputState: handbrake and camera produce correct primary button masks (1.4471ms)
✔ InputState: shiftUp/shiftDown produce correct primary button masks (2.8758ms)
✔ DEFAULT_KEYS has no duplicate key codes within the same active mode context (2.9366ms)
✔ InputState: parkingBrake does not duplicate HANDBRAKE button mask and D-pad sets DPAD masks (0.7568ms)
✔ extended snapshot preserves original 8-byte state contract and both 32-bit banks (4.9818ms)
✔ gearMode byte is encoded in EXT_A[3] for each transmission mode (0.954ms)
✔ DPad button masks are distinct and non-overlapping with other button masks (2.1044ms)
✔ reject oversized legacy v2 and IPC-only frames from controller (0.7549ms)
✔ non-finite analog input becomes neutral before encoding (1.1781ms)
✔ configFrames includes H-pattern gear defaults for xinput backend (0.6123ms)
✔ Golden Vector 1 - Neutral (2.828ms)
✔ Golden Vector 2 - Full Right & Full Throttle (0.8033ms)
✔ Golden Vector 3 - Full Left, Full Brake, Clutch & Shift Up (2.2124ms)
✔ Sequence Comparison Math (0.8608ms)
✔ Rejects Malformed Frames (0.4803ms)
✔ decodeExtensions roundtrip with EXT_A and EXT_B (1.0051ms)
✔ E2E Full Stack - Pairing, Stream & Neutralization (141.179ms)
✔ Safety & Fault-Injection: Mandatory Pairing & Token Rejection (BR-SEC-01, BR-SEC-03) (125.2213ms)
✔ Safety & Fault-Injection: Session Exclusivity & Takeover Prevention (BR-CON-01, BR-CON-03) (129.9586ms)
✔ Safety & Fault-Injection: Malformed, Short, and Corrupted Packets (BR-SEC-05) (0.2951ms)
✔ Safety & Fault-Injection: Sequence Rollover & Stale Out-of-Order Packets (BR-STATE-03) (0.1887ms)
✔ Safety & Fault-Injection: Numeric Safety NaN & Infinite Inputs (BR-INP-06) (0.2263ms)
✔ Transmission Safety: MT to AT transition releases all clutch/gears (BR-MODE-03) (0.703ms)
✔ P0 Safety: Neutral Gate on Resume (BR-CON-04) (185.5796ms)
✔ P0 Safety: Sticky Stop/Pause drops subsequent binary frames (229.4951ms)
✔ P0 Safety: PipeClient mailbox coalescing preserves button edges during congestion (0.6023ms)
✔ P1 Signal Resilience: Momentary lag >150ms neutralizes output without disconnecting session (399.1101ms)
✔ Step 1.1: Resume preconditions (disconnected, ready=false, configured=false, revision mismatch, and success) (279.4994ms)
✔ Step 1.2: Rapid profile changes serialize and do not misassign late configured ACK (287.7358ms)
✔ Step 1.3: Holding throttle and require_neutral resets input lifecycle and neutralizes output (209.3471ms)
✔ Step 1.4: Pause and resume invalidates previous pointer drag session (1.4619ms)
✔ Step 1.5: Target game focus loss pauses driving and neutralizes output; return does not auto-resume (136.4256ms)
✔ Step 1.6: Second controller cannot take over an active driving session (142.2713ms)
✔ Step 2.A: Wheel disabled or disarmed rejects pointerdown and does not change angle (5.3624ms)
✔ Step 2.B & 2.C: Secondary pointer cannot steal ownership, and secondary pointer up/cancel does not release owner (3.193ms)
✔ Step 2.D: Independent multitouch across wheel, throttle, and brake operates concurrently without mutual resets (5.8691ms)
✔ Step 2.E: Pointer passing over another control without pointerdown does not take ownership (0.7486ms)
✔ Step 2.F: Uncommitted gesture cancellation: cancel releases pedal, does NOT commit H-shifter gear, and does NOT add palette item (2.8615ms)
✔ Step 2.G: Reset mid-drag invalidates previous pointer gesture and ignores subsequent move/up (0.7886ms)
✔ Step 2.H: Idempotent capture release prevents re-entrant callback loops (0.6186ms)
✔ Step 2.I: Geometry change / orientation change cancels active drag and neutralizes input (1.0004ms)
✔ Step 2.J: Reset preserves unrelated UI toggles and component selection classes (1.0236ms)
✔ Step 2.K: Late spring auto-center callback after reset does not overwrite neutral angle (1.1395ms)
✔ Step 2.L: Repeated pause/resume/reset cycles do not accumulate leaks, listeners, or state (0.7333ms)
✔ Step 3.1: Control-math single source of truth verification (3.9917ms)
✔ Step 3.2: Multi-source hold tracking (touch + keyboard independent release) (1.5339ms)
✔ Step 3.3: Pulse action held for extended duration does not stay asserted nor repeat (1.2846ms)
✔ Step 3.4: Rapid double tap produces observable release gap between pulses (3.056ms)
✔ Step 3.5: Stale or late ACK does not confirm or erase a newer queued tap (0.8576ms)
✔ Step 3.6: Transmission mode filtering at final snapshot stage (AT, MT, MTC, H) (1.1096ms)
✔ Step 3.7: Reset isolates session: does not replay previous inputs or queued pulses (0.7395ms)
ℹ tests 72
ℹ suites 0
ℹ pass 72
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1725.9115
```

### Lệnh 2: Kiểm thử C# Bridge
```powershell
dotnet test apps/bridge/Bridge.Tests/Bridge.Tests.csproj
```
**Kết quả thực tế:**
```text
Test run for C:\Users\luuhu\OneDrive\Desktop\Project\Wheel\apps\bridge\Bridge.Tests\bin\Debug\net9.0\Bridge.Tests.dll (.NETCoreApp,Version=v9.0)
VSTest version 17.14.1 (x64)

Starting test execution, please wait...
A total of 1 test files matched the specified pattern.

Passed!  - Failed:     0, Passed:    10, Skipped:     0, Total:    10, Duration: 349 ms - Bridge.Tests.dll (net9.0)
```

### Lệnh 3: Kiểm thử Windows Named Pipe E2E Pipeline
```powershell
npm run test:e2e-bridge
```
**Kết quả thực tế:**
```text
✔ WebSocket through Gateway and Named Pipe applies one committed state in C# (1178.5671ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 1458.8425
```

---

## 5. Những Phần Chưa Hoàn Tất hoặc Chưa Kiểm Chứng

1. **Kiểm thử trên game PC thật và Windows driver vJoy/ViGEm thực tế:**
   - Các bài kiểm thử hiện tại đã xác thực qua Unit Test, Mock IPC và Windows Named Pipe thật kết nối với C# Bridge. Delivery qua PipeClient/bridge còn được kiểm tra kỹ lưỡng ở Bước 6. Cảm giác lái và độ trễ thực tế với driver vật lý trên PC cần chạy trực tiếp trong game thật.
2. **Cảm ứng phần cứng đa chạm đồng thời trên điện thoại thật:**
   - Đã kiểm chứng tự động logic đa nguồn giữa các Touch Source IDs và Keyboard Codes trong môi trường tích hợp (Mock DOM ghi rõ trong test harness). Cần thử nghiệm thêm trên màn hình cảm ứng di động thật (iOS Safari / Android Chrome) với 3-4 ngón tay chạm liên tục nhằm nghiệm thu chất lượng phần cứng cảm ứng.

---

## 6. Trạng Thái Tổng Kết Bước 3

| Hạng mục | Trạng thái | Đánh giá |
|---|---|---|
| `STEP3-CONTROL-MATH-DUP` | **COMPLETE** | Đạt; duy nhất một nguồn logic chuẩn được import và sử dụng. |
| `STEP3-MULTI-SOURCE-HOLD` | **COMPLETE** | Đạt; touch và keyboard có lifecycle độc lập, không dẫm trạng thái. |
| `STEP3-PULSE-HOLD-CLAMP` | **COMPLETE** | Đạt; giữ lâu de-assert sau 60ms và không tự repeat. |
| `STEP3-PULSE-GAP-MACHINE` | **COMPLETE** | Đạt; có khoảng nghỉ release gap (>= 50ms) giữa 2 tap nhanh. |
| `STEP3-STALE-ACK-ISOLATION` | **COMPLETE** | Đạt; ACK tương quan theo `pulseId`, không drop hay xóa tap mới. |
| `STEP3-MODE-FILTER-FINAL` | **COMPLETE** | Đạt; snapshot lọc sạch bit theo 4 mode AT, MT, MTC, H. |
| `STEP3-RESET-PURGE-OLD` | **COMPLETE** | Đạt; reset dọn sạch queue, không rò rỉ input sang phiên mới. |
| **Kiểm thử hồi quy Bước 1 & 2** | **COMPLETE** | Toàn bộ 17 test cases của Bước 1 và 2 giữ nguyên trạng thái PASS 100%. |

---

## 7. BƯỚC 3.1: SỬA KEYBOARD LIFECYCLE VÀ KIỂM CHỨNG LUỒNG GỬI PULSE

### 7.1. Đối chiếu mã nguồn cuối cùng và phân tích nguyên nhân

Khi đối chiếu `bindButton` trong `apps/controller-web/public/src/app.js`:
- **Đoạn mã có lỗi trước đó:**
  - `keydown` gọi `down('kbd:' + e.code)`.
  - `blur` gọi `up(touchSourceId)`.
  - `_resetPointer` chỉ cleanup khi `pointer !== null`.
- **Hệ quả lỗi được chứng minh:**
  1. Khi người dùng thao tác phím bàn phím (`Space`, `Enter`) mà không chạm chuột/cảm ứng (`pointer === null`), `_resetPointer` khi gọi qua `reset()` hoặc `pause()` sẽ thoát sớm và bỏ qua hoàn toàn việc dọn dẹp các phím đang giữ. Các nguồn `kbd:...` tiếp tục sống qua chu kỳ reset và phát input không mong muốn.
  2. Khi nút bấm mất focus (`blur`), việc gọi `up(touchSourceId)` vô tình nhả nhầm touch/pointer hợp lệ đang sở hữu nút, trong khi lại không nhả các phím bàn phím thực sự đang giữ trên nút đó.
  3. Phím `keydown` không kiểm tra `e.repeat`, dẫn đến hiện tượng auto-repeat của hệ điều hành phát sinh thêm xung (pulse) không mong muốn.
  4. Việc dùng chung một định danh phím (không gắn với instance nút) khiến hai control khác nhau cùng ánh xạ vào một action dẫm trạng thái lên nhau.

- **Giải pháp triển khai trong `apps/controller-web/public/src/app.js` và `packages/profiles/src/input-state.js`:**
  - **Ownership bàn phím độc lập:** Mỗi nút được cấp một `button._btnSourceId` riêng biệt (ví dụ `btn:shiftUp:3a8k1`). Khi phím được nhấn, source ID được định danh duy nhất theo cấu trúc `kbd:${button._btnSourceId}:${code}`.
  - **Theo dõi danh sách phím cục bộ:** Sử dụng `button._heldKeys = new Set()` để lưu trữ tất cả phím đang nhấn trên nút đó (hỗ trợ cả Space, Enter và các phím giữ đồng thời).
  - **Nhả phím chính xác tại blur:** Khi nút nhận sự kiện `blur`, toàn bộ phím trong `button._heldKeys` được nhả độc lập; touch/pointer hợp lệ giữ nguyên trạng thái sở hữu.
  - **Cleanup độc lập pointer:** Chuẩn hóa `_resetPointer` (và alias `_cleanup`) để luôn hủy pointer capture, giải phóng pointer touch ID VÀ dọn sạch toàn bộ `_heldKeys`, đồng thời cập nhật visual class `.active` ngay cả khi `pointer === null` (đạt tính idempotent hoàn toàn).
  - **Auto-repeat guard:** Chặn sự kiện auto-repeat của bàn phím bằng `if (e.repeat) return;`.
  - **Transmitted Gap Guarantee:** Trong `InputState`, bổ sung cờ `requireTransmittedGap` và phương thức `notifyTransmitted(snapshot, now)`. State machine bắt buộc frame release (bit = 0) phải thực sự được truyền đi trên đường truyền mạng (`gapTransmitted = true`) trước khi dequeue xung tiếp theo, ngăn chặn triệt để trường hợp frame bị drop/skip do backpressure mà vẫn tự ý chuyển sang xung mới.
  - **Session Epoch Isolation:** Thêm `sessionEpoch` vào `InputState` và `app.js`. Khi reset, epoch tăng dần; ACK từ phiên cũ bị từ chối triệt để, không thể xác nhận nhầm tap của phiên mới.
  - **Pending Pruning:** Giới hạn kích thước `pending` map theo chính sách FIFO (tối đa 64 entries) để tránh tràn bộ nhớ khi mất gói hoặc ACK đến muộn.

---

### 7.2. Kết quả 8 Regression Tests bắt buộc (3.8.A — 3.8.H)

Các ca kiểm thử tự động được xây dựng trong `tests/integration/step3-input-semantics.test.js` sử dụng production `bindButton`, `InputState` và simulated clock:

| STT | Tên Test Case | Mô tả ca kiểm thử | Kết quả |
|---|---|---|---|
| **3.8.A** | `Step 3.8.A: Enter down -> button blur` | Nhấn giữ Enter trên nút rồi nút mất focus (`blur`). Keyboard source được nhả đúng nguồn, nút trở về trạng thái không active. | **PASS** (1.42ms) |
| **3.8.B** | `Step 3.8.B: Keyboard-only down -> app reset` | Nhấn phím bàn phím khi `pointer === null`, sau đó app reset. Input model trung tính (0/0n), class `.active` bị xóa và `_heldKeys` rỗng. | **PASS** (1.26ms) |
| **3.8.C** | `Step 3.8.C: Touch + keyboard on same button -> button blur` | Cả touch và keyboard cùng giữ một nút. Khi button blur, keyboard nhả nhưng touch pointer hợp lệ vẫn giữ nguyên, class `.active` vẫn duy trì. | **PASS** (1.14ms) |
| **3.8.D** | `Step 3.8.D: Space + Enter on same button -> releasing one key` | Nhấn cả Space và Enter trên cùng một nút. Nhả một phím, phím còn lại vẫn tiếp tục giữ nút và UI `.active` vẫn sáng. | **PASS** (0.89ms) |
| **3.8.E** | `Step 3.8.E: Two distinct controls mapped to same action` | Hai nút khác nhau cùng ánh xạ một action (ví dụ 2 lẫy số). Nhả một nút không làm mất input đang giữ của nút kia do source ID gắn theo từng instance. | **PASS** (0.71ms) |
| **3.8.F** | `Step 3.8.F: Keydown auto-repeat` | Hệ điều hành phát sinh liên tục các sự kiện `keydown` với `e.repeat === true`. Không phát sinh thêm bất kỳ xung nào vào hàng đợi. | **PASS** (0.83ms) |
| **3.8.G** | `Step 3.8.G: Pause/resume, background, and late events` | Pause/background làm app reset. Các event `keyup` hoặc `pointerup` đến muộn sau khi reset không phục hồi lại input cũ. | **PASS** (0.92ms) |
| **3.8.H** | `Step 3.8.H: Two rapid taps through sendStateFrame, skipped frame, stale ACK, and sequence wrap` | Hai tap nhanh qua pipeline gửi thật `sendStateFrame`, mô phỏng nghẽn mạng `bufferedAmount > 4096`, sequence wrap 255 -> 0, ACK chéo phiên và giới hạn `pending` FIFO. | **PASS** (5.01ms) |

---

### 7.3. Trace chi tiết chuỗi frame trên dây mạng của hai tap nhanh (Test 3.8.H)

Dưới đây là trace các gói tin nhị phân production 8 byte thực tế được phát qua `sendStateFrame` trong bài test 3.8.H:

```text
[T = 1000ms] Tap 1 nhấn (Enter down/up). 
             sendStateFrame() gửi chuỗi 3 frames (EXT_A, EXT_B, STATE_0x11).
             -> FRAME 1: Type 0x11, Seq = 1, Buttons = 0x2000 (SHIFT_UP = 1, Bit 13), Throttle = 0, Brake = 0
             -> ACK nhận cho Frame 1 (Seq = 1, PulseId = 1, Epoch = 1) -> Xác nhận Pulse 1.

[T = 1070ms] Pulse 1 hoàn tất duration (60ms) và đã được ACK -> Chuyển sang trạng thái GAP (gapUntil = 1120ms).
             Mô phỏng nghẽn mạng: ws.bufferedAmount = 5000 (> 4096).

[T = 1080ms] Tap 2 nhấn (Enter down/up).
             sendStateFrame() được gọi nhưng bị bỏ qua (frame skipped) do bufferedAmount cao.
             -> Không có frame nào được gửi qua WebSocket. Tap 2 được giữ trong hàng đợi pulseQueues.
             -> Release GAP chưa được gửi qua dây mạng nên gapTransmitted = false.

[T = 1130ms] Hết nghẽn mạng: ws.bufferedAmount = 0. Thời gian t = 1130ms (> 1120ms).
             sendStateFrame() được gọi. Do requireTransmittedGap = true và gapTransmitted chưa bật,
             hệ thống BẮT BUỘC phải gửi frame nhả trước!
             -> FRAME 2 (Release Gap): Type 0x11, Seq = 2, Buttons = 0x0000 (SHIFT_UP = 0), Throttle = 0, Brake = 0
             -> notifyTransmitted() kích hoạt, ghi nhận gapTransmitted = true trên dây mạng!

[T = 1140ms] sendStateFrame() tiếp theo được gọi. 
             State machine quan sát gapTransmitted = true, chính thức dequeue Tap 2 từ pulseQueues sang ACTIVE.
             -> FRAME 3 (Tap 2): Type 0x11, Seq = 3, Buttons = 0x2000 (SHIFT_UP = 1), Throttle = 0, Brake = 0

[T = ... ] Sequence wrap test:
             Đặt seq = 255 -> sendStateFrame() -> Seq wrap thành công sang 0.
             Pending map ghi nhận key 0 chính xác.

[T = ... ] Stale ACK test:
             Gửi ACK với sessionEpoch = 999 (khác sessionEpoch hiện tại = 1).
             -> Bị từ chối triệt để, không ghi nhận vào acknowledgedPulseIds.

[T = ... ] Pending FIFO Pruning:
             Gửi liên tục 70 frames không nhận ACK.
             -> Pending map được cắt tỉa FIFO, giữ kích thước ổn định <= 64 entries.
```

Chuỗi frame trên đường truyền đạt tiêu chuẩn: **Press 1 (Bit 1) → Gap Release (Bit 0) → Press 2 (Bit 1)**, không bị nuốt mất cạnh nhả ngay cả khi gặp nghẽn mạng.

---

### 7.4. Kết quả thực thi bộ test tổng thể

Toàn bộ test suite của dự án đạt **100% PASS**:
1. `npm test`: **80/80 passed** (0 fail, 0 skipped, thời lượng ~1.5s).
2. `npm run test:dotnet`: **10/10 passed** (C# Bridge unit tests).
3. `npm run test:e2e-bridge`: **1/1 passed** (Windows Named Pipe E2E).
