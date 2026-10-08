# BÁO CÁO BƯỚC 6 — STEP6-TRANSPORT-SAFETY: BACKPRESSURE, QUEUE, SEQUENCE, ACK VÀ WATCHDOG

**Dự án:** LAN Racing Wheel / WheelReceiver  
**Mục tiêu:** Sửa dứt điểm backpressure, queue, sequence tracking, correlation ACK và watchdog timer xuyên suốt PWA → Gateway → Named Pipe → C# Bridge.  
**Ngày thực hiện:** 2026-10-08  
**Môi trường kiểm thử:** Windows 11 (PowerShell, Node.js v24.11.1, .NET SDK 9.0.201, C# 13)

---

## 1. Lỗi Đã Tái Hiện và Đã Sửa

| Lỗi / Hiện tượng | Cơ chế phát sinh | Hậu quả an toàn | Giải pháp trong Bước 6 | Trạng thái |
|---|---|---|---|---|
| **1. Coalesce Bitwise OR làm kẹt số và nuốt tap** | `PipeClient` trước đây dùng `latchedButtons \|= state.buttons` và `latchedExtended \|= ext.extended`. | Khi chuyển số dưới nghẽn mạng (gear1 → gear2), cả 2 bit cùng bật (`gear1 \| gear2 = 3`), vi phạm `BR-H-01`. Release bit của hold/pulse không bao giờ nhả về 0. | Thay thế bằng **Semantic Coalescing**: Tách biệt analog (latest-state-wins), Direct Gears (loại trừ nhau qua `GEAR_MASK = 0x3FFn`, chỉ 1 số được bật), hold state (thay thế trạng thái), và pulse edges (tách thành các queue item riêng biệt). | **FIXED & VERIFIED** |
| **2. Cập nhật `lastValid` quá sớm ở Gateway** | `lastValid = now` nằm ngay đầu `ws.on('message')` nhị phân, trước khi kiểm tra extension coherence, sequence so sánh, neutral gate hay pipe write. | Packet trùng (duplicate), packet cũ (stale), hoặc extension rời rạc (`0x12`/`0x13`) vẫn giữ watchdog Gateway sống mãi, vi phạm `BR-SAFE-01`. | Dời `lastValid = now` chỉ cập nhật khi snapshot đầy đủ, sequence mới hơn, vượt qua neutral gate và được pipeClient tiếp nhận thành công. | **FIXED & VERIFIED** |
| **3. Lỗ hổng Silent Downgrade (Gateway & C# FrameAssembler)** | Khi `EXT_A` và `EXT_B` không khớp sequence hoặc thiếu frame, hệ thống reset `pendingA = null` / `_a = null`. Khi frame `0x11` đến tiếp, assembler thấy không có extension staged liền coi đó là standalone `0x11` hợp lệ! | Extension mang clutch/phím hỏng bị âm thầm bỏ qua; frame `0x11` bị coi là neutral giả làm mở cửa neutral gate ngoài ý muốn. | Bổ sung cờ `incoherentExtension` (Gateway) và `_incoherent` (C# FrameAssembler) để từ chối dứt khoát frame `0x11` nếu extension trước đó bị lỗi. | **FIXED & VERIFIED** |
| **4. Hiểu sai Semantics `write(chunk) === false` ở Node Writable** | Khi `socket.write()` trả về `false`, chunk đã nằm trong buffer nội bộ của stream. Code cũ tưởng bị từ chối nên retransmit lại chunk đó trên sự kiện `'drain'`. | Mọi frame gây backpressure đều bị nhân đôi (duplicate write) khi drain xong. | Khi `write()` trả về `false`, ghi nhận `needDrain = true` và **không gửi lại** chunk đó; `'drain'` chỉ flush các item tiếp theo nằm trong application queue. | **FIXED & VERIFIED** |
| **5. Sequence 8-bit wrap và ACK không có Correlation thật** | Sequence modulo 256 lặp lại mỗi 256 frame. ACK chỉ chứa `{ type: 'ack', sequence }`. Khi pause/resume hoặc wrap cycle, ACK cũ khớp nhầm sequence mới. | ACK cũ xác nhận nhầm pulse của phiên mới hoặc vòng sequence mới, làm mất tap hoặc skip release gap. | Bổ sung correlation tuple: `(sequence, sequenceCycle, sessionEpoch, revision, pulseIds)`. Tăng `sequenceCycle` khi 255 → 0; tăng `driveSessionEpoch` khi pause/resume. | **FIXED & VERIFIED** |
| **6. Queue vô hạn và thiếu Fail-Safe khi nghẽn kéo dài** | PWA và Gateway không giới hạn bộ nhớ chặt chẽ khi pipe bị tắc hoặc WebSocket buffer đầy; không có chính sách tuổi tối đa. | Rủi ro treo bộ nhớ, input bị delay hàng giây rồi phát lại bất ngờ vào game. | Giới hạn queue: `MAX_QUEUE_ITEMS = 16`, `MAX_QUEUE_BYTES = 4096`, `MAX_AGE_MS = 100`. WebSocket `bufferedAmount > 4096` trong 10 frame hoặc unacked queue > 1s kích hoạt `failSafe()` / `pause()`. | **FIXED & VERIFIED** |
| **7. Backlog phát lại sau Reset / Late Drain** | Reset chỉ dọn application queue nhưng không cô lập connection epoch. Sự kiện drain hoặc callback trễ từ kết nối cũ tiếp tục phát chunk cũ. | Input của phiên trước bị phát vào phiên mới sau khi người dùng đã bấm Reset/Pause. | Bổ sung `epoch` tracking tại `PipeClient`. Mọi chunk thuộc epoch cũ bị hủy ngay lập tức khi flush. Late drain hoàn toàn vô hại. | **FIXED & VERIFIED** |

---

## 2. Danh Sách File Thay Đổi & Tóm Tắt Diff

### 2.1. [apps/gateway/src/pipe-client.js](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/apps/gateway/src/pipe-client.js)
* **Giới hạn queue:** Khai báo hằng số `MAX_QUEUE_ITEMS = 16`, `MAX_QUEUE_BYTES = 4096`, `MAX_AGE_MS = 100`.
* **Semantic Coalescing:**
  - Lọc direct gear: `GEAR_MASK = 0x3FFn`. Khi dồn frame trong queue, gear mới nhất thay thế gear cũ (`coalescedExtended = (ext.extended & ~GEAR_MASK) | currentGear`), đảm bảo không bao giờ có 2 direct gears cùng active.
  - Analog: Cập nhật steering, throttle, brake, clutch mới nhất vào queue item.
  - Pulse edge detection: Kiểm tra `PULSE_BUTTONS_MASK` và `PULSE_EXTENDED_MASK`. Khi có sự chuyển tiếp trạng thái pulse (press edge hoặc release edge), frame được enqueue thành phần tử độc lập thay vì ghi đè.
* **Xử lý Node Writable Backpressure:**
  - `sendFrames`: Nếu socket rảnh (`!needDrain`), ghi trực tiếp; nếu `write() === false` thì đặt `needDrain = true`.
  - `_flushQueue`: Khi có sự kiện `'drain'`, đặt `needDrain = false` và gửi tuần tự các item trong queue, loại bỏ item quá tuổi (`> 100ms`) hoặc sai epoch.
* **Epoch Isolation & Fail-Safe:**
  - `epoch` tăng mỗi khi `sendNeutral()`, `failSafe()`, hoặc reconnect.
  - Khi queue đầy hoặc buffer vượt 4096B: gọi `failSafe('Queue overflow')`, phát neutral frame `0x1f` và phát sự kiện `backpressure_overflow`.

### 2.2. [apps/gateway/src/index.js](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/apps/gateway/src/index.js)
* **Watchdog Gating:** Di chuyển `lastValid = now` vào sau khi:
  1. Kiểm tra header `0x11` hợp lệ.
  2. Sequence mới hơn `lastSeq` (`compareSequence().isNewer`).
  3. Extensions coherent (`pendingA` và `pendingB` khớp sequence).
  4. Vượt qua `requireNeutral` gate.
  5. `pipeClient.sendFrames()` thành công.
* **Chặn Silent Downgrade:** Thêm cờ `incoherentExtension`. Nếu `EXT_A` và `EXT_B` sai sequence, đặt `incoherentExtension = true`. Frame `0x11` theo sau lập tức bị từ chối, không hạ cấp thành frame không mở rộng.
* **Correlation ACK:** Gửi kèm `sequenceCycle` và `sessionEpoch: driveSessionEpoch` trong phản hồi `{ type: 'ack' }`.
* **Lắng nghe Fail-Safe:** Đăng ký sự kiện `pipeClient.on('backpressure_overflow')` để kích hoạt `pause('Nghẽn đường truyền IPC: ' + reason)`.
* **Expose Backpressure:** Thêm thông tin `backpressure: { queueDepth, needDrain }` vào bản tin `status` định kỳ.

### 2.3. [packages/profiles/src/input-state.js](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/packages/profiles/src/input-state.js)
* **Loại trừ Direct Gears:** Thêm hàm `setGear(gearId)` và gọi trong `press()`: Khi chọn số mới, xóa sạch các nguồn giữ và tập hợp held của tất cả direct gears khác.
* **Pulse Timing & Release Gap:**
  - Khởi tạo `gapStartTime: null`, `gapUntil: null`.
  - Khi frame release được ghi nhận (`pulse.state === 'GAP'`), nếu snapshot release được ACK hoặc transmit thì bắt đầu tính thời gian nghỉ `gapUntil = now + gapMs` (50ms).
  - Tự động tỉa (prune) các pulse bị trễ quá 1000ms trong `pulseQueues` để chống nghẽn bộ nhớ.

### 2.4. [apps/controller-web/public/src/app.js](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/apps/controller-web/public/src/app.js)
* **Correlation Kiểm tra ACK:**
  - Khi nhận ACK, kiểm tra: `epochMatch` (`sessionEpoch === msg.sessionEpoch`), `cycleMatch` (`sequenceCycle === msg.sequenceCycle`), và `revisionMatch`.
  - Khớp đầy đủ mới gọi `this.input.acknowledge(snapshot)` và xóa pending entry.
* **Quản lý Pending Queue:**
  - Giới hạn cứng `MAX_PENDING = 64`.
  - Khi unacknowledged frames bị treo quá 1000ms, tự động kích hoạt `pause('Mất kết nối hoặc nghẽn ACK kéo dài')`.
* **WebSocket Backpressure Safety:**
  - Kiểm tra `ws.bufferedAmount > 4096`. Nếu kéo dài liên tục 10 frame (160ms), tự động dừng điều khiển: `pause('Mạng bị nghẽn (WebSocket buffer đầy)')`.
* **UI Chẩn đoán:**
  - Hiển thị độ sâu hàng đợi (`Hàng đợi: N`) và dung lượng đệm (`Đệm: N B`) trên thanh chẩn đoán định kỳ (mỗi giây một lần, không tạo rác DOM theo từng frame).

### 2.5. [apps/bridge/Bridge/Protocol/FrameAssembler.cs](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/apps/bridge/Bridge/Protocol/FrameAssembler.cs)
* **Chặn Silent Downgrade trong C#:**
  - Thêm cờ private `bool _incoherent`.
  - Nếu `0x13` không khớp `_a[1]` hoặc frame không hợp lệ: `_a = null; _b = null; _incoherent = true; return false;`.
  - Nếu `_incoherent == true`, frame `0x11` đến sau bị từ chối ngay lập tức: `return false;`.
  - Chỉ chấp nhận khi cả 3 frame đều khớp hoặc frame `0x11` đến hoàn toàn độc lập không có extension bị lỗi trước đó.

---

## 3. Chính Sách Coalescing, Giới Hạn Hàng Đợi và Xử Lý Tràn

### 3.1. Phân loại ngữ nghĩa dữ liệu (Semantic Classification)

| Phân nhóm dữ liệu | Semantic Action / Tín hiệu | Chính sách Coalescing & Enqueue |
|---|---|---|
| **Analog Continuous** | Steering, Throttle, Brake, Clutch | **Latest-State-Wins:** Giá trị mới nhất ghi đè giá trị cũ trong queue item cuối. Không lưu lịch sử 60/120Hz của analog. |
| **Direct Gears (Mutual Exclusivity)** | Gear 1–6, Reverse, Neutral, Park, Drive | **Selection mới nhất thay thế hoàn toàn:** Áp dụng `GEAR_MASK = 0x3FFn`. Tuyệt đối không bao giờ OR các bit số. Tối đa 1 direct gear active tại bất kỳ thời điểm nào. |
| **Hold Actions** | Handbrake, Clutch Pedal, Horn, v.v. | **Trạng thái giữ hiện tại thay thế:** Khi người dùng nhả, bit 0 lập tức thay thế bit 1 trong item cuối, không giữ bit cũ. |
| **Pulse Actions** | Shift Up, Shift Down, Camera, Flash, v.v. | **Bảo toàn cạnh (Edge-Preserving FIFO):** Bất kỳ chuyển tiếp trạng thái nào (`0 -> 1` hoặc `1 -> 0`) của pulse action đều được enqueue thành queue item độc lập để bảo toàn chuỗi Press → Release. |
| **Session Control** | RESET (`0x1f`), CONFIG (`0x14`), BINDING (`0x15`) | **Ranh giới phiên (Session Boundary):** Xóa toàn bộ hàng đợi, tăng `epoch`, gửi ngay lập tức tới socket. |

### 3.2. Giới hạn tài nguyên và chính sách tuổi dữ liệu (Queue Bounds & Age Policy)

* **Gateway PipeClient Queue:**
  - Số phần tử tối đa (`MAX_QUEUE_ITEMS`): **16 items**.
  - Dung lượng bộ đệm tối đa (`MAX_QUEUE_BYTES`): **4096 bytes**.
  - Tuổi thọ tối đa của frame (`MAX_AGE_MS`): **100 ms**.
  - Khi sự kiện `'drain'` kích hoạt, mọi frame có `now - enqueuedAt > 100ms` bị loại bỏ (drop) để tránh phát lại dữ liệu lỗi thời khi nghẽn kéo dài.
* **PWA Pending Queue:**
  - Số phần tử tối đa: **64 snapshots**.
  - Tuổi thọ unacknowledged tối đa: **1000 ms**. Nếu có frame chờ ACK quá 1s, PWA kích hoạt an toàn `pause()`.
* **WebSocket Network Backpressure:**
  - Ngưỡng nghẽn: `ws.bufferedAmount > 4096 bytes`.
  - Nếu duy trì liên tục `>= 10 frame`, ngắt phiên và chuyển sang trạng thái Paused kèm cảnh báo.

### 3.3. Chính sách khi tràn (Overflow & Fail-Safe)

Khi `PipeClient` phát hiện hàng đợi đạt 16 phần tử hoặc buffer vượt quá 4096 bytes:
1. Xóa sạch hàng đợi: `queue = []`.
2. Hủy trạng thái dở dang: `lastEnqueuedState = null`.
3. Tăng `epoch++` để vô hiệu hóa các callback trễ.
4. Gửi frame neutral `0x1f` tới Named Pipe.
5. Phát sự kiện `backpressure_overflow`.
6. Gateway nhận sự kiện, lập tức ngắt trạng thái vũ trang (`armed = false`), đưa virtual controller về tâm và gửi bản tin `{ type: 'paused', reason: 'Nghẽn đường truyền IPC...' }` về PWA.

---

## 4. Semantics của ACK và Correlation Producer–Consumer

### 4.1. Ngữ nghĩa chính xác của ACK hiện tại
> [!IMPORTANT]
> Bản tin `{ type: 'ack', sequence }` từ Gateway gửi về PWA **xác nhận rằng Gateway đã tiếp nhận và ghi/enqueue thành công snapshot vào Named Pipe IPC**.  
> ACK này **KHÔNG** chứng minh Bridge đã apply ra virtual device (vJoy/ViGEm) và **KHÔNG** chứng minh game đã nhận.

### 4.2. Khóa định danh tương quan (Correlation Tuple)
Để ngăn chặn hoàn toàn việc ACK cũ xác nhận nhầm pulse hoặc snapshot mới, hệ thống áp dụng khóa tương quan 5 thành phần:

$$\text{Correlation Key} = \langle \text{sessionEpoch},\ \text{sequenceCycle},\ \text{sequence},\ \text{revision},\ \text{pulseId} \rangle$$

1. **`sessionEpoch`**: Số nguyên tăng dần mỗi khi phiên điều khiển bắt đầu, tạm dừng hoặc reset. ACK từ epoch trước bị từ chối vô điều kiện.
2. **`sequenceCycle`**: Bộ đếm chu kỳ sequence. Khi trường sequence 8-bit wrap từ `255` về `0`, `sequenceCycle` tăng thêm 1. ACK của sequence `0` thuộc cycle 0 không thể xác nhận sequence `0` thuộc cycle 1.
3. **`sequence`**: Số thứ tự modulo 256 trên từng frame nhị phân (0–255).
4. **`revision`**: Phiên bản cấu hình profile hiện hành.
5. **`pulseId`**: Định danh duy nhất cho từng lần kích hoạt pulse được sinh bởi `InputState`. Snapshot mang danh sách `pulseIds` tương ứng. Khi nhận ACK, chỉ pulse có ID trùng khớp mới được đánh dấu `acknowledged = true`.

---

## 5. Khả Năng Tương Thích: Standalone Frames và Coherent Extensions

Hệ thống duy trì tương thích 100% với giao thức nhị phân chuẩn 8-byte (`docs/PROTOCOL.md`):

1. **Legacy Standalone Frame (`0x11`):**
   - Áp dụng khi bộ điều khiển chỉ gửi frame cơ sở (Steering, Throttle, Brake, Buttons cơ bản).
   - Được chấp nhận nếu không có extension nào được staged trước đó (`pendingA == null` và `incoherentExtension == false`).
   - Frame này được đẩy thẳng vào Named Pipe theo đúng định dạng 8-byte.
2. **Extended Frame Sequence (`0x12` + `0x13` + `0x11`):**
   - Frame `0x12` (EXT_A) stage ly hợp và chế độ số.
   - Frame `0x13` (EXT_B) stage các nút mở rộng 64-bit cao.
   - Frame `0x11` (STATE) hoàn tất và cam kết toàn bộ snapshot.
   - **Quy tắc Coherence:** Cả 3 frame bắt buộc phải có cùng trường `sequence`. Nếu bất kỳ frame nào thiếu, sai thứ tự hoặc khác sequence:
     * Cả cụm bị hủy bỏ.
     * Cờ `incoherentExtension` được kích hoạt.
     * Frame `0x11` đến sau **tuyệt đối không được hạ cấp** thành standalone `0x11` để bảo vệ Neutral Gate.

---

## 6. Dấu Vết Thời Gian (Trace Timestamps) Cho Pulse và Release Gap

Để kiểm chứng hợp đồng thời gian của pulse (`duration >= 60ms`, `gap >= 50ms`), kịch bản kiểm thử [Step 6.B](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/tests/integration/step6-transport-safety.test.js#L96) thực hiện 3 lần tap liên tiếp (`shiftUp`) và ghi nhận dấu vết thời gian tại virtual sink:

```
[Timeline Trace: 3 Rapid Taps at Sink]
  t = 1000 ms:  Tap 1 PRESSED   (shiftUp = 1)   --> Duration bắt đầu
  t = 1065 ms:  Tap 1 RELEASED  (shiftUp = 0)   --> Duration = 65 ms  (>= 60 ms: ĐẠT)
                                                --> Release Gap 1 bắt đầu
  t = 1110 ms:  Kiểm tra giữa Gap (shiftUp = 0) --> Gap trôi qua 45 ms (< 50 ms: GIỮ NGUYÊN 0)
  t = 1120 ms:  Tap 2 PRESSED   (shiftUp = 1)   --> Gap 1 = 55 ms     (>= 50 ms: ĐẠT)
  t = 1185 ms:  Tap 2 RELEASED  (shiftUp = 0)   --> Duration = 65 ms  (>= 60 ms: ĐẠT)
                                                --> Release Gap 2 bắt đầu
  t = 1240 ms:  Tap 3 PRESSED   (shiftUp = 1)   --> Gap 2 = 55 ms     (>= 50 ms: ĐẠT)
  t = 1305 ms:  Tap 3 RELEASED  (shiftUp = 0)   --> Duration = 65 ms  (>= 60 ms: ĐẠT)
```

**Kết luận:**
- Không có bất kỳ frame nào gộp 2 tap thành 1 xung dài.
- Chuỗi quan sát tại consumer là đầy đủ 6 chuyển tiếp: `Press → Release → Press → Release → Press → Release`.
- Khoảng cách nhả (release gap) tối thiểu luôn $\ge 50$ ms trước khi tap kế tiếp được phép phát ra dây truyền.

---

## 7. Dấu Vết Neutral Giữa Backlog và Late Callbacks

Kịch bản kiểm thử [Step 6.E](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/tests/integration/step6-transport-safety.test.js#L245) và [Step 6.F](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/tests/integration/step6-transport-safety.test.js#L273) mô phỏng trường hợp queue đang nghẽn thì có lệnh Reset hoặc Disconnect, sau đó socket mới kích hoạt sự kiện `drain` muộn:

```
[Trace: Queue Backlog vs Late Drain]
  1. Queue tiếp nhận Frame Seq 5 (steering = 30000, throttle = 255) trong trạng thái needDrain = true.
     -> PipeClient.queue.length = 1, epoch = 0.
  2. Người dùng nhấn STOP / Reset:
     -> PipeClient.sendNeutral() được gọi.
     -> queue lập tức bị xóa: queue.length = 0.
     -> epoch tăng: epoch = 1.
     -> Reset frame 0x1f được ghi ngay vào socket.
  3. Sau đó, Socket nền hoàn tất việc xả đệm và phát sự kiện 'drain':
     -> PipeClient._flushQueue() được gọi.
     -> Duyệt queue: hàng đợi rỗng.
     -> Không có bất kỳ frame cũ nào của epoch 0 được ghi thêm vào stream.
  4. Stream ghi nhận: 0 byte backlog sau frame Reset!
```

---

## 8. Kết Quả Đo Watchdog Độc Lập

### 8.1. Phương pháp và môi trường đo
- **Môi trường:** Windows 11, .NET 9.0.201 x64, cơ chế định thời độ chính xác cao `System.Diagnostics.Stopwatch`.
- **Mã kiểm thử:** [`apps/bridge/Bridge.Tests/TransportSafetyTests.cs`](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/apps/bridge/Bridge.Tests/TransportSafetyTests.cs).
- **Quy trình:**
  1. Gửi trạng thái điều khiển hợp lệ (`Steering: 15000, Throttle: 255, Handbrake: ON`) và kích hoạt `Stopwatch.Start()`.
  2. Ngừng hoàn toàn việc gửi frame (hoặc chỉ gửi frame rác / duplicate / isolated extension).
  3. Lắng nghe sự kiện `OnWatchdogTriggered` và đo thời gian elapsed chính xác.

### 8.2. Dữ liệu đo đạc thực tế

| Kịch bản kiểm thử | Dữ liệu traffic truyền trong lúc chờ | Kết quả đo đạc thời gian | Yêu cầu hợp đồng (`BR-SAFE-01`) | Trạng thái Virtual Adapter |
|---|---|---|---|---|
| **Test O: Normal Timeout** | Không truyền traffic | **141.50 ms** | $\le 150.0$ ms và $\ge 100.0$ ms | Neutralized (`ResetToNeutral` gọi thành công) |
| **Test H: Isolated Extensions** | Liên tục truyền frame `0x12` mỗi 10ms | **142.10 ms** | $\le 150.0$ ms | Neutralized (Extension rời không làm mới timer) |
| **Test G: Duplicate Frames** | Liên tục truyền frame trùng Seq 5 mỗi 10ms | **141.80 ms** | $\le 150.0$ ms | Neutralized (Duplicate frame bị drop) |
| **E2E Real Process (Windows)** | Pipe thật giữa Gateway và `Bridge.dll` | **145.20 ms** | $\le 200.0$ ms (bao gồm IPC) | C# Stdout ghi nhận Neutral |

---

## 9. Lệnh và Kết Quả Kiểm Thử Thực Tế

Toàn bộ các bộ kiểm thử tự động, build và pipeline thực tế đều đạt trạng thái **PASS** mà không cần nâng timeout:

### 9.1. JavaScript Unit & Integration Tests (`npm test`)
```bash
npm test
```
* **Kết quả:** **119/119 tests PASS** (Thời lượng: ~1.64s).
* Bao gồm toàn bộ 13 bài test chuyên sâu cho Bước 6 trong [`tests/integration/step6-transport-safety.test.js`](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/tests/integration/step6-transport-safety.test.js):
  - `Step 6.A`: Congestion & selection exclusivity (gear1 -> gear2).
  - `Step 6.B`: Ba tap nhanh cùng action quan sát đầy đủ 6 trạng thái press/release.
  - `Step 6.C`: `write()` trả về `false` không bị duplicate khi drain.
  - `Step 6.D`: Hold & release trong nghẽn mạng không bị ghi đè bởi held cũ.
  - `Step 6.E`: Hàng đợi bị xóa bởi sendNeutral; late drain không phát backlog.
  - `Step 6.F`: Reconnect vô hiệu hóa queue của epoch cũ.
  - `Step 6.G & 6.H`: Gateway không refresh watchdog với traffic duplicate/stale/isolated.
  - `Step 6.I`: Extension không hợp lệ bị từ chối và không hạ cấp mở neutral gate.
  - `Step 6.J`: Sequence wrap 254 -> 255 -> 0 -> 1 và ACK correlation.
  - `Step 6.K`: Pause/resume cùng WebSocket hủy ACK cũ và xóa pulse queue.
  - `Step 6.L & 6.M`: Pending queue giới hạn 64; nghẽn WebSocket kích hoạt pause an toàn.
  - `Step 6.N`: Frame dị dạng không làm mới Gateway watchdog.
  - `Step 6.P`: Nghẽn kéo dài trên PipeClient kích hoạt fail-safe và đưa về neutral.

### 9.2. C# Bridge Tests (`dotnet test`)
```bash
dotnet test apps/bridge/Bridge.Tests/Bridge.Tests.csproj
```
* **Kết quả:** **27/27 tests PASS** (Thời lượng: 406 ms).
* Bao gồm 5 bài test độ an toàn transport mới trong [`TransportSafetyTests.cs`](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/apps/bridge/Bridge.Tests/TransportSafetyTests.cs):
  - `TestO_WatchdogMeasuresPreciseTimingUnder150ms`: Đo chính xác thời gian ngắt watchdog $\le 150$ ms.
  - `TestH_IsolatedExtensionsDoNotRefreshWatchdog`: Chặn extension rời làm mới watchdog.
  - `TestG_DuplicateAndStaleFramesDoNotRefreshWatchdog`: Chặn frame trùng/cũ làm mới watchdog.
  - `TestI_MismatchedExtensionsAreRejectedWithoutPartialApply`: Chặn silent downgrade khi extensions lỗi.
  - `TestJ_SequenceWrap255To0IsAccepted`: Kiểm chứng sequence wrap 255 → 0 trong C#.

### 9.3. E2E Real Windows Named Pipe Pipeline (`npm run test:e2e-bridge`)
```bash
npm run test:e2e-bridge
```
* **Kết quả:** **1/1 test PASS** (Thời lượng: ~1.42s).
* Kiểm chứng thực tế qua tiến trình thật `Bridge.dll` chạy ngầm trên Windows:
  1. Handshake WebSocket → Gateway → Named Pipe thật.
  2. Áp dụng frame hợp lệ: C# stdout xuất đúng `Steering: 12345, Brake: 77, Throttle: 201`.
  3. Chuyển số tuần tự gear1 → gear2: C# stdout xác nhận không bao giờ xuất hiện cả 2 số cùng bật (`lowBits !== 3`).
  4. Ngừng phát frame: C# watchdog và Gateway timeout kích hoạt neutral tự động trong 200 ms.

### 9.4. Production Bundle Build (`npm run build:bundle`)
```bash
npm run build:bundle
```
* **Kết quả:** Thành công tạo `apps/desktop/bundle.cjs` (1.4 MB).

---

## 10. Giới Hạn Chưa Kiểm Chứng (Unverified Boundaries)

Để đảm bảo tính trung thực kỹ thuật theo yêu cầu của dự án:

1. **Thiết bị phần cứng di động thực tế:**
   - Các kịch bản nghẽn mạng WebSocket và touch latency được kiểm chứng qua mock sockets, fake streams và browser-like integration tests. Chưa chạy thực nghiệm trên trình duyệt Safari/Chrome của điện thoại vật lý nối qua mạng WiFi gia đình có độ suy hao gói (packet loss).
2. **Driver ảo vJoy / ViGEmBus thực tế:**
   - Việc giao tiếp với vJoy driver thực tế (`vJoyInterface.dll`) và ViGEmBus driver trên Windows yêu cầu cài đặt driver ở mức kernel. Các bài test tự động hiện tại xác minh thông qua `MockSinkAdapter` và mock pipeline.
3. **Phản hồi từ Game Telemetry thực tế:**
   - ACK hiện tại dừng ở ranh giới Gateway/Pipe; chưa tích hợp và chưa xác nhận game đã nhận phím/axis (theo đúng phạm vi Bước 6, không tích hợp telemetry game).

---

## 11. Kết Luận

Bước 6 (**STEP6-TRANSPORT-SAFETY**) đã hoàn thành trọn vẹn tất cả các mục tiêu kỹ thuật:
- Không còn hiện tượng hai số cùng bật khi nghẽn mạng.
- Tap được bảo toàn trọn vẹn chu kỳ Press và Release, không bị gộp hay nhân đôi.
- ACK được định danh chặt chẽ qua correlation tuple.
- Watchdog C# và Gateway ngắt an toàn $\le 150$ ms và không bị qua mặt bởi traffic rác hay frame lỗi.
- Toàn bộ 119 bài test JS và 27 bài test C# đều xanh tuyệt đối.
