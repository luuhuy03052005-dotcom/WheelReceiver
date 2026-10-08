# BÁO CÁO AUDIT UI/UX TOÀN DIỆN — WHEELRECEIVER CONTROLLER WEB

**Dự án:** LAN Racing Wheel / WheelReceiver  
**Phương pháp:** Kiểm thử thực tế bằng Browser Agent trên trình duyệt thực tế, môi trường kiểm thử cô lập (Gateway Server + C# Mock Bridge qua Named Pipe).  
**Ngày thực hiện:** 2026-10-08  
**Trạng thái mã nguồn:** **Chưa sửa production code trong lượt này** (Tuân thủ chỉ dẫn: Audit & ghi nhận bằng chứng trước).  

---

## 1. Môi Trường Kiểm Thử Thực Tế & Video Ghi Hình

* **Ứng dụng chạy thực:** Cổng `http://127.0.0.1:32178` (Gateway Server + Static PWA Files).
* **Bridge Backend:** Tiến trình C# thật `Bridge.dll` chạy tham số `--mock --observe` qua Named Pipe `\\.\pipe\wheel_audit_pipe`.
* **Cơ chế xác thực:** Ghép đôi thực tế bằng mã PIN 6 số (không can thiệp sửa biến runtime).
* **Browser Session Recording:**
  - File ghi hình thao tác tự động toàn bộ phiên kiểm thử:  
    `file:///C:/Users/luuhu/.gemini/antigravity-ide/brain/8e28d8de-2acb-4168-97c6-af57fed9c478/ui_ux_audit_1791394091043.webp`

---

## 2. Bằng Chứng Hình Ảnh Qua Các Trạng Thái & Viewport

### 2.1. Trạng thái Chưa kết nối (Disconnected)
![Màn hình khởi chạy ban đầu](/C:/Users/luuhu/.gemini/antigravity-ide/brain/8e28d8de-2acb-4168-97c6-af57fed9c478/initial_load_disconnected_1791394109117.png)
* **Quan sát:**
  - Giao diện tối hiện đại, thanh trạng thái hiển thị "Cần ghép đôi", nút Bắt đầu bị disable an toàn.
  - Vô-lăng Canvas và các bàn đạp Ga / Phanh / Côn ở trạng thái trung lập (0° và 0%).
  - Console logs: **0 lỗi JavaScript** trên lần tải đầu tiên.

### 2.2. Hộp thoại Ghép đôi (Connect / Pairing Modal)
![Hộp thoại nhập PIN ghép đôi](/C:/Users/luuhu/.gemini/antigravity-ide/brain/8e28d8de-2acb-4168-97c6-af57fed9c478/connect_modal_initial_1791394152177.png)
* **Quan sát:**
  - Modal `connect-dialog` hiển thị trường nhập địa chỉ host và ô nhập mã PIN 6 số.
  - Phím đóng và nút "Ghép đôi" rõ ràng.

### 2.3. Chế độ Chỉnh sửa Bố cục (Layout Editor Mode & Palette Drawer)
![Chế độ chỉnh sửa bố cục](/C:/Users/luuhu/.gemini/antigravity-ide/brain/8e28d8de-2acb-4168-97c6-af57fed9c478/layout_editor_mode_1791394715921.png)
![Khay thêm nút chức năng](/C:/Users/luuhu/.gemini/antigravity-ide/brain/8e28d8de-2acb-4168-97c6-af57fed9c478/layout_palette_drawer_1791394804700.png)
* **Quan sát:**
  - Viền nét đứt màu xanh ngọc bao quanh khu vực chỉnh sửa (`cockpit-main`).
  - Thanh công cụ phía dưới cho phép chọn nút, phóng to (+), thu nhỏ (-), xóa và thêm nút mới từ khay palette.
  - Các module có thể kéo thả tự do để tùy biến vị trí theo sở thích người lái.

### 2.4. Bảng Cài đặt (Settings Overlay)
![Bảng cài đặt cảm giác lái và profile](/C:/Users/luuhu/.gemini/antigravity-ide/brain/8e28d8de-2acb-4168-97c6-af57fed9c478/settings_overlay_desktop_1791394937546.png)
* **Quan sát:**
  - Các thanh trượt điều chỉnh góc quay Lock-to-Lock (360°–1080°), Vùng chết (Deadzone), Độ nhạy (Curve), Trả lái (Spring), Ngưỡng ly hợp (Clutch threshold) hoạt động trơn tru.
  - Nhập/Xuất cấu hình profile file JSON sẵn sàng.

### 2.5. Viewport Điện thoại Xoay ngang (Mobile Landscape — 844 x 390 px)
![Viewport điện thoại xoay ngang](/C:/Users/luuhu/.gemini/antigravity-ide/brain/8e28d8de-2acb-4168-97c6-af57fed9c478/viewport_mobile_landscape_1791395022552.png)
* **Quan sát:**
  - Phát hiện lỗi nghiêm trọng về bố cục: Hàng nút điều khiển nhanh phía trên (`quick-controls`) tràn xuống và **che lấp trực tiếp lên khu vực Hộp số H-shifter và các thanh Bàn đạp**.

### 2.6. Viewport Điện thoại Đứng (Mobile Portrait — 390 x 844 px)
![Màn hình khóa xoay ngang](/C:/Users/luuhu/.gemini/antigravity-ide/brain/8e28d8de-2acb-4168-97c6-af57fed9c478/viewport_mobile_portrait_1791395077513.png)
* **Quan sát:**
  - Hệ thống tự động kích hoạt màn hình khóa hướng xoay ngang (*"Xoay ngang điện thoại - Giao diện lái được khóa theo chế độ ngang để thao tác ổn định"*).

---

## 3. Danh Sách Khiếm Khuyết UI/UX & Phân Loại Mức Độ

| ID Lỗi | Hạng mục | Mức độ | Hiện trạng quan sát được (Actual) | Kỳ vọng thiết kế (Expected) |
|---|---|---|---|---|
| **ISSUE-UI-01** | Hình dạng nút ảnh (`images/`) | **CRITICAL (Thẩm mỹ & UX)** | Các nút có ảnh (`Start_Stop_engine.png`, `Si_nhan_trai.png`, `Si_nhan_phai.png`, `horn.png`, `light_short.png`, `light_far.png`) đang bị **lồng vào khung nút hình chữ nhật/vuông màu đen có border cứng** (`.action-button`), làm mất hoàn toàn hình dạng cắt tự nhiên của ảnh PNG trong suốt. | Nút phải sử dụng **chính xác hình dạng viền cắt của file PNG** (cutout PNG style), loại bỏ khung hộp vuông thô cứng xung quanh; ảnh là bề mặt nút trực tiếp, trong suốt nền ngoài viền. |
| **ISSUE-UI-02** | Hiệu ứng sáng/tắt Start/Stop | **MAJOR** | Nút **Start/Stop Engine** là ảnh tĩnh 2D phẳng, không có hiệu ứng phát sáng (illumination / glow) khi động cơ bật/tắt hoặc phản hồi theo trạng thái xe. | Nút Start/Stop cần có hiệu ứng đèn nền LED (glow xanh/đỏ hoặc viền phát sáng) biểu thị trạng thái động cơ (Engine Running vs Engine Stopped). |
| **ISSUE-UI-03** | Hiệu ứng động Xi-nhan & Đèn | **MAJOR** | Các nút chức năng như Xi-nhan trái (`Si_nhan_trai.png`), Xi-nhan phải (`Si_nhan_phai.png`), Đèn cos, Đèn pha chỉ là ảnh chèn vào button; khi bấm hoặc khi bật không có animation nhấp nháy (blinking indicator) hay glow phát sáng. | Xi-nhan khi bật phải có animation nhấp nháy màu vàng/xanh neon chu kỳ ~500ms; Đèn pha/cos khi bật phải sáng rực rỡ tương ứng với trạng thái xe. |
| **ISSUE-UI-04** | Tràn & Che lấp trên Điện thoại Ngang | **HIGH** | Ở viewport điện thoại ngang (844 x 390 px), thanh nút chức năng `quick-controls` nằm cố định phía trên bị đè lên phần trên của Hộp số và Bàn đạp. | Tự động co tỉ lệ hoặc phân bổ lại vị trí (responsive grid) trên màn hình chiều cao thấp (< 420px) để các nút phụ không đè lên khu vực thao tác lái chính. |
| **ISSUE-UI-05** | Hết hạn Nonce ghép đôi | **MEDIUM** | Khi mở modal kết nối, nếu người dùng thao tác chậm hoặc gửi lại, nonce có thể bị báo *"Nonce expired or not found"* do nonce đã bị dùng. | Tự động sinh nonce mới hoặc làm mới khi người dùng mở lại dialog kết nối. |

---

## 4. Chi Tiết Kỹ Thuật Các Khiếm Khuyết Cốt Lõi

### 4.1. Vấn đề "Lồng nút vào khung hình vuông" (`ISSUE-UI-01`)
* **Nguyên nhân mã nguồn:**
  Trong `apps/controller-web/public/src/app.js`:
  ```javascript
  const imgSrc = ACTION_IMAGE_MAP[action.id];
  button.innerHTML = imgSrc ? `<img src="${imgSrc}" class="action-icon-img" alt="" aria-hidden="true" draggable="false" />` : icon;
  ```
  Và trong `apps/controller-web/public/style.css`:
  Lớp `.action-button` có các thuộc tính:
  ```css
  background: var(--bg-card); /* Nền tối hình chữ nhật */
  border: 1px solid rgba(255, 255, 255, 0.12); /* Khung viền cứng */
  border-radius: 8px; /* Bo góc chữ nhật */
  padding: 8px 12px;
  ```
  Kết quả: Một ảnh PNG tròn như `Start_Stop_engine.png` hoặc mũi tên nhọn như `Si_nhan_trai.png` bị nhét lọt thỏm vào giữa một chiếc hộp hình chữ nhật màu đen có viền thô kệch, tạo cảm giác thiếu tinh tế và không giống cụm nút điều khiển trên buồng lái xe thể thao thực thụ.

### 4.2. Vấn đề "Hiệu ứng sáng tắt & trạng thái game" (`ISSUE-UI-02` & `ISSUE-UI-03`)
* **Nguyên nhân:**
  - CSS hiện tại chỉ có trạng thái cơ bản `.layout-action.active` đổi màu nền thành gradient xanh ngọc `#00f59b` toàn bộ cái hộp chữ nhật.
  - Chưa có bộ lọc CSS `filter: drop-shadow(...)` hay `radial-gradient` chuyên biệt dành riêng cho từng ảnh icon.
  - Chưa có trạng thái nhấp nháy chu kỳ `@keyframes blinker` cho xi-nhan và đèn cảnh báo.

---

## 5. Đánh Giá Khả Năng Tiếp Cận (Accessibility & Contrast)

* **Contrast Ratio:** Tông màu nền đen carbon `#06090c` kết hợp chữ trắng bạc `#e6edf3` và điểm nhấn xanh ngọc `#00f59b` đạt chuẩn WCAG AA (> 4.5:1) ở hầu hết các văn bản chính.
* **Touch Target Size:** Các pedal và vô-lăng có diện tích tiếp xúc rất lớn, phù hợp cảm ứng; tuy nhiên các nút nhỏ trong `quick-controls` khi hiển thị trên màn hình nhỏ có khoảng cách quá hẹp dễ chạm nhầm.
* **Focus outline:** Đã có outline rõ khi chuyển sang chế độ Layout Editor (`.layout-selected`).

---

## 6. Phạm Vi Chưa Thể Kiểm Chứng Bằng Môi Trường Giả Lập (Limitations)

1. **Cảm ứng đa điểm phần cứng thực tế (Physical Multi-touch):**
   - Đã kiểm tra mô phỏng qua Viewport Emulation và con trỏ chuột độc lập.
   - Chưa thể kiểm chứng cảm giác vuốt trượt đồng thời 3 ngón tay trên mặt kính điện thoại thật (chống trễ nhiệt, mồ hôi tay, hoặc driver cảm ứng hệ điều hành iOS/Android).
2. **Dữ liệu Game Telemetry thực tế:**
   - Phiên audit sử dụng C# Mock Bridge (`--mock`). Việc nhận diện trạng thái nổ máy và đèn xi-nhan từ telemetry game (như SDK ETS2 hay Forza Data Out) thuộc phạm vi tích hợp telemetry sau Bước 6.

---

## 7. Đề Xuất Kế Hoạch Sửa Chữa (Actionable Proposals)

Khi người dùng yêu cầu triển khai sửa chữa ở lượt tiếp theo:
1. **Thiết kế lại Container cho nút ảnh (`.action-button.has-image`):**
   - Bỏ nền `background`, bỏ viền `border` và `box-shadow` chữ nhật của container khi nút mang ảnh PNG cắt viền.
   - Cho phép ảnh PNG hiển thị đúng tỉ lệ và hình dạng vốn có, sử dụng `filter: drop-shadow(0 4px 12px rgba(0,0,0,0.5))` theo đúng đường biên viền của ảnh.
2. **Bổ sung hiệu ứng LED / Glow cho Start/Stop Engine:**
   - Trạng thái chờ/tắt máy: Nút dịu, đèn viền LED đỏ nhẹ hoặc mờ.
   - Trạng thái nổ máy/bấm giữ: Bừng sáng viền LED xanh lá / cam với hiệu ứng `drop-shadow(0 0 16px #00f59b)`.
3. **Bổ sung Animation Nhấp Nháy (Blink) cho Xi-Nhan:**
   - Thêm class `.blinking-indicator` với animation nhấp nháy màu hổ phách (amber `#ffaa00`) chu kỳ 500ms khi người dùng bật xi-nhan trái hoặc phải.
4. **Sửa lỗi đè layout trên Mobile Landscape:**
   - Điều chỉnh vị trí của `quick-controls` trên màn hình có chiều cao $\le 420$px thành hàng ngang gọn gàng đặt ở cạnh trên hoặc hai bên hông của vô-lăng, tránh che khuất Hộp số và Bàn đạp.
