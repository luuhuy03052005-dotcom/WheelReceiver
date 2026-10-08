# BÁO CÁO BƯỚC 4 — STEP4-H-SHIFTER: ĐỒNG BỘ TRẠNG THÁI SỐ, THAO TÁC H-PATTERN VÀ LỆNH RANGE/SPLIT

**Dự án:** LAN Racing Wheel / WheelReceiver  
**Mã commit cơ sở:** `602ba20` (branch `main`)  
**Ngày thực hiện & kiểm thử:** 2026-10-07  
**Môi trường chạy:** Windows (PowerShell / Node.js v24.11.1 / .NET SDK 9.0)

---

## 1. Tóm tắt Hiện trạng & Vấn đề Phát hiện Trước khi Sửa

Trước khi triển khai Bước 4, rà soát mã nguồn `apps/controller-web/public/src/h-shifter.js`, `apps/controller-web/public/src/app.js`, `packages/profiles/src/input-state.js` và `packages/profiles/src/index.js` phát hiện các khiếm khuyết sau:

1. **`pointermove` phát số trực tiếp thay vì preview riêng:**
   - Trong `h-shifter.js`, sự kiện `pointermove` gọi `this.apply(slot?.id || null, true)`. Hàm này lập tức kích hoạt callback `this.onChange` ghi đè `this.input.gear` và phát trực tiếp vào output frame khi người dùng mới chỉ rê ngón tay ngang qua một cổng số.
   - Khi sự kiện `pointercancel` hoặc `lostpointercapture` xảy ra, hệ thống lại gọi `this.select(this.previousGear)` nhằm "hoàn tác". Điều này vi phạm nguyên tắc bất biến: số chưa commit không bao giờ được phép xuất hiện trên đường truyền output.
2. **Kẹp tọa độ biên ngoài ý muốn (Edge clamping bug):**
   - Hàm `point(clientX, clientY)` sử dụng `Math.max(6, Math.min(94, ...))` để kẹp tọa độ thô ngay khi đọc từ rect. Khi người dùng nhả ngón tay ở rất xa ngoài khung (ví dụ x=2000px ngoài màn hình), tọa độ bị ép về (94, 80), nằm sát slot số lùi (`reverse`), khiến hệ thống vô tình gài số lùi ngoài ý muốn thay vì hủy thao tác.
3. **Render làm sai lệch model:**
   - Trong `app.js` (`renderControls`), tồn tại dòng lệnh `if (isH) this.hShifter.reset(false);`. Mỗi khi re-render (do đổi layout, focus, hoặc nhận status từ Gateway), núm số (knob) bị ép về Neutral ('N') trong khi `this.input.gear` vẫn đang ở `gear1`, gây lệch pha hoàn toàn giữa giao diện và model.
4. **RANGE/SPLIT sai semantics và rò rỉ timer:**
   - Phím RANGE và SPLIT sử dụng `setTimeout(() => window.app?.input?.release('range'), 60)`. Nếu ứng dụng reset hoặc pause trong khoảng 60ms này, timer cũ sẽ kích hoạt trong phiên mới, nhả nhầm input của phiên kế tiếp.
   - RANGE/SPLIT hiển thị khả dụng trong mọi trường hợp khi `mode === 'H'`, bất kể tựa game có hỗ trợ xe tải hay không (như Forza, Dirt Rally, Assetto Corsa).
   - RANGE HIGH tự ý cộng 6 vào nhãn slot (`num + 6`), đổi các nút 1–6 thành 7–12 trên giao diện khi không hề có dữ liệu telemetry hay mapping xác nhận từ game.

---

## 2. Giải pháp Kỹ thuật & Các File Thực sự Thay đổi

### 2.1. [apps/controller-web/public/src/h-shifter.js](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/apps/controller-web/public/src/h-shifter.js)
* **Tách biệt Model Chính thức và Preview:**
  * `this.gear`: Trạng thái số chính thức đã commit (`'gear1'`..`'gear6'`, `'reverse'`, hoặc `null` cho Neutral).
  * `this.committedGear`: Lưu số trước khi bắt đầu kéo để hoàn tác sạch sẽ khi cancel.
  * `this.previewGear`: Trạng thái xem trước tức thời khi drag.
  * `pointermove`: Chỉ cập nhật tọa độ hình ảnh của knob và nhãn preview; **tuyệt đối không gọi `onChange` và không thay đổi `this.input.gear`**.
  * `pointerup`: Kiểm tra tọa độ hợp lệ mới gọi `this.select(targetGear, true)`.
  * `pointercancel` / `lostpointercapture` / `cancelDrag()`: Hoàn tác knob về `this.committedGear` mà không phát callback hay frame thừa.
* **Xử lý click slot khi đang drag:**
  * Khi người dùng click trực tiếp vào nút slot trong lúc knob đang bị giữ bởi pointer khác, hệ thống hủy thao tác drag dở dang trước (`this.cancelDrag()`), giải phóng pointer capture, rồi mới commit slot được click.
* **Khắc phục kẹp biên và chuẩn hóa vùng Neutral:**
  * Hàm `point(clientX, clientY)` trả về tọa độ phần trăm thực tế (không kẹp thô).
  * Kiểm tra biên tương tác: nếu tọa độ nằm ngoài vùng `[-10%, 110%]`, hoặc rect không hợp lệ/zero, hệ thống coi là thao tác hủy, hoàn tác về `committedGear`.
  * Vùng Neutral trung tâm và thanh ngang giữa các slot có ngưỡng `threshold = 20%`. Khi núm nằm ở khoảng cách `> threshold` so với các slot (ví dụ tại `x=41%, y=50%`), hàm `nearestHSlot` trả về `null` (Neutral).
* **Đồng bộ render (`sync` & `setAvailability`):**
  * Thêm phương thức `sync(gearId)` để cập nhật vị trí knob theo model mà không kích hoạt callback.
  * Thêm `setAvailability(slotIds)`: Vô hiệu hóa các nút không khả dụng; nếu số hiện tại không còn khả dụng, tự động chuyển về Neutral nhất quán.
* **Chuẩn hóa RANGE/SPLIT:**
  * Bỏ hoàn toàn `setTimeout`. Chuyển sang gọi `input.press('range', 'h-shifter:range')` và `input.release('range', 'h-shifter:range')` (phát đúng 1 discrete pulse với source ownership rõ ràng, quản lý bằng state machine Bước 3).
  * Cả hai chiều chuyển đổi (LO → HI và HI → LO) đều phát đúng xung lệnh tương ứng cho game.
  * Thêm `updateTruckToggles(profile, capabilities)`: Chỉ hiển thị và cho phép kích hoạt RANGE/SPLIT khi profile game có group `'truck'`.
  * Giữ nguyên nhãn cơ sở `1` đến `6` và `R` trên các slot và núm knob; RANGE chỉ hiển thị trạng thái yêu cầu (`RANGE · HI (Yêu cầu)`), không tự ý đổi nhãn thành số 7–12.

### 2.2. [apps/controller-web/public/src/app.js](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/apps/controller-web/public/src/app.js)
* Truyền `{ input: this.input }` vào `HPatternShifter`.
* Trong `renderControls`: Xóa bỏ lệnh `hShifter.reset(false)`. Thay bằng `hShifter.sync(this.input.gear)` và `hShifter.updateTruckToggles(this.profile, this.capabilities)`.
* Trong `setArmed`: Cập nhật `hShifter.updateTruckToggles` khi kích hoạt hoặc tạm dừng.

### 2.3. [packages/profiles/src/input-state.js](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/packages/profiles/src/input-state.js)
* Bổ sung phương thức `setGear(gearId)`: Bảo đảm tính loại trừ lẫn nhau giữa các direct gears (xóa bỏ mọi direct gear khác khỏi `heldSources` và `held`).
* Trong `press(id)`: Tự động gọi `this.setGear(id)` nếu `id` là direct gear.
* Bổ sung helper `pulse(id, sourceId, now)`.

### 2.4. [packages/profiles/src/index.js](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/packages/profiles/src/index.js)
* Trong `supportsAction`: Kiểm tra `profile.groups`. Nếu action thuộc nhóm phụ trợ (khác `'transmission'`) mà profile không khai báo nhóm đó (ví dụ nhóm `'truck'` trong Forza), trả về `false`.

---

## 3. Kết quả 11 Regression Tests Bắt buộc (4.A — 4.K)

File kiểm thử tích hợp chuyên biệt: [tests/integration/step4-h-shifter.test.js](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/tests/integration/step4-h-shifter.test.js).

| Mã Test | Tên Test Case | Mô tả ca kiểm thử | Kết quả |
|:---|:---|:---|:---|
| **4.A** | `Commit gear1 -> render/status lại cùng cấu hình` | Chọn gear1; re-render controls. Knob, label `gear-display` và snapshot vẫn giữ nguyên gear1, không bị reset về N. | **PASS** (6.67ms) |
| **4.B** | `Drag preview qua gear2 -> cancel` | Kéo knob qua slot gear2 rồi cancel (lost capture). Không phát callback hay frame commit gear2; knob hoàn tác về gear1. | **PASS** (2.23ms) |
| **4.C** | `Pointerup vào slot hợp lệ` | Kéo và thả knob vào slot 3. Phát đúng 1 callback, commit gear3, cập nhật snapshot và xóa gear cũ. | **PASS** (1.14ms) |
| **4.D** | `Pointerup ngoài vùng hợp lệ, rect zero hoặc resize` | Nhả chuột xa ngoài stage, rect zero, hoặc resize giữa lúc drag: không gài số mép ngoài ý muốn; hoàn tác an toàn. | **PASS** (1.39ms) |
| **4.E** | `Pointer phụ, lost capture, reset và event đến muộn` | Pointer thứ 2 không cướp quyền; reset đưa về Neutral; event muộn sau reset bị bỏ qua. | **PASS** (1.37ms) |
| **4.F** | `Chọn số qua knob và control trực tiếp khác` | Knob chọn gear1, sau đó nút ngoài chọn gear2: model và snapshot duy trì tối đa đúng 1 direct gear. | **PASS** (1.18ms) |
| **4.G** | `Safety reset và đổi H sang AT/MT/MTC` | Reset đưa model/view về Neutral (0/0n); chuyển sang AT/MT xóa bỏ toàn bộ manual direct gears. | **PASS** (1.02ms) |
| **4.H** | `Gear mất availability` | Đang chọn gear6, game đổi cấu hình chỉ hỗ trợ 4 số: gear6 bị disable, model và knob tự động về Neutral nhất quán. | **PASS** (0.75ms) |
| **4.I** | `RANGE/SPLIT nhấn liên tiếp, source khớp` | Nhấn RANGE/SPLIT liên tiếp: mỗi lần toggle tạo 1 pulse; source nhả ngay, không rò rỉ timer hay tích lũy nguồn. | **PASS** (1.88ms) |
| **4.J** | `Profile không hỗ trợ truck actions` | Profile Forza (không có group truck): nút RANGE/SPLIT bị ẩn/disable; click không phát xung vào InputState. | **PASS** (2.72ms) |
| **4.K** | `Gear6 vẫn tồn tại; RANGE không đổi nhãn thành số game` | RANGE bật HI: gear6 vẫn giữ nhãn '6' trên knob, slot button và display; không tự biến thành '12'. | **PASS** (0.93ms) |

---

## 4. Trace Chi tiết Trạng thái Thao tác & Lệnh RANGE/SPLIT

### 4.1. Trace Drag Preview, Commit và Cancel
```text
[BẮT ĐẦU] Committed Gear = 'gear1', Knob tại (13, 20), Extended Bit 0 = 1.
[POINTERDOWN] PointerId = 1 tại knob. Lưu committedGear = 'gear1'. Thêm class .dragging.
[POINTERMOVE] Di chuyển tới (13, 80) [vùng slot gear2]:
              -> visualX = 13, visualY = 80 -> Knob hiển thị tại (13%, 80%).
              -> nearestHSlot(13, 80) = 'gear2'.
              -> previewGear = 'gear2'. Knob text = '2'.
              -> CRITICAL CHECK: onChange callback KHÔNG ĐƯỢC GỌI (count = 0).
              -> InputState.gear = 'gear1' (KHÔNG ĐỔI).
              -> State Frame phát qua WebSocket: Extended Bit 0 = 1 (gear1), Bit 1 = 0 (gear2 CHƯA BẬT).
[POINTERCANCEL] Sự kiện pointercancel kích hoạt:
              -> cancelDrag() được gọi.
              -> Knob giải phóng capture, xóa class .dragging.
              -> select(committedGear, false) được gọi với notify = false.
              -> Knob snap về (13%, 20%), text = '1'.
              -> onChange callback KHÔNG ĐƯỢC GỌI.
              -> InputState.gear vẫn là 'gear1'.
              -> KẾT QUẢ: Không có bất kỳ frame gear2 nào bị phát sinh ra ngoài.
```

### 4.2. Trace Lệnh RANGE / SPLIT Toggle
```text
[CLICK RANGE 1] Click nút RANGE (LO -> HI):
               -> rangeHigh = true.
               -> UI cập nhật: class .active = true, text = 'RANGE · HI (Yêu cầu)'.
               -> InputState.press('range', 'h-shifter:range') -> Enqueue pulse Id=1 (Bit 48).
               -> InputState.release('range', 'h-shifter:range') -> Giải phóng source 'h-shifter:range'.
               -> Snapshot: Extended Bit 48 = 1.

[CLICK RANGE 2] Click nút RANGE (HI -> LO):
               -> rangeHigh = false.
               -> UI cập nhật: class .active = false, text = 'RANGE · LO (Yêu cầu)'.
               -> InputState.press('range', 'h-shifter:range') -> Enqueue pulse Id=2 (Bit 48).
               -> InputState.release('range', 'h-shifter:range') -> Giải phóng source.
               -> Cả 2 chiều chuyển đổi đều phát đúng xung lệnh tương ứng.

[APP RESET]     app.reset() được gọi:
               -> hShifter.reset(false) -> rangeHigh = false, splitHigh = false.
               -> UI trở về: text = 'RANGE · LO (Yêu cầu)', class .active bị xóa.
               -> InputState.reset() dọn sạch toàn bộ pulseQueues.
               -> Snapshot sau reset: Bit 48 = 0, Bit 49 = 0. Không còn timer nào chạy ngầm.
```

---

## 5. Bảng Tổng Hợp Kiểm Thử Toàn Bộ Dự Án

| Bộ kiểm thử | Số lượng test | Kết quả thực tế | Thời lượng |
|---|---|---|---|
| **`npm test` (Unit & Mock Integration)** | **96 tests** | **96 passed / 0 failed** | **31.37s (tổng kèm e2e & safety)** |
| - Bước 1 & 1.1–1.6 (`step1-session-neutral.test.js`) | 6 tests | 6 passed | ~0.9s |
| - Bước 2 (`step2-pointer-ownership.test.js`) | 12 tests | 12 passed | ~0.04s |
| - Bước 3 & 3.1 (`step3-input-semantics.test.js`) | 15 tests | 15 passed | ~0.04s |
| - Bước 4 (`step4-h-shifter.test.js`) | 11 tests | 11 passed | ~0.03s |
| - Bước 11 (`step11-assets.test.js`) | 5 tests | 5 passed | ~0.04s |
| - Các test suites khác (protocol, safety, gateway, math...) | 47 tests | 47 passed | ~0.6s |
| **`npm run test:dotnet` (C# Bridge Unit Tests)** | **10 tests** | **10 passed / 0 failed** | **0.47s** |

---

## 6. Những Phần Chưa Hoàn Tất hoặc Chưa Kiểm Chứng

1. **Khế ước giao thức (Protocol):** Giữ nguyên tuyệt đối định dạng frame nhị phân 8 byte (State `0x11`, Extensions `0x12`/`0x13`). Không thêm gear7+ và không thay đổi action indices.
2. **Telemetry xác nhận số từ game thật:** Trạng thái số hiển thị trên giao diện là số đang yêu cầu (`requested gear`), không phải số được xác nhận từ bộ nhớ game (`confirmed gear`). Việc đồng bộ hai chiều qua telemetry plugin của từng game thuộc phạm vi Bước 6.
3. **Màn hình cảm ứng vật lý:** Toàn bộ logic đa chạm và thao tác kéo cần số đã được kiểm chứng tự động trên mock DOM harness. Cần thử nghiệm trên thiết bị di động thật để đánh giá cảm giác vuốt và độ bám ngón tay trên màn hình.

*Kết thúc Bước 4. Chưa triển khai Bước 5.*
