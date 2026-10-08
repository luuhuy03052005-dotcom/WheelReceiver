# WheelReceiver — báo cáo kiểm tra lại source và chức năng

**Commit kiểm tra:** `249a3f76fcfb19eb6ddfc88304adf4d6971462a0` trên `main`, lấy trực tiếp từ GitHub ngày 08/10/2026. Không dùng snapshot/báo cáo nghiệm thu cũ làm kết quả kiểm thử mới.

**Kết luận:** Chưa đủ điều kiện nghiệm thu. Ghép đôi thiết bị mới đang lỗi ngay trên trình duyệt. Ngoài ra đã tái hiện 9 vấn đề logic và 5 nhóm vấn đề UI/thao tác. Các mục `COMPLETE` của Bước 6, Bước 12 và phần re-trigger số AT cần được đối chiếu lại với các ca dưới đây.

Không sửa source production, không commit/push. Chỉ tạo script kiểm tra, log, ảnh và báo cáo trong `audit-results/`; bundle được build lại vào đường dẫn bị Git ignore. `git diff --stat` trống.

## 1. Kết quả thực thi và phạm vi bằng chứng

| Kiểm tra | Kết quả | Ý nghĩa và giới hạn |
|---|---|---|
| Cài dependency theo lockfile | Thành công | `npm ci --ignore-scripts --no-audit --no-fund`; không tải/chạy Electron hay driver Windows qua install script. |
| Suite nguyên bản | 110 pass / 15 fail trong lần chạy có `--test-force-exit` | 14 lỗi do môi trường không cho `os.networkInterfaces()` đọc adapter; 1 lỗi xử lý đường dẫn Windows trên Linux. Lệnh `npm test` nguyên bản bị giữ bởi handle sau lỗi môi trường và đã dừng bằng Ctrl+C. Không coi 15 lỗi này là 15 regression trên Windows. |
| Suite với shim **chỉ cho môi trường** | **124/125 pass, 1 fail**, 1.635 giây | Shim trả danh sách adapter rỗng khi API hệ điều hành bị chặn. Không thay source hoặc giả lập logic session/configuration. Các test WS dùng localhost thật; nhiều control/sink vẫn dùng mock như test của repo. |
| Build Electron bundle | Thành công | Tạo `apps/desktop/bundle.cjs` khoảng 1.5 MB; `node --check` thành công. Chưa chạy Electron/installer. |
| `npm run test:e2e-bridge` | **0 pass, 1 skipped** | Test tự bỏ qua trên Linux. Exit code 0 không phải bằng chứng IPC C# đã pass. |
| .NET / C# / driver | Chưa chạy | Môi trường không có .NET SDK và không có Windows, vJoy/ViGEmBus. Đã đọc consumer C# để đối chiếu hợp đồng; chưa xác nhận watchdog vật lý ≤150 ms. |
| Script tái hiện bổ sung | **9 vấn đề tái hiện thành công** | Đây là xác nhận hành vi lỗi; không phải 9 ca nghiệm thu an toàn đạt. Dùng class/method production, WS thật ở RT-08; clock và sink được mô phỏng khi cần. |
| UI Chromium thật | Hoàn tất, 14 kiểm tra phụ đạt và 5 nhóm lỗi | Chromium 153.0.8010.0, DOM/CSS/control thật, localhost Gateway/PipeClient thật; Bridge readiness/capability/output được mô phỏng. Có ảnh 1280×720, 844×390, 667×375, 568×320 và portrait 390×844. |

Môi trường: Linux, Node 24.19.0, npm 11.9.0. Browser dùng software rendering và font hệ thống thay cho Google Fonts; không dùng số Hz từ môi trường này để nghiệm thu hiệu năng điện thoại. Không kiểm chứng Safari/iPhone, cảm giác thao tác vật lý, USB tethering, game, SendInput hoặc virtual controller thật.

Lỗi còn fail trong suite: `RuntimeManager - full path and quotes stripping for executable`. `path.basename()` trên Linux không tách dấu `\\` của đường dẫn Windows, dẫn tới báo “Tên tiến trình phải kết thúc bằng .exe”. Đây là khác biệt nền tảng; chưa chứng minh thao tác này lỗi trên Windows. Nếu muốn CI/Linux đọc profile Windows, chuẩn hóa separator hoặc dùng `path.win32.basename()` phù hợp.

## 2. Những lỗi phải ưu tiên sửa

Mức P0: chặn luồng sử dụng chính. P1: sai tín hiệu, mất thao tác hoặc trạng thái phiên. P2: đồng bộ trạng thái/cài đặt và phản hồi giao diện.

### UI-00 — P0: ghép đôi PIN mới không hoàn tất

- **Source:** `apps/controller-web/public/src/app.js:124–131`; `public/src/settings.js`.
- **Thao tác:** mở app từ storage trống → Kết nối → nhập host và PIN hợp lệ → Ghép đôi.
- **Quan sát thật:** Gateway trả `paired` và status configured; browser ném `TypeError: settingsMgr.setPairingToken is not a function`. `authenticated=false`, Bắt đầu disabled, form giữ “Đang ghép đôi…”.
- **Nguyên nhân:** `message()` gọi `settingsMgr.setPairingToken()`, nhưng SettingsManager chỉ có `getPairingToken()`, không có setter.
- **Sửa:** phục hồi setter theo storage map từng host; chỉ chuyển authenticated sau khi lưu token thành công; xử lý lỗi lưu storage rõ ràng. Bổ sung smoke test từ storage trống qua form thật, reload và auth lại. PIN và QR deep link đều đi vào nhánh `paired` này.

Để kiểm tra tiếp, audit tạo token thử nghiệm hợp lệ qua PairingManager và lưu fixture vào storage, rồi reload để chạy nhánh **thiết bị đã ghép đôi**. Không vá phương thức thiếu trong browser và không coi pairing mới là pass.

### RT-01 — P1: mất thông báo Bridge khi một JSON line bị chia chunk

- **Source:** `apps/gateway/src/pipe-client.js:44–51`.
- **Tái hiện:** gửi cùng một line `configured` thành 2 `data` events: 0 status, `ready=false`; gửi nguyên line một lần: 1 status, `ready=true`.
- **Nguyên nhân:** `let pending=''` được khai báo bên trong từng callback, phần JSON chưa có newline bị mất khi callback kết thúc.
- **Tác động:** ngẫu nhiên không ready/configured, nút Bắt đầu bị khóa hoặc trạng thái Bridge mất cập nhật.
- **Sửa:** buffer/StringDecoder tồn tại theo socket, giữ phần dư và giới hạn tổng buffer; reset khi thay socket. Test split ở mọi vị trí, nhiều line chung chunk và UTF-8 chia chunk.

### RT-02 — P1: event socket cũ còn tác động lên kết nối mới

- **Source:** `pipe-client.js:38–55`.
- **Tái hiện:** socket cũ close → bind socket mới đang `needDrain` → socket cũ emit `drain`: queue của socket mới bị flush. `data configured` từ socket cũ cũng đổi capability của kết nối mới thành vJoy.
- **Nguyên nhân:** `close` có identity guard, còn `data`/`drain` không có.
- **Sửa:** guard socket identity và connection generation ở mọi callback; gỡ listener khi thay socket. Test late data/drain/error/close từ socket cũ sau reconnect.

### RT-03 — P1: giữ đủ edge trong queue nhưng không giữ release gap tại đầu ra

- **Source:** `pipe-client.js:80–101`.
- **Tái hiện:** press tại t=1000, release được queue tại t=1060, press tiếp theo queue tại t=1110, drain tại t=1120. Production PipeClient ghi timeline `press@1000 → release@1120 → press@1120`: gap **0 ms** thay vì yêu cầu ≥50 ms.
- **Giới hạn bằng chứng:** timeline ở Writable sink mô phỏng; chưa đo driver Windows/game. Consumer C# hiện apply các frame liên tiếp, không có bộ giữ release gap, nên source chưa bảo đảm hợp đồng ở đầu ra cuối.
- **Sửa:** bảo đảm pulse duration và gap ở consumer/scheduler có xác nhận apply. Không chỉ đếm đủ 6 edge hoặc trì hoãn producer rồi flush tất cả trong một vòng `while`.

### RT-04 — P1: pulse đã được chấp nhận có thể hết tuổi và bị bỏ im lặng

- **Source:** `pipe-client.js:89–93` và nhánh Gateway gửi ACK khi `sendFrames()` trả true.
- **Tái hiện:** pulse queue >100 ms → drain: queue rỗng, 0 write và 0 fail-safe event.
- **Tác động:** Gateway có thể đã ACK việc nhận/queue, nhưng tap không đến consumer; phiên không nhận phản hồi mất thao tác từ nhánh này. ACK hiện tại không chứng minh Bridge đã apply.
- **Sửa:** analog cũ có thể coalesce/drop theo hợp đồng; discrete action hết deadline phải có kết quả thất bại/fail-safe rõ ràng, không bỏ im lặng. Đo/giới hạn cả application queue và dữ liệu đã nằm trong stream buffer.

### RT-05 — P1: neutral reset làm client và Gateway lệch session epoch

- **Source:** `app.js:172–174`, `225–230`; `InputState.reset()`.
- **Tái hiện:** Gateway epoch 2 gửi `require_neutral` → client `reset()` tăng input/client epoch thành 3 → ACK hợp lệ epoch 2 không được tiêu thụ; pending còn lại, số gói ACK không tăng.
- **Sửa:** tách generation hủy input cục bộ khỏi epoch phiên do Gateway cấp; cập nhật authoritative epoch theo handshake. Reset pointer/pulse vẫn phải hủy input cũ. Kiểm tra tiếp luồng ACK sau reset, không chỉ kiểm tra analog về 0.

### RT-06 — P1: resume ngay tại sequence 255 làm lệch cycle ACK

- **Source:** `app.js:142–151`, `822–835`; Gateway reset `sequenceCycle=0` khi clear phiên.
- **Tái hiện:** client còn sequence 255 trước resume; chỉ reset cycle → frame đầu seq 0 được client gán cycle 1, Gateway coi frame đầu cycle 0. ACK đúng bị bỏ.
- **Sửa:** thống nhất sequence/cycle khởi tạo ở handshake resume; chỉ tăng cycle theo frame được chấp nhận ở Gateway. Test pause/resume ở từng biên 254/255/0/1 qua cả hai phía.

### RT-08 — P1: extension dị dạng vẫn có thể hạ cấp thành state-only và mở neutral gate

- **Source:** `apps/gateway/src/index.js:140`.
- **Tái hiện qua WS thật:** EXT_A seq 10 có clutch 255 → EXT_B seq 10 có reserved byte 6 = 1 → state seq 10 neutral. Gateway bỏ staging khi frame B invalid, rồi forward **8-byte standalone 0x11**, trả ACK seq 10.
- **Đối chứng:** EXT_B chỉ sai sequence bị từ chối đúng; đó là ca đã có trong test 6.I. Trường hợp reserved byte sai chưa được bảo vệ tương đương.
- **Sửa:** transaction extension đã lỗi phải được đánh dấu invalid để state liên quan không fallback legacy. Test malformed length/header/reserved bytes xen giữa A/B/state ở cả Gateway và C#.

### RT-09 — P1: ở nhịp 120 Hz, mất toàn bộ ACK >1 giây vẫn không pause

- **Source:** `app.js:773–784`.
- **Tái hiện method production với clock/socket mô phỏng:** 500 frame ở 120 Hz, 0 ACK, elapsed 4158 ms, pending = 64, app vẫn armed. Entry cũ bị evict liên tục nên oldest còn lại chỉ khoảng 525 ms, không bao giờ chạm điều kiện >1000 ms.
- **Sửa:** theo dõi deadline từ ACK hợp lệ cuối cùng hoặc mốc mất ACK độc lập với eviction của Map. Đo timeout ở 60/120 Hz, cả lúc buffer thấp và queue đầy. Không suy ra mất ACK từ pong/status vì chúng không xác nhận state.

### UI-01 — P1: control bị che hoặc cắt, preset chỉ kiểm tra tọa độ tâm

Kiểm tra bằng `getBoundingClientRect()` **và** `document.elementFromPoint()` tại tâm slot, không chỉ nhìn ảnh hoặc kiểm tra x <72%.

| Viewport | Slot không hit được tại tâm | Quan sát |
|---|---|---|
| 1280×720 | Gear 5 | Hit vào horn phía trên. |
| 844×390 | Reverse | Hit vào DIV khác; cụm pedal đè vùng R. |
| 667×375 | Gear 1, 3, 5, Reverse | Hit parkingBrake/diffLock/retarderDown hoặc DIV. |
| 568×320 | Cả 7 slot | Các nút phụ, wheel/control cạnh bên và biên cockpit che/cắt vùng thao tác. |

- **Source:** preset `layout-editor.js`, width/height/z-index trong `style.css`, layout H trong `index.html`.
- **Sửa:** dành vùng độc lập cho cần số, pedals và nút phụ; tính footprint theo kích thước control, scale và mode; kiểm tra viewport thấp/nhỏ và preset đảo tay. Không nghiệm thu bằng x của tâm nút hoặc screenshot desktop duy nhất.
- **Đối chứng:** sau khi dùng editor thật xóa nút phụ, gear1 click, preview drag, commit gear2 và thả ngoài đều hoạt động đúng ở desktop; điều này tách lỗi hitbox/layout khỏi logic cần số.

### UI-04 — P1: callback AT re-trigger 40 ms ghi đè lựa chọn mới hơn

- **Source:** `app.js:481–492`.
- **Tái hiện:** đã chọn P → chạm lại P để re-trigger → chọn D trước timer: model là D ngay sau thao tác, 40 ms sau trở lại P.
- **Bằng chứng:** synthetic PointerEvents trên DOM browser thật, handler production và timer thật. Lần native touch chạy ở tốc độ automation đã giữ D đúng; chưa khẳng định tái hiện bằng ngón tay vật lý.
- **Sửa:** hủy callback khi có selection mới/reset/mode/profile/session change; callback phải kiểm tra generation, selection và mode, không chỉ `armed`. Tốt hơn đưa retrigger về input scheduler có lifecycle chung.

### UI-03 — P2: Reset settings xóa calibration và làm range không đồng bộ

- **Source:** `app.js:730–737`; vi phạm `BR-SET-04`.
- **Tái hiện bằng nút UI thật:** calibration `{centerOffsetDeg:12,isCalibrated:true}` thành `{0,false}`; pairing được giữ đúng. Sau quick range 1080 rồi reset, profile vẫn 1080 nhưng wheel.maxHalfAngle = 450 (tương ứng 900), label được đặt 900. Bộ normalize vẫn dùng profile.range/2 = 540.
- **Sửa:** reset settings giữ calibration/pairing, cập nhật một nguồn range chuẩn cho profile/model/view/storage; reset calibration là thao tác riêng.

### UI-02 — P2: quick range đổi độ nhạy giữa phiên, chưa đồng bộ profile

- **Source:** `app.js:703–726`.
- **Tái hiện:** app đang armed, góc khoảng 90°; chạm quick range đổi 900 →1080 khi góc vẫn khoảng 86°, vẫn armed; status profile Gateway còn 900.
- **Sửa:** quy định rõ range thuộc settings hay profile, persist/apply nhất quán. Nếu đổi khi đang lái, cần transition về neutral/pause hoặc cơ chế không tạo bước nhảy của output; thêm test reload và test frame đầu sau đổi range.

### RT-07 — P2: UI suy diễn động cơ đang chạy từ trạng thái phiên

- **Source:** `app.js:206–208`, `414–460`.
- **Tái hiện:** `setArmed(true)` làm `engineRunning=true` dù chưa phát action đề máy và chưa nhận telemetry. Xi-nhan/đèn cũng đổi state theo click cục bộ.
- **Sửa:** tách driving session, requested command và game-confirmed state. Khi chưa có telemetry, hiển thị “đã yêu cầu”/feedback nhấn nút; không dùng LED như xác nhận xe đã nổ máy hoặc đèn trong game đã bật.

## 3. Các chức năng đã có bằng chứng hoạt động

| Nhóm | Đã kiểm tra | Điều kiện |
|---|---|---|
| Session/configuration | Preconditions resume, revision mismatch, serialize profile config, sticky pause, second-owner rejection, simulated focus loss | Suite của repo, production Gateway + mock/injected dependencies ở những ca tương ứng. |
| Input state | Hold nhiều nguồn, pulse queue, mode filtering AT/MT/MTC/H, reset hủy input cũ, packet clamp/sequence | Unit/integration hiện có; chưa tương đương driver/game nhận pulse. |
| Browser existing-device path | Auth token lưu sẵn, Bắt đầu khi configured, neutral handshake, ACK, Stop, save ETS2 H/vJoy, resume | Token fixture hợp lệ; Bridge capability/configured/output mô phỏng. Fresh PIN pairing thất bại như UI-00. |
| H-shifter | Commit slot, drag chỉ preview, valid release commit, thả ngoài giữ gear cũ | Browser thật, xóa nút phụ bằng editor để loại overlap; cùng với 11 ca Step 4. |
| Multitouch | Wheel + throttle + brake đồng thời, release nhả pedals | CDP dispatch touch thật trong Chromium; chưa là ba ngón tay trên điện thoại. |
| Responsive/assets | 4 kích thước landscape, rotate hint portrait, ảnh/modules nội bộ không 404 trong lượt cuối | Kết quả hit testing vẫn có UI-01. Không nghiệm thu typography/contrast/Safari chỉ từ Chrome headless. |
| Output mapping | JS route/exclusivity/default binding 0, fixtures compact vJoy | JS suite; chưa chạy C# mapper hoặc SendInput/driver Windows trong phiên này. |

## 4. Vì sao test xanh vẫn bỏ sót các lỗi trên

1. `e2e.test.js` tạo Gateway không có Bridge, nhận bất kỳ response sau resume và không assert state được apply ở output. Trong môi trường audit nó vẫn pass khi Bridge chưa sẵn sàng. Tên “Full Stack” rộng hơn bằng chứng thực tế.
2. Step 6.B tự ghi mảng `sinkEvents` từ `InputState.snapshot()` và timestamp dựng sẵn. Không chạy qua PipeClient/drain/C# virtual sink; không chứng minh release gap ở consumer khi nghẽn.
3. Step 6.L/M tự thao tác một Map cục bộ, không gọi `ControllerApp.sendStateFrame()` và không chứng minh timeout/overflow PWA. RT-09 dùng đúng method đó cho kết quả trái yêu cầu.
4. Test reconnect chưa emit callback của socket cũ sau khi socket mới được bind. Test coherence chỉ cover mismatched sequence, thiếu invalid reserved bytes.
5. Test Step 12 kiểm tra x của tâm preset và toggle local state. Không kiểm tra footprint/hit testing và không boot fresh-pair flow. Import lỗi trong test special-state còn có nhánh catch/return khiến test có thể kết thúc mà không assert module.

Nên bổ sung acceptance test theo kết quả người dùng thấy: fresh pairing → reload → configured → resume → thao tác → consumer apply → pause/reconnect. Dùng fixture trạng thái để tạo lỗi, nhưng assertion phải chạy trên logic production và quan sát đúng ranh giới cần chứng minh.

## 5. Thứ tự sửa và điều kiện nghiệm thu

1. **Ghép đôi mới:** sửa UI-00 trước; storage trống, PIN, QR, reload, PIN hết hạn và token bị revoke phải có kết quả rõ ràng.
2. **ACK/session/protocol:** RT-01, RT-02, RT-05, RT-06, RT-08, RT-09. Resume/reset/reconnect không bỏ ACK hợp lệ hoặc chấp nhận transaction extension lỗi.
3. **Pulse tại đầu ra:** RT-03/RT-04. Trace cả producer, queue và consumer, giữ duration ≥50 ms và release gap ≥50 ms theo business rules hoặc fail-safe rõ ràng khi không thể giao đúng deadline.
4. **Selection và layout:** UI-04 rồi UI-01. Chọn số mới luôn thắng timer cũ; center/edge của các slot và vùng vuốt pedal phải hit đúng control ở các viewport đã đo.
5. **Cài đặt/phản hồi:** UI-03, UI-02, RT-07. Reset settings giữ calibration; range model/view/output/storage thống nhất; UI không giả nhận telemetry.
6. **Nghiệm thu Windows/phần cứng:** chạy `npm test`, `npm run test:dotnet`, `npm run test:e2e-bridge`, bundle/installer; sau đó đo watchdog, 3 tap nhanh, Alt-Tab, mất mạng, kill Gateway/Bridge, reconnect và ít nhất một game với vJoy/XInput thực. Không coi mock mode là nghiệm thu driver.

## 6. File bằng chứng và chạy lại

- [Log suite TAP đầy đủ](sandbox:/workspace/scratch/d4c358fdeb6e/WheelReceiver-retest/audit-results/npm-test-shim-tap.log)
- [Script tái hiện logic](sandbox:/workspace/scratch/d4c358fdeb6e/WheelReceiver-retest/audit-results/reproduce.mjs) — [Kết quả JSON](sandbox:/workspace/scratch/d4c358fdeb6e/WheelReceiver-retest/audit-results/reproduction-results.json)
- [Script browser](sandbox:/workspace/scratch/d4c358fdeb6e/WheelReceiver-retest/audit-results/browser-audit.mjs) — [Kết quả JSON](sandbox:/workspace/scratch/d4c358fdeb6e/WheelReceiver-retest/audit-results/browser-results.json)
- [Lỗi pairing](sandbox:/workspace/scratch/d4c358fdeb6e/WheelReceiver-retest/audit-results/ui-pairing-failure.png)
- [UI 1280×720](sandbox:/workspace/scratch/d4c358fdeb6e/WheelReceiver-retest/audit-results/ui-ets2-h-1280x720.png), [844×390](sandbox:/workspace/scratch/d4c358fdeb6e/WheelReceiver-retest/audit-results/ui-ets2-h-844x390.png), [667×375](sandbox:/workspace/scratch/d4c358fdeb6e/WheelReceiver-retest/audit-results/ui-ets2-h-667x375.png), [568×320](sandbox:/workspace/scratch/d4c358fdeb6e/WheelReceiver-retest/audit-results/ui-ets2-h-568x320.png)
- [Log build](sandbox:/workspace/scratch/d4c358fdeb6e/WheelReceiver-retest/audit-results/build-bundle.log), [log IPC skipped](sandbox:/workspace/scratch/d4c358fdeb6e/WheelReceiver-retest/audit-results/e2e-bridge.log)

Từ root checkout:

```bash
# Linux sandbox hiện tại: shim duy nhất là bỏ qua đọc adapter bị hệ điều hành chặn.
node --import ./audit-results/network-shim.mjs --test --test-timeout=8000 --test-reporter=tap packages/*/test/*.test.js apps/*/test/*.test.js tests/**/*.test.js
node audit-results/reproduce.mjs
npm run build:bundle
node --check apps/desktop/bundle.cjs
```

Browser script tham chiếu Playwright/binary Chromium đã chuẩn bị trong môi trường audit (`/opt/codex/...` và `/tmp/wheel-chromium/`). Khi chạy ở máy khác, dùng Playwright/binary sẵn có và điều chỉnh launch path; script hiện là bằng chứng tái hiện, chưa được tích hợp thành CI portable. Các assertion của script phản ánh lỗi ở commit này; sau khi sửa cần đổi chúng thành assertion hành vi mong muốn.
