# BÁO CÁO BƯỚC 5 — STEP5-OUTPUT-ROUTING: ĐỊNH TUYẾN ACTION, KEYBOARD BINDING VÀ MAPPING VJOY

**Dự án:** LAN Racing Wheel / WheelReceiver  
**Mã commit cơ sở:** `602ba20` (branch `main`)  
**Ngày thực hiện & kiểm thử:** 2026-10-07  
**Môi trường chạy:** Windows (PowerShell / Node.js v24.11.1 / .NET SDK 9.0)

---

## 1. Tóm tắt Hiện trạng & Các Lỗi Phát hiện Trước khi Sửa

Trước khi triển khai Bước 5, rà soát mã nguồn `RoutedGamepadAdapter.cs`, `VJoyGamepadAdapter.cs`, `NamedPipeServer.cs`, `packages/profiles/src/index.js`, `packages/protocol/src/index.js` và `app.js` ghi nhận các vấn đề nghiêm trọng:

1. **Phát đúp cả Keyboard lẫn Virtual Gamepad Button:**
   - Trong `RoutedGamepadAdapter.cs`, khi một action (ví dụ `parkingBrake` hay `camera`) có keyboard binding, `UpdateState` phát phím qua `SendKey`, nhưng đồng thời truyền nguyên vẹn đối tượng `state` sang `_output` (ViGEm hoặc vJoy).
   - Vì snapshot chứa cả primary button mask (`0x1000` cho handbrake, `0x0200` cho camera) lẫn extended bit (bit 34, bit 58), nên cả phím bàn phím lẫn nút gamepad ảo đều cùng lúc kích hoạt.
2. **Binding 0 bị ép về default key:**
   - Trong `packages/protocol/src/index.js` (`configFrames`), biểu thức `profile.keys?.[index] || defaultKey` âm thầm biến giá trị `0` (người dùng cố tình tắt phím) thành phím mặc định.
   - Trong `packages/profiles/src/index.js` (`supportsAction`), biểu thức `profile.keys[action.index] || defaultKey` cũng tương tự, khiến không thể tắt binding bàn phím để chỉ dùng virtual output.
3. **Lỗ hổng Foreground Gating (PID 0 & Cache rò rỉ):**
   - Khi `TargetPid == 0` (chưa chọn game), `RoutedGamepadAdapter` coi `focused = true` và phát phím ra bất kỳ cửa sổ nào đang active trên desktop.
   - Đổi `TargetPid` không giải phóng các phím đang nhấn dở của game trước, và không hủy cache focus cũ.
   - Lời gọi `SendInput` không kiểm tra mã lỗi trả về (`uint sent`); nếu thất bại vẫn lưu vào danh sách đang nhấn.
4. **Xung đột nút vJoy (Collision & Overwrite):**
   - Trong `VJoyGamepadAdapter.cs`, các action 60..63 (`lookLeft`, `lookRight`, `pause`, `resetVehicle`) ánh xạ vào buttons 67..70. Nhưng ngay sau đó, nhánh DPad AT gears ghi đè 4 nút `67, 68, 69, 70` bằng `park, rev, neutral, drive`, khiến 4 action trên không bao giờ hoạt động.
   - `handbrake` phát đồng thời cả Button 11 và Button 41. `camera` phát đồng thời Button 15 và Button 65.
   - Trong compact mode 8 nút, `nitro` và `camera` bị gộp bằng toán tử `||` vào nút số 4.
   - Khi chuyển mode (ví dụ từ AT sang H), các nút đang nhấn không được giải phóng, khiến số gài bị biến đổi thành nút khác ngoài ý muốn.

---

## 2. Giải pháp Kỹ thuật & Các File Thay đổi

### 2.1. [apps/bridge/Bridge/Adapters/RoutedGamepadAdapter.cs](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/apps/bridge/Bridge/Adapters/RoutedGamepadAdapter.cs)
* **Tách seam kiểm thử và kiểm tra SendInput:**
  * Bổ sung interface `IKeyboardSender` và `IForegroundProvider` cho phép inject fake provider trong kiểm thử mà không cần process Windows thật.
  * `WindowsKeyboardSender` kiểm tra chặt chẽ `SendInput == 1`. Nếu thất bại, ghi nhận mã lỗi Win32, không đánh dấu phím là đã nhấn thành công, và rate-limit log lỗi 2 giây/lần tránh spam frame.
* **Quy tắc Foreground & Quản lý vòng đời phím:**
  * `TargetPid == 0` tuyệt đối không được coi là foreground (`focused = false`).
  * Khi đổi `TargetPid`, lập tức giải phóng toàn bộ phím đang giữ (`ReleaseAllPressedKeys()`), xóa cache focus `_lastFocusCheckMs = 0; _cachedFocused = false;`.
  * Khi game mất focus (Alt-Tab), toàn bộ phím đang giữ lập tức được gửi `SendKey(key, false)`. Khi focus quay lại, không tự phục hồi phím nếu không có state mới.
  * Hai action cùng dùng chung 1 phím: phím chỉ được nhả khi cả 2 action đều đã nhả (`_desired.Contains(key)`).
* **Lọc trạng thái Virtual Output (Một Action, Một Route):**
  * Trong `UpdateState`, trước khi gọi `_output.UpdateState`, toàn bộ action có `_keys[i] != 0` đều bị xóa khỏi `filteredExtended` và xóa cả primary alias tương ứng (`0x1000`, `0x0200`, `0x0001..0x0008`). Gamepad ảo không bao giờ nhận input của action đã gán phím.

### 2.2. [apps/bridge/Bridge/Adapters/VJoyGamepadAdapter.cs](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/apps/bridge/Bridge/Adapters/VJoyGamepadAdapter.cs)
* **Loại bỏ hoàn toàn Collision vJoy 67..70:**
  * Xóa bỏ đoạn mirror DPad lên 67..70. Các action `lookLeft` (67), `lookRight` (68), `pause` (69), `resetVehicle` (70) hoạt động độc lập và toàn vẹn.
  * `park, rev, neutral, drive` duy trì duy nhất tại các nút canonical `8, 7, 10, 9`.
* **Nút Canonical cho Handbrake và Camera:**
  * `handbrake` / `parkingBrake`: duy nhất Button 11. Bỏ nút trùng 41.
  * `camera` / `cameraPrimary`: duy nhất Button 15. Bỏ nút trùng 65.
* **Tách biệt hoàn toàn Compact Mode (8 nút):**
  * Loại bỏ `nitro || camera` trên nút 4.
  * Tách mapping theo transmission mode: Mode AT (1: Handbrake, 2: Camera, 3: Nitro, 5..8: P/R/N/D); Mode MT/MTC (1: Handbrake, 2: ShiftUp, 3: ShiftDown, 4: Nitro, 5: Camera, 6: Clutch/Rev); Mode H (1..6: Gear 1..6, 7: Rev, 8: Handbrake).
  * Khi đổi transmission mode, gọi `ReleaseAllButtons()` dọn sạch output cũ trước khi áp dụng layout mới.

### 2.3. [apps/bridge/Bridge/Ipc/NamedPipeServer.cs](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/apps/bridge/Bridge/Ipc/NamedPipeServer.cs)
* Khi nhận frame `0x1f` (session reset), gọi `_adapter.ResetToNeutral()` bảo đảm toàn bộ phím bàn phím và virtual buttons được giải phóng tức thì.

### 2.4. [packages/profiles/src/index.js](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/packages/profiles/src/index.js)
* Cập nhật `ACTIONS`: `parkingBrake.vjoy = 11`, `camera.vjoy = 15`.
* Thêm resolver thống nhất `resolveActionRoute(action, profile, capabilities)`:
  * Phân biệt rõ rệt 3 trạng thái: `keyboard`, `vjoy`, `xinput` hoặc `none`.
  * Kiểm tra rõ `isExplicit`: Nếu `key === 0`, tôn trọng việc tắt phím; kiểm tra tiếp khả năng fallback sang virtual route của backend (`xinput` hoặc `vjoy`).
  * Action phụ trợ trên XInput khi tắt phím sẽ chuyển thành `none` (`unavailable`) kèm lý do rõ ràng.
* Đồng bộ `supportsAction(action, profile, capabilities)` dựa trên `resolveActionRoute`.

### 2.5. [packages/protocol/src/index.js](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/packages/protocol/src/index.js)
* Trong `configFrames`: Kiểm tra `isExplicit = profile.keys && (index in profile.keys)`. Nếu `key === 0`, gửi chính xác byte `0` qua IPC frame `0x14`, không bị fallback về `defaultKey`.

### 2.6. [apps/controller-web/public/src/app.js](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/apps/controller-web/public/src/app.js) & [h-shifter.js](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/apps/controller-web/public/src/h-shifter.js)
* Cập nhật `actionButton`: Hiển thị chính xác loại route (`Phím X`, `vJoy #Y`, `XInput` hoặc `Chưa có ánh xạ / đầu ra`).
* Cập nhật `updateBinding`: Tôn trọng binding 0 khi người dùng xem và lưu cấu hình.
* Cập nhật `updateTruckToggles`: RANGE/SPLIT kiểm tra đồng thời cả group `truck`, `supportsAction` và capability đầu ra.

---

## 3. Bảng Routing Chuẩn Hóa Theo Action, Alias và Backend

| Semantic Action | Primary Mask / Ext Index | Route khi có Keyboard Binding | Route khi tắt phím (`0`) trên XInput | Route khi tắt phím (`0`) trên vJoy 70 nút | Điều kiện Capability (ButtonCount) |
|---|---|---|---|---|---|
| `gear1` ... `gear6` | Ext 0...5 | Phím '1'...'6' | Không hỗ trợ (Mode H chỉ dùng keyboard trên XInput) | vJoy Buttons 1...6 | vJoy ButtonCount >= 6 (Mode H) |
| `reverse` | Ext 6, DPad Down | Phím '7' (Keyboard) | XInput DPad Down | vJoy Button 7 | vJoy ButtonCount >= 7 (AT / H) |
| `park` | Ext 7, DPad Up | Phím '0' (Keyboard) | XInput DPad Up | vJoy Button 8 | vJoy ButtonCount >= 8 (AT) |
| `drive` | Ext 8, DPad Right | Phím 'D' (Keyboard) | XInput DPad Right | vJoy Button 9 | vJoy ButtonCount >= 9 (AT) |
| `neutral` | Ext 9, DPad Left | Phím 'N' (Keyboard) | XInput DPad Left | vJoy Button 10 | vJoy ButtonCount >= 10 (AT) |
| `handbrake` / `parkingBrake` | Ext 34, Mask `0x1000` | Phím Space (32) | XInput Button A | vJoy Button 11 | vJoy ButtonCount >= 11 (Canonical) / 1 hoặc 8 (Compact) |
| `shiftUp` | Mask `0x2000` | — | XInput Button B | vJoy Button 12 | vJoy ButtonCount >= 12 (Canonical) / 2 (Compact MT/MTC) |
| `shiftDown` | Mask `0x4000` | — | XInput Button X | vJoy Button 13 | vJoy ButtonCount >= 13 (Canonical) / 3 (Compact MT/MTC) |
| `nitro` | Mask `0x8000` | — | XInput Button Y | vJoy Button 14 | vJoy ButtonCount >= 14 (Canonical) / 3 (AT) / 4 (MT/MTC) |
| `camera` / `cameraPrimary` | Ext 58, Mask `0x0200` | Phím '9' (57) | XInput RightShoulder (RB) | vJoy Button 15 | vJoy ButtonCount >= 15 (Canonical) / 2 (AT) / 5 (MT/MTC) |
| `clutch` / `clutchTap` | Mask `0x0100` | — | XInput LeftShoulder (LB) | vJoy Button 16 | vJoy ButtonCount >= 16 (Canonical) / 6 (Compact MTC) |
| `positionLights` ... `radio` | Ext 10...33 | Phím mặc định tương ứng | Unavailable (XInput không có nút) | vJoy Buttons 17...40 | vJoy ButtonCount >= (index + 7) từng action |
| `cruise` ... `beacon` | Ext 35...57 | Phím mặc định tương ứng | Unavailable (XInput không có nút) | vJoy Buttons 42...64 | vJoy ButtonCount >= (index + 7) từng action |
| `lookBack` | Ext 59 | Phím F1 (112) | Unavailable | vJoy Button 66 | vJoy ButtonCount >= 66 |
| `lookLeft` | Ext 60 | Phím F2 (113) | Unavailable | vJoy Button 67 | vJoy ButtonCount >= 67 |
| `lookRight` | Ext 61 | Phím F3 (114) | Unavailable | vJoy Button 68 | vJoy ButtonCount >= 68 |
| `pause` | Ext 62 | Phím Esc (27) | Unavailable | vJoy Button 69 | vJoy ButtonCount >= 69 |
| `resetVehicle` | Ext 63 | Phím 'R' (82) | Unavailable | vJoy Button 70 | vJoy ButtonCount >= 70 |

### Bảng Mapping Compact vJoy (Thiết bị 8 nút) Theo Transmission Mode

| Nút vJoy | Chế độ AT (GearMode = 1) | Chế độ MT (GearMode = 2) | Chế độ MTC (GearMode = 3) | Chế độ H (GearMode = 4) |
|---|---|---|---|---|
| **Nút 1** | Handbrake / Phanh đỗ | Handbrake / Phanh đỗ | Handbrake / Phanh đỗ | Số 1 (`gear1`) |
| **Nút 2** | Camera (`cameraPrimary`) | Lên số (`shiftUp`) | Lên số (`shiftUp`) | Số 2 (`gear2`) |
| **Nút 3** | Nitro | Về số (`shiftDown`) | Về số (`shiftDown`) | Số 3 (`gear3`) |
| **Nút 4** | *(Dự phòng / Không gán)* | Nitro | Nitro | Số 4 (`gear4`) |
| **Nút 5** | Số P (`park`) | Camera (`cameraPrimary`) | Camera (`cameraPrimary`) | Số 5 (`gear5`) |
| **Nút 6** | Số R (`reverse`) | *(Bị lọc / Không gán)* | Côn nhấn (`clutchTap`) | Số 6 (`gear6`) |
| **Nút 7** | Số N (`neutral`) | *(Dự phòng / Không gán)* | *(Dự phòng / Không gán)* | Số lùi (`reverse`) |
| **Nút 8** | Số D (`drive`) | *(Dự phòng / Không gán)* | *(Dự phòng / Không gán)* | Handbrake / Phanh đỗ |

*Ghi chú:*
- Trong MT/MTC, số lùi (`reverse`) được lọc bỏ hoàn toàn khỏi Nút 6 (không dùng chung hay chèn đè lên clutch button).
- Clutch pedal (analog axis Rx) luôn được cập nhật qua trục vJoy Rx; có trục analog không đồng nghĩa với có nút clutch button.
- Khi chuyển đổi chế độ truyền động giữa AT, MT, MTC và H trong lúc đang giữ input, adapter tự động gọi `ReleaseAllButtons()` trước khi áp dụng layout mới (`BR-MODE-03`).

---

## 4. Hướng Dẫn Gán Lại Binding Trong Game (Migration Note)

Nếu người chơi đã cấu hình vJoy Device trong game ở phiên bản trước:
1. **Thiết bị 70 nút:**
   - Các nút `lookLeft`, `lookRight`, `pause`, `resetVehicle`: Đã giải phóng khỏi bị DPad ghi đè. Gán vào vJoy Button 67, 68, 69, 70 trong game.
   - Nút `handbrake`: Gán duy nhất vào **vJoy Button 11** (trước đây có thể nhận nút 41).
   - Nút `camera`: Gán duy nhất vào **vJoy Button 15** (trước đây có thể nhận nút 65).
2. **Thiết bị Compact 8 nút (Thay đổi cũ → mới):**
   - *Cũ:* Nitro và Camera từng bị gộp OR vào nút 4. Handbrake dùng nút 11 và Camera dùng nút 15 khiến thiết bị 8 nút bị mất hoàn toàn đầu ra.
   - *Mới (cần gán lại theo mode tương ứng trong game):*
     - Mode AT: Handbrake = Nút 1, Camera = Nút 2, Nitro = Nút 3, P/R/N/D = Nút 5..8.
     - Mode MT/MTC: Handbrake = Nút 1, ShiftUp = Nút 2, ShiftDown = Nút 3, Nitro = Nút 4, Camera = Nút 5, Côn (MTC) = Nút 6.
     - Mode H: Số 1..6 = Nút 1..6, Số lùi = Nút 7, Handbrake = Nút 8.
3. **Phân biệt tính sẵn sàng của Backend và Xác nhận của Game:**
   - Cổng backend (`vjoy` / `xinput`) báo kết nối nghĩa là IPC bridge đã acquire thành công driver ảo.
   - Nhận input trong game phụ thuộc vào việc game đang ở foreground (PID đúng) và người chơi đã map đúng button/trục trong menu Control Settings của game.
4. **Không thay đổi Action Index:** Thứ tự 64 semantic actions trên giao thức 8-byte hoàn toàn giữ nguyên bất biến.

---

## 5. Trace Kiểm Chứng Hoạt Động (Sử Dụng Fake Sender & Mock Adapters)

*Ghi chú:* Các trace dưới đây thu thập từ các kịch bản test tự động sử dụng `IKeyboardSender` fake và `FakeVJoyController` / `MockGamepadAdapter` production seam nhằm kiểm chứng chính xác dòng dữ liệu mà không phụ thuộc vào trạng thái OS bên ngoài.

### 5.1. Trace Định Tuyến Độc Quyền (Một Action, Một Route)
```text
[SCENARIO 1: Handbrake gán phím Space]
InputState kích hoạt handbrake:
  -> Extended bit 34 = 1
  -> Primary button mask 0x1000 = 1
RoutedGamepadAdapter xử lý:
  -> _keys[34] = 32 (Space) != 0, PID foreground hợp lệ:
  -> SendKey(32, true) phát thành công.
  -> stateForOutput được lọc: bit 34 được xóa về 0, mask 0x1000 được xóa về 0!
  -> _output.UpdateState nhận Buttons = 0, ExtendedButtons = 0.
  -> KẾT QUẢ: Bàn phím nhận phím Space; Gamepad ảo KHÔNG nhận bất kỳ nút nào.

[SCENARIO 2: Handbrake tắt phím (binding = 0)]
RoutedGamepadAdapter xử lý:
  -> _keys[34] = 0 (unbound):
  -> Keyboard không phát phím (0 event).
  -> stateForOutput giữ nguyên bit 34 = 1 và mask 0x1000 = 1.
  -> _output.UpdateState nhận nút Handbrake ảo.
  -> KẾT QUẢ: Gamepad ảo nhận nút Handbrake; Bàn phím KHÔNG phát phím.
```

### 5.2. Trace Foreground Gating & Thu Hồi Phím
```text
[SCENARIO: Game Alt-Tab khi đang giữ còi 'H']
1. TargetPid = 1234, ForegroundPid = 1234:
   -> Horn kích hoạt: SendKey(72, true) được gửi. _pressed = { 72 }.
2. Người dùng Alt-Tab sang ứng dụng khác (ForegroundPid = 9999):
   -> Focus check phát hiện ForegroundPid != TargetPid.
   -> _desired = {}.
   -> SendKey(72, false) lập tức được gửi để nhả phím 'H'.
   -> _pressed = {}. Phím được giải phóng hoàn toàn khỏi Windows.
3. Người dùng quay lại game (ForegroundPid = 1234):
   -> Nếu tay người dùng đã nhả còi (state neutral), KHÔNG có keydown nào tự ý phát lại.
```

---

## 6. Tổng Hợp Kết Quả Kiểm Thử Thực Tế

### 6.1. Bộ test C# Bridge (`Bridge.Tests.dll`)
Lệnh: `dotnet test apps/bridge/Bridge.Tests/Bridge.Tests.csproj`
- ✔ `Step5A_ActionWithAliases_RoutesOnlyToChosenOutput` (PASS)
- ✔ `Step5B_Binding0_PreservedAndDoesNotTriggerKeyboard` (PASS)
- ✔ `Step5D_ForegroundGating_Pid0AndWrongForegroundDoNotSendKey` (PASS)
- ✔ `Step5E_Lifecycle_FocusLostAndResetReleaseKeys` (PASS)
- ✔ `Step5F_TwoActionsSharingOneKey_IndependentRelease` (PASS)
- ✔ `Step5G_SendInputFailure_DoesNotMarkSuccessAndLogsError` (PASS)
- ✔ `Step5H_VJoy_Actions60To63_Buttons67To70_NoCollisionWithDPad` (PASS)
- ✔ `Step5I_CompactMode_8Buttons_NitroAndCameraNotMerged` (PASS)
- ✔ 10/10 bài test watchdog & protocol cũ tiếp tục đạt.
**Tổng số: 18/18 tests passed.**

### 6.2. Bộ test tích hợp Node.js (`npm test`)
Lệnh: `npm test`
- ✔ `Step 5.A: Action có cả primary và extended alias định tuyến độc quyền` (PASS)
- ✔ `Step 5.B: Binding 0 được bảo toàn xuyên suốt save/reload, configFrames và IPC frames` (PASS)
- ✔ `Step 5.C: Binding chưa khai báo resolve nhất quán default theo backend` (PASS)
- ✔ `Step 5.D & 5.E: SupportsAction phản ánh đúng route và capability` (PASS)
- ✔ `Step 5.H & 5.I: vJoy Canonical mapping và Compact mode không collision` (PASS)
- ✔ `Step 5.K: RANGE/SPLIT kiểm tra đầy đủ group truck, supportsAction và capabilities` (PASS)
- ✔ `Step 5.L: Regression - H-shifter direct gears, transmission modes và pulse machine` (PASS)
- ✔ Toàn bộ các bài test Bước 1, 1.1–1.6, 2, 3, 3.1, 4, 11 và safety.
**Tổng số: 103/103 tests passed.**

---

## 7. Giới Hạn Chưa Kiểm Chứng

1. **Driver vJoy / ViGEm vật lý:** Logic routing, mapping và filtering đã được xác minh bằng unit test C# và integration test Node.js thông qua các provider và wrapper seam (`IVJoyController`, `IKeyboardSender`, `IForegroundProvider`, `IGamepadAdapter`). Việc kiểm thử với driver vJoy C++ native thật và game đang chạy trên máy cần có môi trường cài đặt phần cứng / driver tương ứng.
2. **Chưa triển khai Bước 6:** Cơ chế hàng đệm backpressure và ACK sequence wrap thuộc phạm vi Bước 6.

*Kết thúc Bước 5. Dừng trước Bước 6 theo quy định.*
