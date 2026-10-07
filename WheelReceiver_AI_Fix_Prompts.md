# WheelReceiver — Bộ instruction sửa lỗi theo từng bước

Repository: https://github.com/luuhuy03052005-dotcom/WheelReceiver.git

Snapshot tham chiếu của audit: `f71ce3b50439db2e0f618671efaba7b0db3c616c`. Đây là danh sách vấn đề để tái kiểm tra, không phải khẳng định mọi vấn đề vẫn tồn tại trên một commit mới hơn.

## Cách dùng

1. Mở repository trong AI coding agent có quyền đọc, sửa file và chạy lệnh.
2. Dán **Prompt 0** một lần để đặt quy tắc và lấy baseline.
3. Dán **Prompt 1**, cho AI triển khai và báo bằng chứng. Sau đó dùng lần lượt các prompt tiếp theo.
4. Mỗi lần chỉ xử lý một bước. Bước chưa đạt thì dùng prompt sửa tiếp ở cuối tài liệu, không chuyển sang làm đẹp giao diện để né lỗi logic.
5. Nếu đổi sang phiên AI mới, dán lại Prompt 0 cùng `docs/FIX_STATUS.md` hiện tại và prompt của bước đang làm.

Thứ tự này giúp sửa luồng điều khiển trước khi thay cách vẽ. Không cần thay ứng dụng sang React hay viết lại toàn bộ để áp dụng UI pack.

| Bước | Phạm vi | Điều kiện chính để chuyển bước |
|---|---|---|
| 0 | Baseline, import graph, hợp đồng sửa lỗi | Có commit, kết quả chạy thật và danh sách vấn đề còn tồn tại |
| 1 | Ready/configuration/resume/neutral | Không thể lái khi bridge hoặc profile chưa sẵn sàng; không phát lại input cũ |
| 2 | Pointer ownership và reset | Một pointer sở hữu một control; reset chặn mọi drag cũ |
| 3 | Hold/pulse/mode và nhiều nguồn input | Không kẹt, không mất tap, không xuất action sai mode |
| 4 | H-shifter và trạng thái số | Cancel không chọn số; view và input đồng nhất |
| 5 | Routing keyboard/XInput/vJoy | Một action không kích hoạt hai đường; vJoy không ghi đè nút |
| 6 | Packet, queue, ACK, watchdog | Không ghép số loại trừ nhau; frame cũ không giữ watchdog sống |
| 7 | Range/calibration/reset/profile | Đổi cấu hình không làm nhảy output; reset đúng phạm vi |
| 8 | Layout editor | Đa chạm, cancel, drop, lưu/load và scale đúng |
| 9 | Cảm giác thao tác wheel/pedal | Không nhảy góc gần tâm hoặc tăng ga mạnh khi vừa chạm |
| 10 | Catalogue, trạng thái, pairing và khả dụng | UI phản ánh đúng khả năng điều khiển và đường phục hồi lỗi |
| 11 | Áp UI pack vào lớp render | Asset khớp trạng thái và hình học; toàn bộ logic trước đó vẫn đạt |
| 12 | Kiểm thử luồng thật và bản đóng gói | Bằng chứng từ browser, Windows và game được phân biệt rõ |

## Prompt 0 — Instruction chung và baseline

```text
Bạn là kỹ sư sửa lỗi cho repository WheelReceiver:
https://github.com/luuhuy03052005-dotcom/WheelReceiver.git

Mục tiêu: sửa các lỗi logic, thao tác và UI/UX theo từng bước có kiểm chứng. Thực hiện công việc trong checkout hiện tại; không chỉ trả lời kế hoạch. Các vấn đề từ audit tại commit f71ce3b50439db2e0f618671efaba7b0db3c616c là ca cần tái hiện, không được mặc nhiên coi bản mới vẫn có lỗi.

Quy tắc áp dụng cho tất cả các bước:
1. Đọc AGENTS.md và các tài liệu liên quan trong docs; kiểm tra git status, branch, HEAD và thay đổi chưa commit. Giữ nguyên thay đổi của người dùng. Không tự push, merge hoặc deploy. Không yêu cầu xác nhận lại cho việc đọc, sửa và kiểm thử nằm trong phạm vi bước được giao.
2. Xác định code thực sự được import. PWA hiện dùng HTML/CSS/JavaScript/Canvas. Không chuyển framework hoặc viết lại giao diện để sửa một lỗi. Không sửa transmission.js/hud-layout.js như thể chúng đang chạy nếu chưa chứng minh import graph.
3. Giữ protocol controller v1: frame đúng 8 byte; 0x11 là state, 0x12/0x13 là extension; little-endian; sequence modulo 256. 0x14/0x15/0x1f chỉ dùng IPC tin cậy, phải bị từ chối từ WebSocket controller. Giữ action ID/index và mapping đã công bố; migration phải rõ ràng nếu có xung đột cần sửa.
4. Pairing bắt buộc, tối đa một controller owner, phiên mới/reconnect về neutral. C# watchdog độc lập phải đưa output về neutral trong giới hạn 150 ms khi mất input hợp lệ. Không tăng timeout để làm test xanh.
5. Analog dùng trạng thái mới nhất. Hold có vòng đời press/release. Pulse là các cạnh có thứ tự, không được gộp bằng OR rồi coi là đã xử lý từng lần nhấn. Gear loại trừ nhau không được xuất đồng thời.
6. Một pointer sở hữu một control. Pause, disconnect, đổi mode, mở editor, background và thay đổi hình học phải hủy tương tác cũ. Resume không được tiếp tục drag từ trước pause. Không đưa input 60–120 Hz qua việc dựng lại toàn bộ DOM.
7. Bảo toàn nghĩa bốn mode đang triển khai: AT = tự động; MT = tuần tự không côn; MTC = tuần tự có côn; H = chọn số trực tiếp có côn. Tài liệu cũ có chỗ nói MT có côn; ghi nhận và đồng bộ tài liệu thay vì âm thầm xóa MTC hoặc đổi hành vi hiện tại.
8. Không tạo telemetry giả. Nhãn số/pedal/wheel là input yêu cầu của controller nếu chưa có phản hồi từ game. Không gọi ACK của Gateway là game đã nhận hoặc bridge đã áp dụng khi không có bằng chứng.
9. Với mỗi lỗi: tái hiện hành vi sai -> thêm kiểm thử hành vi có ý nghĩa -> sửa nguyên nhân -> kiểm thử trước/sau. Không kiểm tra bằng regex source, xóa assertion, bỏ test hoặc hardcode kết quả để vượt kiểm thử. Mock phải gọi logic production thật và được ghi rõ là mock.
10. Mỗi prompt là một phạm vi sửa. Có thể sửa các file phụ thuộc trực tiếp để hoàn tất luồng, nhưng không trộn refactor không liên quan. Tiếp tục xử lý lỗi trong phạm vi đến khi kiểm thử đạt; kết thúc bằng báo cáo, không tự bắt đầu prompt kế tiếp.
11. Không nhận “đã fix toàn bộ” chỉ từ unit test. Nếu thiếu browser, .NET, Windows, driver hoặc điện thoại, ghi đúng kiểm tra chưa chạy và tiếp tục phần có thể làm. Không tuyên bố đã chạy thao tác/game bằng suy đoán.

Bây giờ thực hiện baseline, chưa thay đổi hành vi production:
- Ghi HEAD, active import graph và đường input: PWA -> WebSocket -> Gateway -> PipeClient -> C# -> output backend/keyboard.
- Đọc package.json, lockfile và script test hiện có. Cài dependency theo công cụ/lockfile của repo nếu môi trường cho phép. Chạy npm test; npm run test:dotnet; npm run test:e2e-bridge khi đủ điều kiện. Lệnh không chạy được phải ghi nguyên nhân, không coi là PASS.
- Đối chiếu các ca ở bước 1–12 với source hiện tại; vấn đề đã sửa thì ghi bằng chứng và không sửa lại.
- Tạo docs/FIX_PLAN.md và docs/FIX_STATUS.md. Mỗi issue có ID, ca tái hiện, file/luồng liên quan, bước phụ trách và trạng thái: NOT STARTED / IN PROGRESS / BLOCKED / PARTIALLY VERIFIED / COMPLETE.
- Có thể thêm harness tái hiện tối thiểu cho lỗi ưu tiên; không đưa hàng loạt test đỏ chưa sửa vào suite mặc định rồi báo dự án đạt.

Kết thúc bằng: commit baseline; những test đã chạy/kết quả thật; tài liệu tạo; các xung đột giữa docs và source; vấn đề cần xử lý đầu tiên. Không cần chờ người dùng duyệt một kế hoạch mới.

Mẫu báo cáo bắt buộc ở cuối mọi bước:
- Mục tiêu và issue ID đã xử lý.
- File thay đổi và lý do.
- Ca trước sửa -> hành vi sau sửa.
- Lệnh kiểm thử, kết quả; phân biệt unit/mock/browser/Windows/game.
- Protocol/action mapping/dữ liệu lưu có thay đổi không; migration nếu có.
- Vấn đề còn lại và trạng thái trong FIX_STATUS.md.
```

## Prompt 1 — Chặn resume sai và phát lại input cũ

```text
Áp dụng instruction chung. Thực hiện bước 1: sửa trọn luồng session, configuration và neutral trước khi cho lái.

Đọc trước:
- apps/gateway/src/index.js, runtime.js, pipe-client.js
- apps/controller-web/public/src/app.js
- C# Program.cs, NamedPipeServer.cs và đường xử lý configured
- các test gateway/integration liên quan.

Ca cần kiểm tra từ audit:
- Gateway nhận resume dù bridge disconnected/not ready, configured=false hoặc revision yêu cầu không khớp; vẫn armed=true và trả resumed.
- Khi nhận require_neutral, PWA phát frame zero trong khi control cũ còn giữ. Frame tiếp theo có thể lại throttle=255.
- configure có thể bị gọi hai lần qua event profile và handler profile; ACK configured chậm có thể bị gán cho stagingRevision mới.

Triển khai:
1. Mô hình hóa trạng thái session với các điều kiện chuyển rõ ràng: authenticated, configuring/not-ready, paused/await-neutral, driving. Có thể dùng cấu trúc hiện tại, không cần thêm framework.
2. Chỉ nhận resume khi owner hợp lệ, pipe connected/ready, profile đã áp dụng đúng revision và không còn cấu hình đang chờ. Revision cũ phải bị từ chối với lý do có thể hiển thị; không trả resumed thành công sớm.
3. Chống race configuration: một ACK phải tương ứng đúng cấu hình và đúng lần kết nối. Serialize/correlate các yêu cầu bằng cơ chế thực sự tồn tại; nếu cần đổi IPC nội bộ, sửa đồng bộ producer/consumer và test, giữ controller protocol 8 byte. Không giải quyết bằng cách gán mọi ACK cho revision hiện tại.
4. Khi pause, mất focus game, mất bridge, disconnect/reconnect hoặc profile đổi: neutralize output, clear pending input và vô hiệu mọi tương tác cũ. Focus quay lại không tự khôi phục input đang giữ.
5. require_neutral phải dẫn tới reset lifecycle và yêu cầu release/new pointerdown thích hợp. Không dùng một frame zero giả để vượt điều kiện rồi tiếp tục control cũ. Frame neutral sau reset hợp lệ vẫn được phép gửi.
6. PWA chỉ hiển thị và nhận input Driving sau handshake hợp lệ. Arm button phải phản ánh điều kiện thiếu và lý do.

Kiểm thử: resume với disconnected, ready=false, configured=false, revision sai; hai profile đổi nhanh và configured đến muộn; reconnect khi đang giữ ga; alt-tab khi đang giữ nút; require_neutral khi ga=1. Chứng minh không phát lại input cũ sau resume nếu chưa có thao tác mới. Một controller thứ hai không được takeover.

Done: các ca trên đạt, pairing và protocol golden tests không regression. Cập nhật FIX_STATUS.md và báo cáo theo mẫu. Chưa đổi skin/layout.
```

## Prompt 2 — Quyền sở hữu pointer và reset tập trung

```text
Áp dụng instruction chung. Thực hiện bước 2: làm đúng vòng đời thao tác cho mọi control.

Phạm vi chính: public/src/app.js, wheel.js, pedals.js, h-shifter.js, layout-editor.js, viewport-lock.js và các control bindButton đang chạy. Chỉ đụng file phụ thuộc trực tiếp.

Ca cần tái hiện:
- Wheel enabled=false vẫn nhận pointerdown/drag và đổi góc.
- H-shifter có thể bị pointer thứ hai chiếm; reset/disable không kết thúc ownership, pointermove cũ đổi số sau resume.
- Một pointer khác có thể di chuyển hoặc kết thúc drag trong layout editor.
- Reset dùng xóa class .active toàn cục, làm sai trạng thái toggle/selection.

Triển khai một hợp đồng thống nhất:
- pointerdown chỉ nhận khi control và trạng thái ứng dụng cho phép; ignore nếu đang có owner khác.
- pointermove/up/cancel/lostpointercapture chỉ xử lý đúng pointerId sở hữu control.
- Chỉ pointerup hợp lệ mới commit thao tác cần commit. Cancel/lost capture là hủy, không dùng tọa độ cuối để chọn số/thêm nút.
- Reset phải giải phóng capture, pointerId, drag geometry, giá trị hold và dữ liệu tạm. Callback đến muộn không được làm sống lại thao tác cũ. Xử lý lostpointercapture do chính release tạo ra theo cách idempotent.
- Tập trung điều phối reset cho pause, mở settings/editor, đổi mode/profile, disconnect, visibility/pagehide và đổi orientation/kích thước khi đang drag.
- Thay đổi hình học phải cancel hoặc remap có quy tắc; không tiếp tục dùng rect cũ.
- Render trạng thái của từng component từ state của component. Không quét xóa mọi .active trên trang.

Kiểm thử đa chạm thật sự theo chuỗi event: hai pointer trên một control; wheel + throttle + brake đồng thời; pointer phụ up không kết thúc owner; cancel và lost capture; disable trong lúc giữ; pause -> resume -> move cũ; resize/orientation giữa drag. Assert cả input state, ownership và class của đúng control.

Done: không thao tác nào tồn tại qua reset, nhưng multitouch giữa các control độc lập vẫn hoạt động. Không sửa cảm giác pedal/wheel hoặc skin ở bước này.
```

## Prompt 3 — Hold, pulse, mode và nhiều nguồn input

```text
Áp dụng instruction chung. Thực hiện bước 3: chuẩn hóa semantic input và delivery của các lần nhấn.

Đọc packages/profiles/src/input-state.js, index.js, public/src/app.js và đường snapshot/ACK. Giữ nguyên action ID/index.

Các lỗi cần tái hiện:
- Hai nút cùng action: release nút thứ nhất xóa held dù nút thứ hai còn giữ.
- Action có kind=pulse vẫn giữ bit sau khi nhấn lâu một giây.
- Hai tap shift nhanh xuất hai snapshot cùng bit mà không có release giữa chúng; không thể phân biệt hai cạnh.
- App không áp dụng InputState.setMode; AT vẫn có thể xuất SHIFT_UP/SHIFT_DOWN từ đường khác.

Triển khai:
1. Track input theo source/owner riêng, ví dụ control instance + pointer hoặc keyboard key. Một nguồn release chỉ xóa nguồn đó; touch và keyboard không dẫm trạng thái nhau.
2. Phân biệt hold, pulse và selection loại trừ nhau. Pulse được tạo một lần trên press mới; giữ lâu không tự repeat nếu action không khai báo repeat. Tuân thủ thời gian pulse tối thiểu 50 ms và có release quan sát được giữa hai pulse cùng action. Thời gian/latching phải tính ở nơi có thể chứng minh delivery, không chỉ ở CSS.
3. Queue pulse có thứ tự và giới hạn; ACK phải xác định đúng sự kiện/snapshot được xác nhận. Không xóa tap mới bằng ACK cũ. Phần PipeClient delivery sẽ được kiểm tra sâu ở bước 6; không khẳng định game nhận tap từ Gateway ACK.
4. Áp dụng mode filter ở nơi tạo snapshot cuối cùng, không chỉ ẩn nút. AT chặn clutch/shift/direct H; MT có shift, không côn/direct H; MTC có shift+côn; H có direct gear+côn. Quy tắc action phụ thuộc game phải dựa trên catalogue/profile.
5. Đổi mode phải neutralize và clear các state/pulse không còn hợp lệ. Class pressed phản ánh physical hold hoặc pulse đang hiển thị theo quy tắc rõ ràng.

Test: hai control cùng horn/handbrake; keyboard + touch; hai tap dưới một chu kỳ gửi; giữ shift 1 giây; ACK chậm/trùng; đổi MTC/H sang AT khi giữ côn/shift; tất cả mode qua mọi nguồn input. Không chỉ assert button bị hidden.

Done: không mất hold của nguồn khác, không kẹt pulse, không phát action sai mode; cập nhật business rules cho bốn mode hiện tại.
```

## Prompt 4 — H-shifter: cancel, số loại trừ và render nhất quán

```text
Áp dụng instruction chung. Thực hiện bước 4 trên H-shifter đang được import, không sửa module transmission cũ thay cho luồng thật.

Phạm vi: public/src/h-shifter.js, app.js, InputState và markup/style liên quan trực tiếp.

Ca audit: renderControls reset knob về N nhưng InputState vẫn gear1; pointercancel có thể chọn gear1; rangeHigh/split state khác class hiển thị sau reset; nhãn gear+6 bị hiểu như số game đã vào.

Yêu cầu:
- Chỉ một source of truth cho gear đang yêu cầu. Render lại vì status/capabilities không được âm thầm reset view riêng hoặc giữ input riêng. Nếu một transition cần neutral, cập nhật model và view cùng lúc.
- Dùng ownership/reset từ bước 2. Cancel không commit số mới. Việc giữ hay về N khi hủy phải có chính sách rõ: giữ selection đã commit nếu chỉ hủy drag mới; safety reset đưa toàn bộ input về neutral.
- Snapshot không bao giờ có đồng thời hai direct gear. Giữ đúng tập gear đang được protocol/action catalogue hỗ trợ; không tự thêm gear7+ để hợp hình minh họa.
- Mapping slot dùng hệ tọa độ nhất quán sau scale/resize. Chọn số cần thao tác xác định; không lấy tọa độ cancel để snap vào số. Không bắt buộc mô phỏng hộp số vật lý mới nếu ngoài phạm vi.
- Range/split chỉ xuất khi profile/backend có route hợp lệ. UI hiển thị trạng thái yêu cầu, không tuyên bố game đã nhận range hoặc đang ở gear7–12 khi không có telemetry.
- Re-render, mode switch và profile switch xử lý selection/toggle theo một chính sách thống nhất. Class và label derive từ state.

Test: gear1 rồi status re-render; cancel khi hover gear2; two-pointer; disable/resume; từng slot ở scale/kích thước khác nhau; các toggle theo Forza/ETS2/generic và capability thiếu. Assert knob, label và snapshot cùng trạng thái.

Done: H-shifter không commit từ cancel, không bị render làm lệch số, không hiển thị số xe giả.
```

## Prompt 5 — Một action, một route; sửa mapping vJoy và keyboard

```text
Áp dụng instruction chung. Thực hiện bước 5: sửa output routing xuyên profile -> IPC -> C# adapter.

Đọc packages/profiles/src/index.js, packages/protocol/src/index.js, Gateway configuration, RoutedGamepadAdapter.cs, VJoyGamepadAdapter.cs, ViGEmGamepadAdapter.cs và tests C#.

Ca cần kiểm tra:
- Camera/handbrake/horn có keyboard binding nhưng full state vẫn được forward tới virtual backend: một thao tác có thể tạo cả keyboard và gamepad/vJoy.
- Binding 0 bị `|| default` thay bằng phím mặc định, không thể tắt binding.
- targetPid=0 được coi là focused: keyboard có thể gửi vào cửa sổ bất kỳ.
- vJoy loop ánh xạ action index 60–63 vào button 67–70, rồi nhánh DPad ghi đè bốn nút đó. Một số action alias còn xuất lặp qua primary và extended.

Triển khai:
1. Lập bảng semantic action -> route theo profile và backend. Mỗi action chỉ được phát qua route đã chọn; xử lý các primary/extended alias để không kích hoạt hai output cho cùng action. Không chỉ xóa default keys toàn cục.
2. 0 là binding keyboard được tắt rõ ràng; undefined/null mới dùng default thích hợp. Đồng bộ UI, profile persistence, encoder và bridge. Nếu action có route virtual hợp lệ, tắt keyboard không được vô tình tắt route đó; trạng thái unbound phải rõ ràng.
3. Khi route là keyboard, lọc alias tương ứng khỏi state gửi virtual. Release phím cũ khi profile/route/focus thay đổi. Keyboard chỉ gửi khi PID đích hợp lệ thật sự foreground; PID=0 không đủ điều kiện gửi keyboard. Chính sách virtual output khi không chọn game phải được ghi riêng.
4. Sửa mapping vJoy không collision. Bảo toàn bảng semantic đã công bố nếu có thể; P/R/N/D đã có mapping 8/7/10/9, không mirror lên 67–70 làm hỏng lookLeft/lookRight/pause/reset. Audit cả compact device và alias primary. Nếu cần bỏ mapping trùng, ghi hướng chuyển binding cũ, không đổi action index.
5. Expose capability thiếu axis/button/driver và route không khả dụng. Không báo action hoạt động khi vJoy chỉ có 8/16 nút mà mapping cần 70. Kiểm tra kết quả SendInput; lỗi phát phím phải được báo chứ không suy diễn game đã nhận.

Test bằng fake keyboard/adapter ghi lại output calls: mỗi action riêng lẻ, các alias, binding 0, PID0, wrong foreground, đổi profile khi giữ phím, buttonCount 8/16/70. Assert đúng button đích và không có ghi đè hoặc output thứ hai. Chạy test C# thật nếu có .NET; mock không thay bằng chứng Windows driver/game.

Done: bảng routing deterministic và không collision; release hoạt động; docs mapping/capability cập nhật.
```

## Prompt 6 — Backpressure, sequence, ACK và watchdog

```text
Áp dụng instruction chung. Thực hiện bước 6: sửa pipeline khi mạng/pipe nghẽn mà không phá protocol.

Phạm vi: PWA send/pending/ACK, packages/protocol, Gateway index.js/pipe-client.js, C# FrameAssembler/Watchdog và integration tests.

Ca audit:
- PipeClient OR latchedExtended/latchedButtons có thể gộp gear1 và gear2 thành hai gear cùng bật.
- lastValid được cập nhật trước sequence validation; duplicate/stale hoặc extension rời có thể refresh watchdog phía Gateway.
- bufferedAmount lớn làm PWA bỏ lượt gửi; pending overflow bị clear im lặng nhưng UI vẫn báo Driving.

Yêu cầu:
1. Tách latest analog/selection khỏi pulse edges/hold lifecycle. Gear chọn mới nhất, không OR các selection loại trừ nhau. Pulse giữ thứ tự press -> release -> press kể cả khi pipe.write báo backpressure; queue hữu hạn với chính sách overflow rõ ràng, neutral/pause nếu không bảo đảm delivery.
2. Session reset/reconnect/profile change xóa queue và pending cũ. Neutral/reset ưu tiên và không bị một snapshot cũ gửi sau đó ghi đè. Không phát lại backlog tap từ phiên trước.
3. Chỉ input hợp lệ đã qua sequence/coherence và chính sách acceptance mới cập nhật mốc watchdog. Extension rời, malformed, duplicate, stale và cross-session không refresh. Kiểm tra wrap 255 -> 0.
4. Đối chiếu docs đang yêu cầu bộ 0x12/0x13/0x11 với code/test có đường standalone 0x11. Ghi quyết định compatibility và test rõ: có thể giữ state-only legacy nếu đang được hỗ trợ có chủ ý; không nhận một bộ extension thiếu như thể là snapshot đầy đủ của session hiện tại. Không âm thầm phá client cũ hoặc nới validation để test xanh.
5. Định nghĩa ACK: Gateway accepted/queued hay bridge applied. UI và queue không được lấy ACK accepted làm bằng chứng game áp dụng. Nếu thêm bridge acknowledgment, có correlation session/revision/sequence và test cả mất ACK.
6. Backpressure có trạng thái/diagnostic và phục hồi. Không cấp phát hoặc dựng lại DOM quá mức trong send loop. Không tăng watchdog; C# vẫn độc lập và neutral trong giới hạn 150 ms.

Test với fake clock/pipe và integration thật khi có runtime: gear1 -> gear2 khi congested; ba shift tap nhanh; hold -> release khi congested; neutral chen trước pending; pipe disconnect/reconnect; chỉ gửi duplicate/extension rời; missing/reordered extension; wrap sequence; pending overflow và bufferedAmount cao.

Done: không tạo output mâu thuẫn, không mất cạnh do OR, frame cũ không giữ session sống; báo riêng số đo watchdog mock và Windows thực tế.
```

## Prompt 7 — Range, calibration, reset và profile đồng nhất

```text
Áp dụng instruction chung. Thực hiện bước 7: loại bỏ các thay đổi cấu hình làm input nhảy hoặc UI khác dữ liệu gửi.

Đọc public/src/settings.js, app.js, wheel.js, control-math, profile persistence/Gateway revision và docs/BUSINESS_RULES.md.

Ca tái hiện:
- Nhấn calibration ở góc 123°; pause/reset diễn ra trước khi đọc góc nên lưu 0. Chỉ đổi thứ tự dòng lệnh vẫn có thể tạo offset khiến góc neutral bị lệch.
- Range 1080 -> 360 khi đang armed và góc 300°: normalized steering nhảy từ khoảng 17753 lên 32767.
- Reset settings: profile range 540 nhưng wheel/label vẫn 900; reset có thể xóa calibration trái quy tắc.

Triển khai:
1. Chọn semantics calibration nhất quán với wheel cảm ứng: “Cân tâm” phải đưa cả góc hiển thị và output về tâm; không trừ một offset cũ khỏi một wheel đã reset về 0. Phân biệt calibration sensor nếu có với thao tác recenter touch. Viết quyết định, kiểm tra dữ liệu offset cũ và migration an toàn.
2. Range, mode, curve/deadzone và profile ảnh hưởng output phải thay đổi sau pause/neutral. Đồng bộ profile được áp dụng, wheel constraints, label và normalization theo đúng revision; không đổi gain ở giữa drag đang lái.
3. Dùng một nguồn cấu hình chuẩn cho range/defaults; không để settings local và server profile âm thầm cạnh tranh. Trong lúc đang apply, UI biểu thị pending, không hiển thị applied sớm.
4. Reset settings giữ pairing và calibration theo BR-SET-04; reset calibration giữ pairing; factory reset mới xóa các phạm vi được công bố. Layout được giữ trừ khi thao tác nói rõ reset layout. Không thêm confirm cho thao tác không phá dữ liệu ngoài phạm vi; factory reset cần UI nêu rõ phạm vi.
5. Binding 0 và schema migration từ bước 5 phải nhất quán ở mọi đường load/default/reset. Handle storage failure bằng trạng thái lỗi, không báo “đã lưu” giả.
6. Calibration completed/explicit default confirmation phải có trạng thái rõ nếu rule hiện hành yêu cầu; không lặp bắt người dùng calibrate mỗi reconnect.

Test: recenter ở 123°, ±limit; load legacy offset; range đổi khi giữ wheel/ga; reset sau chọn game range 540; reload; reset từng phạm vi và kiểm tra pairing/layout/calibration; ACK profile chậm.

Done: neutral luôn neutral, giá trị hiển thị và encoder cùng config, không thay range khi đang Driving.
```

## Prompt 8 — Layout editor: đa chạm, cancel, drop, lưu và scale

```text
Áp dụng instruction chung. Thực hiện bước 8: sửa editor bằng state và hình học đúng, giữ dữ liệu layout người dùng.

Phạm vi: public/src/layout-editor.js, app.js, index.html/style.css và wheel sizing nếu liên quan trực tiếp.

Ca audit:
- Global pointermove/up không kiểm pointerId; pointer thứ hai kéo hoặc kết thúc drag.
- Palette pointerdown có thể ghi đè drag; cancel/lost capture lại thêm button.
- toPoint clamp nên drop ngoài stage vẫn được thêm tại 94%,92%.
- Add/drag cho phép vị trí nhưng load filter xóa item gần mép/top-left; layout lưu hai item có thể chỉ còn một sau reload.
- Clamp tâm không tính chiều rộng/cao/scale, gây clip; preset right bị inline --x ghi đè.
- Wheel lấy getBoundingClientRect đã scale rồi đặt CSS size và scale thêm lần nữa.

Triển khai:
1. Ownership/cancel dùng hợp đồng bước 2 cho core control và palette. Drop chỉ commit đúng owner, đúng pointerup và ở trong vùng stage hợp lệ trước khi clamp. Cancel giữ layout trước drag.
2. Phân biệt logical size với rendered bounds/DPR. Layout positions và presets đi qua cùng model, không dựa vào một CSS rule không thắng inline style. Wheel canvas dùng kích thước logical chưa transform.
3. Tính bounds theo toàn bộ control đã scale, safe area và vùng toolbar/editor. Không chỉ clamp tâm. Preset có thứ tự xử lý overlap và kích thước màn hình rõ ràng, không xếp control lên nhau rồi overflow:hidden.
4. Load/save cùng schema và validator. Giá trị finite/version đúng; item hợp lệ gần góc không bị xóa im lặng. Nếu màn nhỏ cần điều chỉnh, clamp/migrate có thông báo và giữ item, không lọc mất dữ liệu. Test dữ liệu cũ trước migration.
5. Resize/orientation trong drag phải hủy hoặc cập nhật hình học theo chính sách đã thống nhất.
6. setEditing(false) lặp lại phải idempotent, không phát notice “đã lưu” che trạng thái lái. Chỉ báo lưu khi persistence thành công.
7. Có draft Save/Discard hoặc cơ chế Undo đủ phục hồi đổi preset/drag. Không bắt buộc xây editor mới; dùng cơ chế nhẹ phù hợp code hiện tại.

Test: drag bằng pointer1 rồi move/up pointer2; palette cancel/lost capture; drop bốn phía ngoài stage; add x=6,y=10 -> save/reload; control scale lớn sát mép; preset left/right/custom; resize lặp ở DPR1/2/3; storage quota failure; preset undo.

Done: không thêm nhầm nút, không mất item khi reload, bounds/scale/preset đúng trên các viewport ở bước 12.
```

## Prompt 9 — Wheel và pedal dễ điều khiển bằng ngón tay

```text
Áp dụng instruction chung. Thực hiện bước 9: sửa cảm giác thao tác sau khi ownership đã đúng.

Phạm vi: wheel.js, pedals.js, control-math và hint/markup/style của hai control. Không đổi protocol hoặc output routes.

Ca audit: wheel nhận drag gần tâm, atan2 khiến chuyển động nhỏ đổi góc lớn; nhận toàn hình vuông dù hình wheel là tròn. Pedal chạm giữa track có thể lập tức đạt ~81.8%, không phù hợp hình minh họa/nhận thức người dùng.

Yêu cầu wheel:
- Vùng bắt đầu hợp lý theo bán kính, tránh điểm sát tâm gây singularity và vùng ngoài control. Không làm hitbox quá nhỏ khó dùng.
- Angle unwrap, clamp range, auto-center và resize dùng cùng logical geometry. Disabled/paused không nhận thao tác.
- Hiển thị góc/range đúng trạng thái đang áp dụng. Scale và DPR chỉ đổi hình ảnh, không đổi độ nhạy vì tính rect hai lần.

Yêu cầu pedal:
- Định nghĩa gesture rõ ràng trước khi code. Mặc định đề xuất relative drag: pointerdown bắt đầu 0, kéo lên tăng theo quãng đường đã chuẩn hóa, clamp 0..1, release/cancel về 0. Nếu giữ absolute position vì tương thích, phải có lựa chọn/nhãn/thang đo rõ, không giữ công thức khiến chạm giữa nhảy 82% mà không giải thích.
- Hiển thị pressed image/fill/percent đúng cùng travel dùng để encode. Không gọi pressure nếu thiết bị/gesture không đo lực.
- Từng pedal sở hữu pointer riêng; throttle+brake/clutch đồng thời không chặn nhau. Track, icon, label không tạo vùng chết khó hiểu.
- Geometry thay đổi khi đang giữ được xử lý theo quy tắc bước 2; không có output jump từ rect cũ.

Test tọa độ: start ở tâm/ring/corner của wheel; qua ±180°; pedal down giữa track, kéo lên/xuống, đi ra ngoài hitbox rồi release/cancel; hai/ba pedal đồng thời; scale và DPR; orientation trong drag. Assert continuity, monotonicity, clamp, release và dữ liệu snapshot thật.

Done: thao tác có thể dự đoán, không bất ngờ lên ga lớn khi vừa chạm; ghi thay đổi gesture và migration/hint ngắn cho người dùng.
```

## Prompt 10 — Catalogue control, UI trạng thái và phục hồi pairing

```text
Áp dụng instruction chung. Thực hiện bước 10: làm UI phản ánh đúng khả năng và trạng thái ứng dụng.

Đọc app.js, index.html/style.css, settings, packages/profiles catalogue/supportsAction, desktop renderer và pairing flow.

Các vấn đề cần kiểm tra:
- Palette chỉ dùng auxiliary ACTIONS nên thiếu một số primary control như shift/nitro/clutch tap/DPad/handbrake; control ẩn theo mode không có đường thêm lại hợp lệ.
- Group/action không phù hợp game vẫn hiển thị như dùng được; keyboardOff/binding0 và capability thiếu có thể báo sai.
- Connected bị hiểu thành Ready/Driving; trạng thái input được trình bày như xe đã nhận.
- QR có nonce mới nhưng connect() có thể lấy receiverHost cũ trong storage; revoked token không dẫn người dùng về pairing lại.
- Gesture suppression toàn cục có thể chặn click ở settings/AT button trên Safari; portrait chỉ bị che bằng CSS, input cũ chưa chắc đã dừng.

Triển khai:
1. Một catalogue dùng chung cho control primary + auxiliary ở UI, nhưng giữ nguyên 64 action index wire. Catalogue chứa label, kind, mode/game/route availability và icon phù hợp. Không tạo semantic trùng.
2. Capability phải tính từ route thật, backend, axes/buttonCount, game groups và binding. Item lưu từ profile khác được giữ với trạng thái unavailable/lý do, không tự xóa layout.
3. Phân biệt Pairing/Connected/Bridge not ready/Profile applying/Paused/Awaiting release/Driving/Backpressure. Render từ state machine, không từ notice text hoặc một boolean isConnected. Nút disabled có lý do ngắn và hành động khắc phục khi có.
4. Hàng nút thiết yếu và label có thứ bậc rõ, tương phản đủ; vùng chạm chính nên đạt ít nhất 44 CSS px trong viewport mục tiêu. Icon không thay cho nhãn khó đoán; phần trăm/góc là input controller.
5. QR nonce và receiver host phải thuộc cùng endpoint. Trong link QR hợp lệ, host hiện tại có ưu tiên đúng; token được scope theo receiver, không dùng token/host cũ để pair sang server khác. Revoked/expired/invalid token có đường ghép lại rõ; không silent takeover.
6. Scope touch-action/anti-zoom vào cockpit theo nhu cầu. Settings/form và click AT phải hoạt động. Portrait/background/orientation phải gọi safety lifecycle thật, không chỉ ẩn màn hình; resume chỉ khi điều kiện bước 1 đạt.
7. Không dựng lại toàn bộ controls theo mỗi status/ACK. Tránh status re-render làm mất pointer, focus của form hoặc selection.

Test: mọi mode x game/backend phổ biến; thiếu driver/axis/nút; palette add primary; QR với host lưu cũ; revoked token; profile ACK chậm; AT click/settings keyboard/touch; portrait khi giữ ga; status update giữa drag. Browser test nếu có; Safari cần xác nhận trên thiết bị ở bước 12.

Done: người dùng thấy đúng trạng thái, biết vì sao action chưa dùng được và có đường phục hồi.
```

## Prompt 11 — Áp UI pack bằng asset, giữ logic đã sửa

```text
Áp dụng instruction chung. Thực hiện bước 11: thay lớp render wheel/pedals/shifter bằng UI pack được cung cấp, giữ hệ thống input đã kiểm chứng.

Điều kiện đầu vào: asset PNG/WebP/SVG gốc hoặc ảnh tham chiếu đã có trong workspace. Ảnh screenshot tổng hợp không tự động tương đương asset trong suốt. Nếu chưa có asset cần thiết, ghi BLOCKED cho phần asset và danh sách thiếu; không tuyên bố đã áp pack, không ngừng các bước logic/verification có thể làm.

Trước khi sửa:
- Liệt kê asset có thật, kích thước, alpha, pivot và cặp normal/pressed.
- Map wheel, throttle/brake/clutch, sequential paddles, AT selector và H-shifter sang control đang tồn tại. Hình pack 5-speed+R không được làm mất gear6 của app.
- Giữ bố cục wheel trái, transmission giữa, pedals phải và preset/layout người dùng; điều chỉnh cần thiết dựa trên bounds ở bước 8.

Triển khai:
1. Assets có đường dẫn tương đối trong public; manifest/module render dùng chung. Decode/preload một lần, không tạo Image mới mỗi frame. Normal/pressed cùng canvas size/alignment để không nhảy hình.
2. Wheel xoay quanh pivot đúng theo currentAngle; pedals dùng travel thật; paddle/button dùng semantic input state; H knob/AT selection theo model thật. Không gắn logic mới vào việc đổi ảnh.
3. Lớp hình trang trí không chặn pointer của control; hitbox giữ hình học đúng ở mọi scale/DPR. Lựa chọn Canvas/DOM phải dựa trên render hiện có và giữ hiệu năng.
4. Giữ labels/mode/range/percent và accessibility cần thiết. H labels/render động khớp gear đang hỗ trợ, không lấy chữ 5+R cố định trong ảnh làm source of truth.
5. Không vẽ lại pack bằng CSS và gọi là dùng asset gốc. Không thêm chức năng của pack chưa có route game chỉ vì thấy icon. Không tạo RPM/speed/gear-confirmed giả.
6. Cập nhật service worker/cache manifest và version nhất quán với import/assets; kiểm tra asset fail/loading và bản cũ update. Không xóa cache/pairing người dùng tùy tiện.
7. Chạy lại regression liên quan input, scale và layout. Chụp ảnh các trạng thái thực tế để so sánh với reference; browser screenshot phải là từ app thật.

Test: wheel neutral/±angle; pedal0/50/100%; hold/release/cancel; AT/MT/MTC/H; H gear6; layout custom reload; asset missing; old cache -> new version; DPR1/2/3 và viewport nhỏ.

Done: render dùng pack thực tế, state/logic không đổi sai, không clip và không thêm fake functionality. Thiếu asset phải giữ trạng thái BLOCKED/PARTIALLY VERIFIED phù hợp.
```

## Prompt 12 — Kiểm chứng luồng thật và bản phát hành

```text
Áp dụng instruction chung. Thực hiện bước 12: kiểm tra các sửa đổi như một ứng dụng hoàn chỉnh, gồm bản đóng gói người dùng chạy.

Không mở một đợt rewrite mới. Nếu phát hiện lỗi, tạo issue/case gắn về bước sở hữu, sửa tối thiểu và chạy lại phần liên quan.

1. Chạy suite dự án từ checkout hiện tại: npm test; npm run test:dotnet; npm run test:e2e-bridge. Dùng script thực tế nếu package.json đã thay đổi hợp lệ. Báo command/output thật, không sao chép số test từ audit cũ.
2. Browser trên các viewport landscape 844x390, 667x375, 568x320 và portrait390x844. Kiểm tra safe area, bounds control, hit target, overlap, elementFromPoint ở các vùng chạm; không chỉ xem screenshot. DPR1/2/3, multi-pointer, resize/orientation, cancel/lost capture, settings/layout save/reload.
3. Kịch bản người dùng: mở Receiver -> tạo QR -> pair -> chọn game/backend -> apply profile -> Ready -> resume -> wheel+pedals+shift -> pause -> settings -> resume -> disconnect/reconnect -> revoke/pair lại. Mỗi chuyển trạng thái kiểm tra cả UI và output, không chỉ nút click được.
4. Windows/C# thực tế khi có môi trường: vJoy 8/16/70 nút, XInput, keyboard target PID, alt-tab/game close, driver missing, bridge crash. Kiểm tra input không vào cửa sổ sai, keyboard release và neutral authoritative <=150 ms khi mất input hợp lệ. Unit fake-clock không chứng minh thời gian trên Windows.
5. Game thật: chọn một game XInput và một game vJoy phù hợp có sẵn; test hai shift tap nhanh, direct gear độc nhất, clutch/handbrake/camera một route, range change chỉ khi pause. Không có game thì ghi chưa kiểm tra, không tự ghi PASS.
6. Build: npm run build:bundle; npm run build:bridge; npm run build:desktop khi đủ Windows/toolchain. Xác minh artefact đóng gói chứa source/assets mới, không dùng bundle/bridge cũ. Mở bản portable/installer thật nếu môi trường cho phép.
7. PWA/cache: update từ bản cache cũ, refresh/reopen, pairing/layout persistence, assets loading. Khả năng service worker/offline trên LAN HTTP phụ thuộc secure context; kiểm tra deployment/iPhone thực tế, không hứa offline từ test localhost.
8. Đối chiếu từng issue ID trong FIX_PLAN/FIX_STATUS. Chỉ COMPLETE khi ca tái hiện và gate của issue đạt ở mức bằng chứng cần thiết. Thiếu browser/Windows/game/asset ghi PARTIALLY VERIFIED hoặc BLOCKED với điều kiện còn thiếu.

Tạo docs/FIX_VERIFICATION.md: commit kiểm tra, bảng issue -> test/bằng chứng -> kết quả, test chưa chạy, giới hạn còn lại, hướng dẫn manual ngắn cho phần cần thiết bị. Cập nhật docs/PROTOCOL.md/BUSINESS_RULES.md/mapping nếu các bước trước có thay đổi hợp lệ.

Kết thúc bằng báo cáo tự chứa: phần đã sửa, phần đã kiểm tra, phần chưa kiểm tra và lý do. Không ghi “fix toàn bộ” nếu còn issue/asset/driver/game gate chưa đạt. Không push/deploy trừ khi đã có yêu cầu riêng.
```

## Prompt sửa tiếp khi một bước chưa đạt

```text
Tiếp tục bước đang làm, chưa chuyển sang bước kế tiếp.

Đọc diff và docs/FIX_STATUS.md hiện tại. Dùng lỗi/test output vừa nhận để xác định nguyên nhân. Tái hiện bằng đường production thật; nếu chỉ có mock, nêu giới hạn. Sửa tối thiểu trong phạm vi bước, giữ invariant và thay đổi của người dùng.

Không bỏ test, không tăng timeout watchdog, không dùng frame zero để vượt neutral, không đổi action index, không refactor toàn ứng dụng để né lỗi. Chạy lại test thất bại và các regression bị ảnh hưởng. Chỉ mở rộng kiểm thử khi thay đổi mới hoặc rủi ro cụ thể yêu cầu.

Cập nhật bằng chứng và trạng thái. Báo file thay đổi, ca đã đạt, ca còn fail/không chạy được và nguyên nhân. Nếu bị môi trường chặn, hoàn tất phần có thể kiểm tra và ghi đúng giới hạn; không tự tuyên bố PASS.
```

## Các dấu hiệu cần trả lại cho AI sửa tiếp

- “Đã xử lý” nhưng không có ca tái hiện, diff hoặc kết quả lệnh.
- Chỉ đổi CSS/ẩn nút trong khi snapshot vẫn có action sai.
- Test kiểm tra một bản logic được chép lại thay vì code production.
- Xóa các item layout, default key hoặc action để làm lỗi biến mất.
- Bỏ protocol golden vectors, thay action index hoặc tăng watchdog.
- Gọi Gateway ACK là game đã nhận thao tác.
- Báo đã kiểm tra trên iPhone/Windows/vJoy/game dù chưa chạy ở môi trường đó.
- Báo đã dùng UI pack trong khi asset gốc chưa có.

Các kiểm thử mock dùng được để chứng minh một nhánh logic. Browser, driver và game vẫn cần bằng chứng ở đúng tầng của chúng.
