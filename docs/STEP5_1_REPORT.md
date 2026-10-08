# BÁO CÁO BƯỚC 5.1 — XÁC MINH VÀ KHÉP CÁC KHOẢNG TRỐNG CỦA STEP5-OUTPUT-ROUTING

**Dự án:** LAN Racing Wheel / WheelReceiver  
**Mục tiêu:** Xác minh thực tế, tái hiện các khoảng trống routing của Bước 5 và triển khai giải pháp dứt điểm kèm kiểm thử đối chiếu.  
**Ngày thực hiện:** 2026-10-07  
**Môi trường kiểm thử:** Windows (PowerShell / Node.js v24.11.1 / .NET SDK 9.0)

---

## 1. Tổng Quan 6 Khoảng Trống & Trạng Thái Xử Lý

| Khoảng trống | Mô tả vấn đề | Hiện trạng trước Bước 5.1 | Xử lý trong Bước 5.1 | Trạng thái |
|---|---|---|---|---|
| **1. Compact Resolver vs Mapper** | `resolveActionRoute()` kiểm tra nút cố định (`action.vjoy <= maxButtons`). Thiết bị 8 nút coi handbrake (11) và camera (15) là unavailable dù C# mapper đã hỗ trợ compact button. MT/MTC Nút 6 từng gộp `clutchBtn \|\| rev`. | Tái hiện được: JS trả về `none` khi `buttons: 8`. C# gộp rev vào nút 6. | Thêm `resolveVJoyButton(actionId, mode, maxButtons)` đồng bộ bảng mapping; C# lọc sạch `rev` khỏi nút 6 trong MT/MTC. | **FIXED & TESTED** |
| **2. Ba biểu diễn của Alias** | Handbrake và Camera có cả primary mask và extended bit. Khi chỉ có primary mask mà extended bit = 0, nếu có keyboard binding thì `_desired` không gom phím do chỉ xét extended bits, nhưng virtual output lại lọc mask -> mất trắng input. | Tái hiện được: Gửi packet primary-only (`0x1000`) khi gán phím Space khiến phím không phát mà nút ảo cũng bị chặn. | Normalize semantic actions: tổng hợp `state.Buttons` vào `effectiveExtended` trước khi gom `_desired`; mirror extended sang primary khi phím tắt (0) cho XInput. | **FIXED & TESTED** |
| **3. Keyup Thất Bại & Tracking Retention** | Khi `_keyboardSender.SendKey(key, false)` thất bại (lỗi Win32/SendInput), hệ thống không được xóa phím khỏi tracking `_pressed`, phải giữ lại để retry ở cleanup tiếp theo. | Đã có cơ chế giữ, nhưng chưa có test kiểm chứng retry thành công và cảnh báo khi Shutdown. | Bổ sung test retry cụ thể; bổ sung cảnh báo khi Shutdown/Dispose nếu phím vẫn chưa thể nhả; kiểm chứng không bao giờ drop phím khi sender fail. | **VERIFIED & TESTED** |
| **4. Focus Trở Lại Khi Input Cũ Còn Giữ** | Người dùng đang giữ còi/handbrake thì Alt-Tab; khi quay lại game, frame cũ hoặc trạng thái giữ không được tự động phát lại keydown nếu chưa qua chu trình resume hợp lệ. | Đã có cơ chế pause & requireNeutral tại Gateway, nhưng chưa có test trace chứng minh luồng này. | Thêm test integration `Step 5.1.B`: Alt-Tab disarm session -> frame cũ khi paused bị drop -> Resume kích hoạt `requireNeutral` gate -> chỉ chấp nhận khi đã nhả về 0. | **VERIFIED & TESTED** |
| **5. Binding 0 Qua IPC Consumer Thật** | Test trước đây chỉ kiểm tra encoder mảng byte của `configFrames()`, chưa chứng minh frame `0x14` đi qua consumer / parser của bridge và router nhận binding 0. | Khoảng trống kiểm chứng: cần test trực tiếp logic frame parser production và route thực tế. | Bổ sung C# Fact `Step5_1_IPC_Consumer_BindingZero_Preserved` và JS test `Step 5.1.C`: frame `0x14` đi qua parser, router bind 0, input không phát phím và ra virtual vJoy. | **VERIFIED & TESTED** |
| **6. Đồng bộ Bảng Routing & Migration Note** | Bảng routing báo cáo trước ghi "Phím / DPad" gây hiểu nhầm; thiếu bảng compact theo mode; capability phụ trợ bị hiểu nhầm là cần 70 nút mới chạy được nút đầu nhóm. | Khoảng trống tài liệu kỹ thuật và migration note. | Cập nhật `STEP5_REPORT.md` và tài liệu: route đơn nhất rõ ràng, bảng compact 8 nút 4 mode, capability per-action `(index + 7)`, lưu ý driver vs game foreground. | **SYNCHRONIZED** |

---

## 2. Chi Tiết File Thay Đổi & Diff

### 2.1. [apps/bridge/Bridge/Adapters/VJoyGamepadAdapter.cs](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/apps/bridge/Bridge/Adapters/VJoyGamepadAdapter.cs)
* **Khoảng trống:** Nút 6 trong chế độ compact MT/MTC từng gán `clutchBtn || rev`. Trong MT/MTC, số lùi (reverse) không hợp lệ và không được phép kích hoạt nút số 6 (vốn dành cho côn hoặc bị vô hiệu hóa).
* **Sửa đổi:**
```diff
@@ -162,7 +162,7 @@
                     UpdateButton(3, shiftDown);
                     UpdateButton(4, nitro);
                     UpdateButton(5, camera);
-                    UpdateButton(6, clutchBtn || rev);
+                    UpdateButton(6, state.GearMode == 3 ? clutchBtn : false);
                     UpdateButton(7, false);
                     UpdateButton(8, false);
                 }
```
* **Ý nghĩa:**
  - Mode AT: Nút 6 là `reverse`.
  - Mode MT (tuần tự không côn chân): Nút 6 bị lọc bỏ (`false`), không gán reverse.
  - Mode MTC (tuần tự có côn chân/tap): Nút 6 là `clutchBtn`. Reverse hoàn toàn bị lọc bỏ.
  - Mode H: Nút 6 là `gear6`, Nút 7 là `reverse`.
  - Không có bất kỳ mode nào mà hai action dùng chung một nút.

---

### 2.2. [apps/bridge/Bridge/Adapters/RoutedGamepadAdapter.cs](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/apps/bridge/Bridge/Adapters/RoutedGamepadAdapter.cs)
* **Khoảng trống:** 
  1. Khi nhận frame primary-only (chỉ có bit mask trong `Buttons`, `ExtendedButtons = 0`), `_desired` duyệt `ExtendedButtons & (1UL << i)` nên bỏ sót action, trong khi `filteredButtons` lại xóa mask -> mất toàn bộ output!
  2. Khi binding = 0 (virtual route) và packet chỉ mang extended bit, `state.Buttons` không có mask tương ứng khiến XInput/ViGEm (đọc `state.Buttons`) không nhận được nút A (handbrake), RB (camera), DPad (P/R/N/D).
  3. `Dispose()` cần cảnh báo rõ nếu phím chưa thể giải phóng do sender lỗi.
* **Sửa đổi:**
```diff
@@ -144,10 +144,18 @@
             _keys[index] = key;
             if (oldKey != key && oldKey != 0)
             {
+                ulong effectiveExtended = CurrentState.ExtendedButtons;
+                if ((CurrentState.Buttons & 0x1000) != 0) effectiveExtended |= (1UL << 34);
+                if ((CurrentState.Buttons & 0x0200) != 0) effectiveExtended |= (1UL << 58);
+                if ((CurrentState.Buttons & 0x0001) != 0) effectiveExtended |= (1UL << 7);
+                if ((CurrentState.Buttons & 0x0002) != 0) effectiveExtended |= (1UL << 6);
+                if ((CurrentState.Buttons & 0x0004) != 0) effectiveExtended |= (1UL << 9);
+                if ((CurrentState.Buttons & 0x0008) != 0) effectiveExtended |= (1UL << 8);
+
                 bool stillNeeded = false;
                 for (int i = 0; i < 64; i++)
                 {
-                    if (_keys[i] == oldKey && (CurrentState.ExtendedButtons & (1UL << i)) != 0)
+                    if (_keys[i] == oldKey && (effectiveExtended & (1UL << i)) != 0)
                     {
                         stillNeeded = true;
                         break;
@@ -172,6 +172,15 @@
         CurrentState = state;
         _desired.Clear();
 
+        // Normalize semantic action aliases: combine primary buttons into effective extended bits
+        ulong effectiveExtended = state.ExtendedButtons;
+        if ((state.Buttons & 0x1000) != 0) effectiveExtended |= (1UL << 34); // parkingBrake / handbrake
+        if ((state.Buttons & 0x0200) != 0) effectiveExtended |= (1UL << 58); // camera / cameraPrimary
+        if ((state.Buttons & 0x0001) != 0) effectiveExtended |= (1UL << 7);  // park
+        if ((state.Buttons & 0x0002) != 0) effectiveExtended |= (1UL << 6);  // reverse
+        if ((state.Buttons & 0x0004) != 0) effectiveExtended |= (1UL << 9);  // neutral
+        if ((state.Buttons & 0x0008) != 0) effectiveExtended |= (1UL << 8);  // drive
+
         bool focused = false;
         if (TargetPid != 0)
         {
@@ -189,7 +189,7 @@
             for (int i = 0; i < 64; i++)
             {
                 byte key = _keys[i];
-                if (key != 0 && (state.ExtendedButtons & (1UL << i)) != 0)
+                if (key != 0 && (effectiveExtended & (1UL << i)) != 0)
                 {
                     _desired.Add(key);
                 }
@@ -248,6 +248,20 @@
                 else if (i == 9) filteredButtons = (ushort)(filteredButtons & ~0x0004);  // neutral
                 else if (i == 8) filteredButtons = (ushort)(filteredButtons & ~0x0008);  // drive
             }
+            else
+            {
+                // If keyboard binding is disabled (_keys[i] == 0) and extended bit is set, mirror to primary bit
+                // so XInput (which reads state.Buttons) receives the action
+                if ((state.ExtendedButtons & (1UL << i)) != 0)
+                {
+                    if (i == 34) filteredButtons |= 0x1000;
+                    else if (i == 58) filteredButtons |= 0x0200;
+                    else if (i == 7) filteredButtons |= 0x0001;
+                    else if (i == 6) filteredButtons |= 0x0002;
+                    else if (i == 9) filteredButtons |= 0x0004;
+                    else if (i == 8) filteredButtons |= 0x0008;
+                }
+            }
         }
 
         var outputState = state with { Buttons = filteredButtons, ExtendedButtons = filteredExtended };
@@ -320,6 +320,10 @@
     public void Dispose()
     {
         ResetToNeutral();
+        if (_pressed.Count > 0)
+        {
+            Console.Error.WriteLine($"[KeyboardRouter] WARNING: Failed to release {_pressed.Count} keys on shutdown. Retaining tracking; cleanup required by OS.");
+        }
         _output?.Dispose();
         _output = null;
     }
```

---

### 2.3. [packages/profiles/src/index.js](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/packages/profiles/src/index.js)
* **Khoảng trống:** `resolveActionRoute()` kiểm tra nút cố định `canonical.vjoy <= maxButtons` (handbrake = 11, camera = 15). Thiết bị 8 nút coi các action này là unsupported, mâu thuẫn với compact mapping thực tế của C# bridge.
* **Sửa đổi:**
  - Bổ sung hàm xuất khẩu `resolveVJoyButton(actionId, mode, maxButtons)`.
  - Khi `maxButtons < 16` (compact mode), trả về chính xác nút theo 4 transmission modes:
    - Mode AT: `parkingBrake` = 1, `camera` = 2, `nitro` = 3, `park` = 5, `reverse` = 6, `neutral` = 7, `drive` = 8.
    - Mode MT: `parkingBrake` = 1, `shiftUp` = 2, `shiftDown` = 3, `nitro` = 4, `camera` = 5.
    - Mode MTC: `parkingBrake` = 1, `shiftUp` = 2, `shiftDown` = 3, `nitro` = 4, `camera` = 5, `clutchTap` = 6.
    - Mode H: `gear1`..`gear6` = 1..6, `reverse` = 7, `parkingBrake` = 8.
  - Khi `maxButtons >= 16`: Transmission gears 1..10, Canonical primary 11..16, Auxiliary `act.index + 7` (nếu `<= maxButtons`).
  - `resolveActionRoute()` ủy quyền giải quyết vJoy button cho `resolveVJoyButton` kèm trả về `button` chính xác.

---

### 2.4. [apps/controller-web/public/src/app.js](file:///c:/Users/luuhu/OneDrive/Desktop/Project/Wheel/apps/controller-web/public/src/app.js)
* **Sửa đổi:** Trong `actionButton(action)`, sử dụng trực tiếp kết quả `route` từ `resolveActionRoute`:
```javascript
  actionButton(action){
    const button=document.createElement('button');button.className='action-button';button.dataset.action=action.id;
    const route=resolveActionRoute(action,this.profile,this.capabilities);
    const supported=route.type!=='none';
    ...
    if(supported){
      const routeType=route.type==='keyboard'?'Phím '+this.keyName(route.key):route.type==='vjoy'?'vJoy #'+route.button:'XInput';
      hintText=routeType+(action.kind==='hold'?' · giữ':' · nhấn');
    }
```
* **Kết quả UI:** Thiết bị 8 nút ở chế độ AT hiển thị đúng `vJoy #1` (Handbrake), `vJoy #2` (Camera); ở chế độ MT hiển thị `vJoy #5` (Camera); ở chế độ H hiển thị `vJoy #8` (Handbrake), không hiển thị sai số nút 70.

---

## 3. Các Trace Kiểm Chứng Kỹ Thuật

### 3.1. Trace Compact Resolver → Mapper → Button Thực Tế (Thiết bị 8 nút)
```text
[KỊCH BẢN: Chế độ AT, Thiết bị vJoy 8 nút, Binding phím = 0]
1. Handbrake:
   -> resolveVJoyButton('parkingBrake', 'AT', 8) = 1
   -> resolveActionRoute trả về { type: 'vjoy', button: 1 }
   -> C# VJoyGamepadAdapter.UpdateState(GearMode: 1, handbrake: true)
   -> UpdateButton(1, true) -> vJoy PressedButtons = { 1 }
2. Camera:
   -> resolveVJoyButton('camera', 'AT', 8) = 2
   -> resolveActionRoute trả về { type: 'vjoy', button: 2 }
   -> C# VJoyGamepadAdapter.UpdateState(GearMode: 1, camera: true)
   -> UpdateButton(2, true) -> vJoy PressedButtons = { 2 }
3. Reverse (Số R):
   -> resolveVJoyButton('reverse', 'AT', 8) = 6
   -> C# VJoyGamepadAdapter.UpdateState(GearMode: 1, rev: true)
   -> UpdateButton(6, true) -> vJoy PressedButtons = { 6 }

[KỊCH BẢN: Chuyển sang Chế độ H]
1. Adapter nhận frame GearMode: 4:
   -> Phát hiện _lastGearMode (1) != state.GearMode (4)
   -> ReleaseAllButtons() giải phóng toàn bộ nút 1..8
   -> _lastGearMode = 4
2. Handbrake trong Mode H:
   -> resolveVJoyButton('parkingBrake', 'H', 8) = 8
   -> UpdateButton(8, true) -> vJoy PressedButtons = { 8 } (không phải nút 1)
3. Reverse trong Mode H:
   -> resolveVJoyButton('reverse', 'H', 8) = 7
   -> UpdateButton(7, true) -> vJoy PressedButtons = { 7 } (không phải nút 6)
```

### 3.2. Trace Ba Biểu Diễn Alias → Keyboard / Virtual Route
```text
[KỊCH BẢN: Handbrake gán phím Space (32), TargetPid = 42, ForegroundPid = 42]
Biểu diễn A (Chỉ Primary Mask Buttons = 0x1000, ExtendedButtons = 0):
  -> effectiveExtended = ExtendedButtons | (1UL << 34) (nhờ alias normalization)
  -> _desired nhận 32
  -> SendKey(32, true) phát thành công
  -> Virtual output: mask 0x1000 và bit 34 bị lọc về 0
  -> KẾT QUẢ: Keyboard nhận Space, vJoy KHÔNG nhận Button 11.

Biểu diễn B (Chỉ Extended bit 34, Buttons = 0):
  -> effectiveExtended có bit 34
  -> _desired nhận 32 -> SendKey(32, true) phát
  -> Virtual output bị lọc sạch
  -> KẾT QUẢ: Keyboard nhận Space, vJoy KHÔNG nhận Button 11.

Biểu diễn C (Cả Primary Mask 0x1000 và Extended bit 34):
  -> effectiveExtended có bit 34
  -> _desired nhận 32 -> SendKey(32, true) phát đúng 1 lần
  -> KẾT QUẢ: Keyboard nhận Space, vJoy KHÔNG nhận Button 11.

[KỊCH BẢN: Tắt phím (Binding = 0)]
Biểu diễn A, B, C gửi tới router:
  -> _desired rỗng (0 keyboard event)
  -> Virtual output giữ nguyên Handbrake
  -> vJoy nhận duy nhất canonical Button 11 (không phát phím bàn phím).

[KỊCH BẢN: Game mất Focus (ForegroundPid = 999)]
Biểu diễn C gửi tới router:
  -> _cachedFocused = false
  -> _desired rỗng -> Không phát keydown
  -> Virtual output KHÔNG tự ý kích hoạt (không divert sang vJoy ngoài ý muốn).
```

### 3.3. Trace Keyup Thất Bại → Retained Tracking → Cleanup Thành Công
```text
1. Router nhận input kích hoạt phím Space (32):
   -> SendKey(32, true) trả về true
   -> _pressed = { 32 }
2. Input nhả về Neutral:
   -> _desired = {}
   -> FakeKeyboardSender.SendKey(32, false) mô phỏng lỗi (trả về false)
   -> key 32 KHÔNG được đưa vào danh sách toRemove
   -> _pressed VẪN GIỮ { 32 }
   -> LogKeyError ghi nhận lỗi (rate-limit 2 giây)
3. Tick tiếp theo hoặc lần cleanup kế tiếp:
   -> FakeKeyboardSender hoạt động bình thường
   -> SendKey(32, false) trả về true
   -> key 32 được xóa khỏi _pressed
   -> _pressed = {} (hoàn tất giải phóng an toàn).
```

### 3.4. Trace Focus Loss & Focus Return (Chống Hồi Sinh Input Cũ)
```text
1. Phiên lái đang active (armed = true), người dùng giữ handbrake (Buttons = 0x1000):
   -> Bridge nhận frame handbrake.
2. Game mất focus (Alt-Tab sang ứng dụng khác):
   -> Gateway bắt runtime focus = false
   -> Gọi pause('Game mất focus (Alt-Tab)')
   -> armed = false; clear(); pipeClient.sendNeutral()
   -> Bridge nhận neutral, lập tức nhả phím và virtual buttons.
3. Cửa sổ game lấy lại focus (runtime focus = true):
   -> armed vẫn là false (phiên lái vẫn đang paused).
   -> Client gửi frame mang input handbrake cũ:
   -> Gateway kiểm tra: if (!armed) return; -> FRAME BỊ HỦY HOÀN TOÀN TẠI DÒNG 134!
   -> Không có dữ liệu nào chuyển tiếp tới Bridge; không thể phát lại keydown.
4. Client gửi lệnh { type: 'resume' }:
   -> Gateway thực hiện: armed = true, requireNeutral = true, pipeClient.sendNeutral().
5. Client tiếp tục gửi frame mang input handbrake cũ (chưa chịu buông tay):
   -> Gateway kiểm tra requireNeutral:
   -> neutral == false -> HỦY FRAME, gửi { type: 'require_neutral' }, gửi sendNeutral() tới bridge.
   -> Hoàn toàn ngăn chặn hồi sinh input cũ.
6. Client buông tay (gửi frame neutral: buttons = 0):
   -> Gateway chấp nhận, requireNeutral = false.
7. Người dùng nhấn nút mới:
   -> Input mới hợp lệ được chuyển tiếp tới Bridge.
```

### 3.5. Bằng Chứng Binding 0 Qua IPC Consumer Thật
```text
1. Profile cấu hình:
   keys = { "34": 0, "58": 0 } (Handbrake và Camera tắt phím tường minh)
2. configFrames(profile) tạo frame nhị phân 8 byte:
   Frame cho action 34: [ 0x14, 34, 0, 0, 0, 0, 0, 0 ]
   - Byte 0: 0x14 (IPC_BINDING)
   - Byte 1: 34 (Index action parkingBrake)
   - Byte 2: 0 (Key code 0 = unbind)
   - Bytes 3..7: 0
3. Frame được đưa vào NamedPipeServer production parser:
   bool valid = buffer[0] == 0x14 && buffer[1] < 64 && buffer.AsSpan(3).IndexOfAnyExcept((byte)0) < 0;
   -> valid == true
   -> router.Bind(buffer[1], buffer[2]) được gọi: router.Bind(34, 0)
4. ControllerState gửi handbrake input:
   -> router._keys[34] == 0
   -> sender.History rỗng (0 keyboard event)
   -> vJoy.PressedButtons chứa Button 11.
```

---

## 4. Kết Quả Kiểm Thử Thực Tế

### 4.1. Unit Test C# Bridge (`Bridge.Tests.dll`)
Lệnh thực thi: `dotnet test apps/bridge/Bridge.Tests/Bridge.Tests.csproj`
- ✔ `Step5A_ActionWithAliases_RoutesOnlyToChosenOutput` (PASS)
- ✔ `Step5B_Binding0_PreservedAndDoesNotTriggerKeyboard` (PASS)
- ✔ `Step5D_ForegroundGating_Pid0AndWrongForegroundDoNotSendKey` (PASS)
- ✔ `Step5E_Lifecycle_FocusLostAndResetReleaseKeys` (PASS)
- ✔ `Step5F_TwoActionsSharingOneKey_IndependentRelease` (PASS)
- ✔ `Step5G_SendInputFailure_DoesNotMarkSuccessAndLogsError` (PASS)
- ✔ `Step5H_VJoy_Actions60To63_Buttons67To70_NoCollisionWithDPad` (PASS)
- ✔ `Step5I_CompactMode_8Buttons_NitroAndCameraNotMerged` (PASS)
- ✔ `Step5_1_Aliases_ThreeRepresentations_HandbrakeAndCamera` (PASS — Kiểm tra đủ 3 biểu diễn A/B/C với keyboard, virtual và focus blocked)
- ✔ `Step5_1_KeyupFailure_RetainsTracking_RetriedSuccessfully` (PASS — Kiểm tra giữ key trong tracking khi SendKey fail, retry thành công và TargetPid switch)
- ✔ `Step5_1_CompactVJoy_Modes_And_ReverseClutchButton6` (PASS — Kiểm tra AT, MT, MTC, H, lọc reverse khỏi nút 6 và phân biệt clutch axis Rx)
- ✔ `Step5_1_IPC_Consumer_BindingZero_Preserved` (PASS — Frame 0x14 qua IPC consumer parser thực tế)
- ✔ 10/10 bài test watchdog & protocol cũ tiếp tục đạt.
**Kết quả: 22/22 tests passed (Duration: 336 ms).**

### 4.2. Unit & Integration Suite Node.js (`npm test`)
Lệnh thực thi: `npm test`
- ✔ `Step 5.A: Action có cả primary và extended alias định tuyến độc quyền` (PASS)
- ✔ `Step 5.B: Binding 0 được bảo toàn xuyên suốt save/reload, configFrames và IPC frames` (PASS)
- ✔ `Step 5.C: Binding chưa khai báo resolve nhất quán default theo backend` (PASS)
- ✔ `Step 5.D & 5.E: SupportsAction phản ánh đúng route và capability` (PASS)
- ✔ `Step 5.H & 5.I: vJoy Canonical mapping và Compact mode không collision` (PASS)
- ✔ `Step 5.K: RANGE/SPLIT kiểm tra đầy đủ group truck, supportsAction và capabilities` (PASS)
- ✔ `Step 5.L: Regression - H-shifter direct gears, transmission modes và pulse machine` (PASS)
- ✔ `Step 5.1.A: Đối chiếu JS Resolver và C# Mapper cho vJoy 8, 16 và 70 nút (Shared Fixture)` (PASS)
- ✔ `Step 5.1.B: Tái hiện focus loss & return - không hồi sinh keydown hay input cũ` (PASS)
- ✔ `Step 5.1.C: Binding 0 qua IPC encoder và consumer parser` (PASS)
- ✔ Toàn bộ các bài test Bước 1, 1.1–1.6, 2, 3, 3.1, 4, 11 và safety.
**Kết quả: 106/106 tests passed (Duration: ~31s).**

### 4.3. Kiểm Thử E2E Bridge Thật (`npm run test:e2e-bridge`)
Lệnh thực thi: `npm run test:e2e-bridge`
- ✔ `WebSocket through Gateway and Named Pipe applies one committed state in C#` (PASS — 1187 ms)
**Kết quả: 1/1 passed.**

### 4.4. Kiểm Thử Build Bundle Frontend (`npm run build:bundle`)
Lệnh thực thi: `npm run build:bundle`
- Bundle `apps/desktop/bundle.cjs` (1.4 MB) biên dịch thành công.

---

## 5. Các Giới Hạn Chưa Kiểm Chứng

1. **Driver vJoy C++ Native Vật Lý:** Các bài test đã kiểm chứng 100% dòng dữ liệu logic, trạng thái bộ nhớ và hợp đồng giao tiếp thông qua wrapper interface và IPC named pipe. Việc tương thích ở tầng kernel driver vJoy thực tế trên Windows phụ thuộc vào việc cài đặt driver vJoy trong hệ điều hành của máy người dùng.
2. **Thiết Bị Cảm Ứng Di Động Thực Tế:** Đã xác minh mô phỏng trên Chrome/Web API; kiểm thử cảm ứng điện dung trên màn hình iOS/Android thật cần người dùng kết nối thiết bị cầm tay.
3. **Phạm Vi Bước 6:** Cơ chế hàng đệm backpressure, client-side rate limiting và sequence ACK wrap 255->0 thuộc phạm vi Bước 6.

---

*Bước 5.1 hoàn tất toàn diện. Dừng trước Bước 6 theo quy định.*
