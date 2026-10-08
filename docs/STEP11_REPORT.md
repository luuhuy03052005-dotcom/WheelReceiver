# Báo Cáo Triển Khai Bước 11 — STEP11-ASSETS: Áp Dụng UI Asset Pack Theo 5 Nguyên Tắc Vàng (Prompt 11)

## 1. Phân Tích Danh Mục Ảnh Trong `images/`

Tất cả 8 ảnh trong thư mục `images/` đều được kiểm tra định dạng và alpha channel (PNG 32-bit RGBA, Color Type 6):

| Tên File | Kích Thước | Dung Lượng | Alpha Channel | Thành Phần / Action Tương Ứng | Cơ Chế Render |
|---|---|---|---|---|---|
| `Wheel.png` | 457 × 465 px | 226 KB | Có (RGBA) | `SteeringWheel` (`wheel.js`) | **Canvas 2D** (`ctx.drawImage` + `translate` + `rotate`) |
| `Si_nhan_trai.png` | 83 × 77 px | 7.8 KB | Có (RGBA) | Action `indicatorLeft` | **DOM** (`action-icon-img` / `palette-icon-img`) |
| `Si_nhan_phai.png` | 88 × 78 px | 8.2 KB | Có (RGBA) | Action `indicatorRight` | **DOM** (`action-icon-img` / `palette-icon-img`) |
| `horn.png` | 93 × 84 px | 9.3 KB | Có (RGBA) | Action `horn` | **DOM** (`action-icon-img` / `palette-icon-img`) |
| `light_short.png` | 84 × 73 px | 8.9 KB | Có (RGBA) | Action `lowBeam` (Đèn cos) | **DOM** (`action-icon-img` / `palette-icon-img`) |
| `light_far.png` | 83 × 77 px | 9.1 KB | Có (RGBA) | Action `highBeam` (Đèn pha) | **DOM** (`action-icon-img` / `palette-icon-img`) |
| `Start_Stop_engine.png`| 196 × 180 px | 54.4 KB | Có (RGBA) | Action `starter` / `ignition` | **DOM** (`action-icon-img` / `palette-icon-img`) |
| `hop_so_tuan_tu.png` | 74 × 190 px | 18.1 KB | Có (RGBA) | Cụm số tuần tự MT/MTC (`shift-buttons`) | **DOM** (`sequential-badge` giữa nút − và +) |

---

## 2. Thực Thi 5 Quy Tắc Sống Còn (Prompt 11)

### Quy tắc 1: Khởi tạo ảnh một lần duy nhất (Preloading & Zero Allocation)
- Tạo module `apps/controller-web/public/src/assets.js` với `AssetManager`:
  - `assetManager.preloadAll()` khởi tạo và nạp toàn bộ ảnh ngay khi PWA bật (`ControllerApp.constructor()`).
  - Cache lại instance `Image` và promise để tránh gọi lại.
  - Tuyệt đối **không gọi `new Image()`** hoặc gán `.src` trong vòng lặp `requestAnimationFrame`, `draw()` hay `render()`.
  - Trong `wheel.js`: `this.wheelImage` được gán 1 lần duy nhất trong constructor; hàm `draw()` chỉ gọi `ctx.drawImage(this.wheelImage, ...)`. Khi chưa tải xong hoặc môi trường không hỗ trợ, tự động fallback về vector wheel có sẵn.

### Quy tắc 2: Tách bạch hình ảnh và vùng cảm ứng (Hitbox Decoupling)
- **Vô lăng Canvas:**
  - Logic tính góc `atan2(e.clientY - centerY, e.clientX - centerX)` và unwrap góc hoạt động dựa hoàn toàn trên `canvas.getBoundingClientRect()`.
  - Kích thước canvas, DPR (Device Pixel Ratio) và hitbox chạm giữ nguyên 100% hình học toán học, không phụ thuộc vào tỉ lệ hay kích thước của file ảnh.
- **Nút bấm DOM:**
  - Toàn bộ thẻ `<img>` trang trí (`.action-icon-img`, `.palette-icon-img`, `.sequential-badge img`) được gán `pointer-events: none`, `user-select: none`, `-webkit-user-drag: none`.
  - Sự kiện pointerdown/pointerup/touch được xử lý trực tiếp bởi container `<button class="action-button">`, đảm bảo không bị chặn hay lệch hitbox ngón tay.

### Quy tắc 3: Đồng nhất kích thước ảnh cho các trạng thái (State)
- Trạng thái nhấn (`:active`, `.active`, `.layout-selected`) không đổi file ảnh hoặc hoán đổi kích thước gây reflow DOM/CPU recalculation.
- Sử dụng CSS GPU hardware-accelerated transforms và filters:
  - `transform: scale(0.92)`
  - `filter: drop-shadow(0 0 6px var(--accent))`
  - Tâm pivot và layout bounds giữ nguyên tuyệt đối, không gây dịch chuyển điểm neo.

### Quy tắc 4: Dùng đúng công cụ (Canvas cho Vô Lăng 60/120Hz, DOM cho Nút Bấm & Cần Số)
- **Vô lăng (Steering Wheel):** Vì tần số quay thực tế từ 60 đến 120 FPS, vô lăng được vẽ trên HTML5 Canvas bằng:
  ```javascript
  c.save();
  c.translate(s / 2, s / 2);
  c.rotate(this.currentAngle * Math.PI / 180);
  c.drawImage(this.wheelImage, -s / 2, -s / 2, s, s);
  c.restore();
  ```
- **Nút bấm & Hộp số tuần tự:** Sử dụng thẻ DOM `<img>` kết hợp CSS GPU compositor (`translateZ(0)`), giảm tải tối đa cho main thread.

### Quy tắc 5: Cache qua Service Worker
- Sao chép toàn bộ ảnh vào `apps/controller-web/public/images/`.
- Cấu hình route tĩnh `/images` trong `apps/gateway/src/index.js`.
- Cập nhật `apps/controller-web/public/sw.js` lên cache version `wheel-controller-v48`:
  - Đưa tất cả 8 đường dẫn ảnh `.png` vào mảng `ASSETS`.
  - Lần thứ 2 mở app, toàn bộ ảnh được móc trực tiếp từ Cache Storage / RAM thiết bị, không load lại qua LAN.

---

## 3. Các File Đã Thay Đổi / Bổ Sung

1. `apps/controller-web/public/images/*`: Thư mục chứa 8 ảnh PNG phục vụ PWA tĩnh và desktop package.
2. `apps/controller-web/public/src/assets.js`: Quản lý nạp trước và ánh xạ action sang ảnh icon.
3. `apps/controller-web/public/src/wheel.js`: Preload vô lăng 1 lần và vẽ qua Canvas `drawImage` với fallback vector.
4. `apps/controller-web/public/src/app.js`: Tích hợp `assetManager.preloadAll()`, gán icon ảnh cho primary buttons và action buttons.
5. `apps/controller-web/public/src/layout-editor.js`: Hiển thị icon ảnh trên palette chọn nút.
6. `apps/controller-web/public/index.html`: Bổ sung badge hình ảnh hộp số tuần tự `hop_so_tuan_tu.png` giữa nút `−` và `+`.
7. `apps/controller-web/public/style.css`: Quy tắc GPU styling cho `.action-icon-img`, `.palette-icon-img`, `.sequential-badge` với `pointer-events: none`.
8. `apps/controller-web/public/sw.js`: Cập nhật cache `v48` và danh sách pre-cached `ASSETS`.
9. `apps/gateway/src/index.js`: Cung cấp route tĩnh Express `/images`.
10. `tests/integration/step11-assets.test.js`: Suite kiểm thử tự động gồm 5 ca test bao quát toàn bộ 5 quy tắc.
11. `docs/FIX_STATUS.md`: Ghi nhận hoàn thành issue `STEP11-ASSETS-PRELOAD-HITBOX`.

---

## 4. Kết Quả Kiểm Thử Thực Tế

### 4.1. Unit & Integration Suite (`npm test`)
```text
✔ Step 11.1: Image Assets Integrity & PNG Verification (7.45ms)
✔ Step 11.2: Service Worker Cache Manifest contains all PNG assets (Rule 5) (0.98ms)
✔ Step 11.3: AssetManager Preload Idempotency and Zero Per-Frame Allocation (Rule 1) (2.46ms)
✔ Step 11.4: SteeringWheel Canvas Preload & Render Logic (Rule 1 & Rule 4) (11.63ms)
✔ Step 11.5: CSS Hitbox Decoupling & Pointer Immunity (Rule 2 & Rule 3) (1.22ms)
...
ℹ tests 96
ℹ pass 96
ℹ fail 0
ℹ duration_ms 1423.0873
```
- **100% PASS: 96/96 tests**, hoàn toàn không có regression từ Bước 1 đến Bước 4.

### 4.2. C# Bridge Tests (`dotnet test`)
```text
Passed!  - Failed: 0, Passed: 10, Skipped: 0, Total: 10, Duration: 339 ms - Bridge.Tests.dll (net9.0)
```

### 4.3. Desktop Bundle Build (`npm run build:bundle`)
- Thành công đóng gói `apps/desktop/bundle.cjs` (1.4 MB) trong 65 ms.
