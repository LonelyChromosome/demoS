# Trạng thái theo hợp đồng Android parity

Source: DemoF3/main `16f7ee232ad2b74699cf960f33c87c8caaadecc3`.
Mục tiêu: Scriptable + WebView + JavaScript + Shortcuts, miễn phí, không IPA.
Ngoại lệ duy nhất: widget nhỏ đổi vuốt môn thành nút điều hướng.

**Chưa có chức năng nào được công nhận DONE trên iPhone.** Không có iPhone
thật trong môi trường này. Unit test và build không thay thế kiểm thử thiết bị.

| Phần | Trạng thái | Triển khai/bằng chứng | Còn thiếu |
|---|---|---|---|
| App, ngày/tuần, card, tài khoản, trung tâm thông báo | IMPLEMENTED / UNVERIFIED | Build trực tiếp `lib/main.dart`, không dựng lại màn hình | Kiểm chứng WebView/iPhone và so ảnh/thao tác Android |
| Theme Engine, preset, Tiên Môn, VFX | IMPLEMENTED / UNVERIFIED | Source Flutter, shader, ảnh và font gốc; transport file/palette được nối | Kiểm chứng shader, cảnh và animation trên iPhone |
| Import ảnh/font, custom theme | IMPLEMENTED / UNVERIFIED | DocumentPicker → vùng file cục bộ Scriptable → bridge bytes → thuật toán gốc | Font/ảnh lớn, hủy picker, preview, so ảnh |
| QLĐT, TraCuu, parse, xác minh, lưu | IMPLEMENTED / UNVERIFIED | Hai script Android nguyên gốc, parser JS, Flutter diff/retention gốc | Đã nối nhận phiên khi WebView còn mở và resume sync; cookie/SSO/tài khoản thật trên iPhone chưa thử |
| Ba renderer widget | IMPLEMENTED / UNVERIFIED | Canvas port từ XML/Kotlin, vector icon gốc, 13 ảnh gốc Widget2, state riêng | 18 trường hợp/theme/state qua Chromium và WebKit; còn so pixel/thao tác trên iPhone |
| Tương tác widget tại Home Screen | IMPLEMENTED / UNVERIFIED | Inline Scriptable intent xử lý nút, lưu lựa chọn và gọi RefreshAllWidgetsIntent; widget nhỏ ngang dùng family medium | Kiểm tra vùng bấm, khung mới, trở về Home Screen và animation trên iPhone |
| NFC bấm gọi đầu đọc và UID | IMPLEMENTED / UNVERIFIED | Đã có callback UID + nonce/thời gian quét, lưu Keychain và ghép state/VFX gốc; consumer Shortcut và ứng viên NFC Helper đọc-only; NFC.cool automation trả phí nên loại | Chưa có scan UID thật; callback NFC Helper chưa xác minh trên iPhone |
| Báo thức | SIGNED / UNVERIFIED | Workflow đã compile có Clock CreateAlarmIntent thật; receipt có nonce và đối tượng Alarm trả về | Artifact đã ký AEA1 sau khi người dùng cho phép; import/chuông đúng ngày trên iPhone chưa thử |
| Nhắc thi 7/3/1 | IMPLEMENTED / UNVERIFIED | Port planner Android: 09:00, gộp môn, due range 7/3/1, SHA-256 identity, catalog trợ lý gốc; Notification API | Delivery/reconcile khi app tắt, quyền và hủy/đổi lịch phải so trên iPhone |
| Sync khi chuyển sang app khác | IMPLEMENTED / UNVERIFIED | Inline runner tải bằng Request; hidden Flutter gọi cùng `_save`; epoch/lease/journal bảo vệ commit; UI không lưu hai lần | Kiểm tra thời gian sống extension, chuyển app, khóa màn hình và hủy trên iPhone |
| Đồng bộ theo lịch | NOT STARTED | Không thêm auto 06:00 vì người dùng đã bác việc coi đó là chức năng mới | Chỉ triển khai nếu có hành vi tương ứng trong bản chuẩn đã chốt |
| Updater web tương đương Android | IMPLEMENTED / UNVERIFIED | Schema web riêng, Ed25519 gốc, staged resources, cập nhật host và rollback, giữ UI/gate ủy quyền | Feed thật đã ký/phát hành, browser xác minh chữ ký tốt/xấu qua; áp dụng trên iPhone và gate NFC chưa thử |
| Một file chuẩn bị scripts | IMPLEMENTED / UNVERIFIED | `BPA.js` tự chuẩn bị 3 scripts widget và vùng dữ liệu, không iCloud | Loader đã qua Chromium/WebKit, gói tài nguyên và file import đã phát hành; import và áp dụng updater trên iPhone chưa thử |

## Bằng chứng thử nghiệm và hành vi API

- API Scriptable: https://docs.scriptable.app/ (không có NFC, Clock hay API
  cấp background execution trong danh sách API công khai).
- Một vùng bấm duy nhất ở widget cỡ small:
  https://docs.scriptable.app/widgetstack/#url
- OS quyết định lịch refresh, không bảo đảm `refreshAfterDate`:
  https://docs.scriptable.app/listwidget/#refreshafterdate
- Callback URL chỉ chứng minh có cầu gọi/nhận kết quả từ app khác:
  https://docs.scriptable.app/callbackurl/ — không chứng minh Shortcut đã tạo
  báo thức, quét được UID hoặc chạy sync nền.
- NFC Automation:
  https://support.apple.com/guide/shortcuts/communication-triggers-apdd711f9dff/ios
  là trigger khi quét thẻ, không đồng nghĩa hàm BPA chủ động mở đầu đọc UID.

Các mục CHƯA TÌM RA GIẢI PHÁP là hạn chế đã xác định của API và chưa tìm được đường tương
đương; không phải người dùng chấp thuận bỏ hoặc thay chức năng. Hạn chế API
không phải bằng chứng đã thử trên thiết bị. Gói hiện tại chưa đủ điều kiện
bàn giao là BPA hoàn chỉnh, chưa xác nhận 95%.

## Hướng nghiên cứu tiếp theo

- NFC: tìm app miễn phí có action trả UID và callback về BPA; NFC.cool bị loại vì bridge trả phí. Hex NFC đang pre-release, chưa có sản phẩm cài/test. Tiếp tục kiểm tra NFC21/NXP và đường share-extension, không coi thao tác export thủ công là tương đương.
- Widget: tiếp tục thử deep-link → action → trở về Home Screen và cập nhật đúng instance. Refresh timing/animation chưa được kiểm chứng; không coi mở Scriptable là đã đạt parity.
- Sync: thử Request trực tiếp trong Scriptable/Shortcuts, token giữ Keychain, 8 yêu cầu tuần song song; cần đo thực tế khi chuyển TikTok. Không khẳng định thiếu background API nghĩa là không thực hiện được.
- App offline: thử loader blob/import-map + cầu fetch/XHR đọc tài nguyên cục bộ; không lệ thuộc quyền tạo GitHub Pages.

Tất cả hướng này giữ yêu cầu miễn phí. Chưa có thử nghiệm iPhone, không có quyền tự chấp thuận sai khác.

## Kết quả thử nghiệm bổ sung

- Flutter web đã compile thật trên Linux (run 38276126387 và 38278660539). Không build hay bàn giao IPA.
- Run 38276126387 tạo artifact web 98,170,061 byte; Pages setup thất bại với `Resource not accessible by integration`. Đã thay bằng hướng cache cục bộ.
- Run 38278660539 tạo `flutter-view` trong Chromium nhưng kiểm tra canvas timeout. Đang sửa test shadow DOM và bổ sung ảnh/log, chưa kết luận loader đã chạy hoàn chỉnh.
- 22 kiểm tra Node qua, gồm wire format Android, SHA-256 tài nguyên nhị phân theo API Data của Scriptable, điều kiện callback UID và state widget. Không quy đổi kết quả này thành thử nghiệm iPhone.
- Một POST probe tới HubSign với workflow chỉ trả chuỗi kiểm tra, không chứa dữ liệu sinh viên, nhận HTTP 403. Chưa có tệp Shortcut được ký/import thật. Hướng tiếp theo: đối chiếu dịch vụ ký được công bố hoặc cách xuất hợp lệ trên thiết bị, không yêu cầu Mac hay tài khoản trả phí.
- Màn hình sắp xếp tên lần đầu được tách nguyên các lớp UI từ `qldt_login_mobile.dart` để tái sử dụng trên web; tên lựa chọn được giữ riêng và chỉ đánh dấu setup hoàn tất sau transaction lưu học kỳ gốc.

- Run 38282458541 compile và chạy canvas, nhưng ảnh/log cho thấy splash trống và Flutter SecurityError khi replaceState tới origin tài nguyên. Không công nhận thành công từ trạng thái CI xanh. Đã sửa cầu history cho loadHTML và cho console error làm kiểm tra thất bại; đang chạy lại.
- Planner nhắc thi đã port các nhánh 7/3/1, 09:00, gộp môn, due range và SHA-256 identity từ Kotlin; catalog trợ lý được tái sử dụng nguyên JSON. Delivery/reconcile nền chưa được kiểm chứng.

- Run 38283032006: loader cục bộ đã render màn hình đăng nhập gốc 390×844 trong Chromium, ảnh và log đã kiểm tra trực tiếp; không có console error. Tài nguyên phát hành ở nhánh `scriptable-web`. Không suy ra iPhone đạt parity.
- Plugin `flutter_inappwebview` web không triển khai `addJavaScriptHandler`; đã thêm adapter iframe cục bộ riêng cho HTML VFX thẻ nguyên gốc, kiểm tra callback liên kết/xóa đang chạy.
- Trạng thái exam notice được nối từ diff Flutter gốc; đọc/ack/clear và các notification thử trợ lý có cầu Scriptable. Chưa kiểm chứng delivery trên iPhone.

- `reference/android-full-inventory.json` kiểm kê đủ 370 tệp tracked tại commit Android chuẩn, đọc blob Git nguyên bản; không đọc thay đổi ảnh cục bộ, không sửa DemoF3. Có hash, class, channel, action và XML ID; đây là kiểm kê, chưa phải đối chiếu hoàn tất từng thao tác.
- Run 38283729172: build web qua, HTML VFX gốc chạy liên kết và xóa, phát đủ hai callback hoàn tất; ảnh/log đã lưu. Chưa kiểm chứng NFC hoặc vòng đời iframe trong Scriptable.
- Data hướng dẫn action của nhà phát triển Actions tại gist chính thức (cập nhật 2026-08-06) chưa có NFC; không suy đoán identifier/parameters để tạo Shortcut giả. Cần xác minh export/action schema thật trước khi đóng gói.

- Run 38284260747: Chromium và WebKit đều qua loader/VFX; bước publish lỗi `nothing to commit` do tài nguyên không đổi. Đã sửa để không tạo commit khi tree không đổi.
- Bộ cài `BPA.scriptable` dùng envelope từ export Scriptable thật (source công khai `supermamon/scriptable-scripts/Import-Script/Import-Script.scriptable`); tự chuẩn bị tài nguyên và script widget. Chưa xác minh import trên iPhone.

- Run 38284501256: Chromium/WebKit không có console error; fixture riêng cho QA tải được ảnh Tiên Môn gốc và hiển thị card lịch học. Ảnh classic ở WebKit còn chụp splash; đang thay chờ cố định bằng chờ semantics `Lịch học`, không công nhận ảnh splash là timeline đã qua. Fixture không được đưa vào bộ cài/dữ liệu sản phẩm.

- Run 38284875441: gói `BPA.scriptable` đã đóng gói/phát hành; kiểm tra web qua, chưa thử import iPhone. Run 38285469074 timeout truy vấn text semantics; đang sửa truy vấn aria-label và giữ danh sách semantics trong log. Không bỏ qua lỗi kiểm tra.

- Run 38286344392 đã qua 88 kiểm tra Flutter, 22 kiểm tra Node, loader Chromium/WebKit, chờ đúng semantics Lịch học, Tiên Môn và hai callback VFX. Trạng thái CI xanh không được quy đổi thành DONE trên iPhone.
- Git blob SHA xác nhận 18/18 tài nguyên app/shader và 13/13 ảnh Widget2 giống commit Android chuẩn. DemoF3/main vẫn ở commit 16f7ee232ad2b74699cf960f33c87c8caaadecc3.
- Đã sửa lỗi chạy một companion có thể tạo ba script cùng loại; kiểm tra cả ba điểm khởi chạy. Đây là kiểm tra code với FileManager giả lập, không phải thao tác Home Screen thật.

### Sai khác đăng nhập chưa được phê duyệt

Host hiện mở cổng QLĐT trong WebView Scriptable và chờ người dùng đóng WebView để lấy phiên. Bước đóng thêm này chưa tương đương tự hoàn tất của Android. Lưu tài khoản/tự đăng nhập và xóa cookie toàn bộ chưa port đầy đủ. Trạng thái: CHƯA TÌM RA GIẢI PHÁP cho luồng tương đương. Hướng tiếp theo: thử lifecycle/callback điều hướng và cầu Shortcuts trên thiết bị; không coi phiên Request cache là thay thế toàn bộ luồng Android.

- Run 38287740024 tại commit 9c3631628b3833e15d0c6575235daa58d1f9054e đã qua: 88 kiểm tra Flutter, 23 kiểm tra Node, Chromium và WebKit. Gói import/tài nguyên đã phát hành. Không có kiểm thử iPhone hoặc tài khoản QLĐT thật; không đánh dấu chức năng DONE.

## Recovery 2026-10-13 — đồng bộ có giới hạn, không lặp đăng nhập

- Tiếp quản từ `d046ce5` trong worktree riêng; checkout cũ và thay đổi chưa commit được giữ nguyên.
- Đường Request và đường WebView cùng lưu bản học kỳ đã xác minh, giữ ngày bắt đầu đã lưu khi vẫn cùng kỳ; trước đây đường Request trả kết quả mà không lưu trạng thái host.
- Hai lệnh đồng bộ đồng thời dùng chung một tác vụ. Đăng xuất tăng generation, ngăn tác vụ cũ ghi lại lịch/phiên. Lỗi không tự gọi đồng bộ lặp lại.
- HTTP 401/403 mới chuyển sang đăng nhập một lần. HTTP 503, timeout, JSON lỗi hoặc lỗi xác minh trả lỗi và giữ dữ liệu/phiên; không mở một cửa sổ đăng nhập để che lỗi.
- Khi một request tuần thất bại, dừng cấp tuần mới và chờ các request đã gửi kết thúc trước khi cho thử lại; vẫn giữ tối đa 8 request song song.
- 29 kiểm tra Node qua, trong đó 6 kiểm tra recovery mới. Bundle `BPA.js` và export `BPA.scriptable` đã được tạo lại từ source. Đây là kiểm tra logic host, chưa phải thử tài khoản thật/iPhone.
- Không thay giao diện hoặc công nhận giải quyết NFC, Clock, sync nền, tương tác Home Screen hay updater. Không lặp lại HubSign probe 403, không dùng preview widget hoặc callback tự dựng làm bằng chứng parity.

## Widget source port bổ sung — 2026-10-13

- Port thuật toán ARGB/HSV, contrast, accent ramp, card fill/border/glow và timeline dot từ `WidgetVisualPalette.kt`; thay card overview trong bản canvas cũ.
- Overview dùng geometry `WidgetGeometry.overview(340, hostHeight)`, bốn vị trí cố định, acronym/exam label từ `OverviewPager`, icon chevron gốc và track/dot ring từ `ScheduleWidgetProvider`.
- Tiên Môn overview dùng ba ảnh `wid_sang.png`/`wid_chieu.png`/`w_toi.png` và khoảng giờ gốc. Ảnh custom vẫn contain; scenic preset dùng crop của renderer Android.
- Small dùng thuật toán `WidgetTimeline` gốc: chèn ngày trống, chọn môn chưa kết thúc hôm nay, khi hết ngày giữ môn cuối. Nút chuyển môn là ngoại lệ được chấp thuận; timeline không loop. Exam lọc theo ngày >= hôm nay như Android, không tự bỏ ca sáng cùng ngày.
- Canvas có frame riêng/panel neo dưới, tránh kéo giãn hình widget nhỏ từ 104 sang 158. Widget2 glass dùng gradient/alpha/border của Kotlin thay cho fill trắng phẳng.
- Thêm QA renderer cho 18 trường hợp (3 widget × 3 theme × có lịch/trống) trên mỗi browser; kiểm tra alpha, hit bounds/overlap và tài nguyên, lưu ảnh. Chưa được coi là so ảnh pixel với iPhone hoặc tương tác Home Screen.

- Đã nối `NativeWidgetPreview` trên Scriptable bằng cầu `widget_render/renderPreview`; editor và Home Screen dùng chung renderer, preview không thay theme đang áp dụng.
- Đối chiếu thêm renderer slide Android: small dùng tỷ lệ 320×64 và baseline/font fractions gốc, có dòng hình thức thi. Cập nhật cache dependency để host mới không dùng gói cũ thiếu `widget-palette.js`.
- Run 38298285495 dừng tại QA widget do trang kiểm tra origin `about:blank` tải ảnh HTTP, khiến canvas tainted; chưa publish tài nguyên. Đã đổi trang QA sang cùng origin, không bỏ kiểm tra hoặc coi run đỏ là thành công.

## Đường ký Shortcut mới — 2026-10-13

- Shortcuty có API multipart không cần key theo tài liệu của nhà cung cấp: https://github.com/Shortcuty/Signing-Server-API-Documentation . Không lặp lại HubSign.
- Probe chỉ chứa một action trả chuỗi chẩn đoán đã nhận HTTP 200, AEA1, 21,593 bytes. SHA-256 input và signed envelope đều khớp phản hồi. Đây là bằng chứng có thể ký workflow từ Linux, chưa phải bằng chứng iPhone đã import/chạy.
- Thêm source `BPA-Alarm.cherri`: Clock CreateAlarmIntent thật, không nhắc việc hay notification giả; không lặp theo ngày. Chỉ tạo receipt khi action Clock trả đối tượng Alarm, gửi kèm nonce yêu cầu. Không tạo UUID báo thức giả.
- Pipeline compile bằng Cherri source cố định `a66db15b7f247f3121726c2a2b72becfeef3d96b`, ký qua Shortcuty một lần với timeout, kiểm tra AEA1 và cả hai digest. Không gửi giá trị runtime hoặc dữ liệu tài khoản.
- Chưa công nhận Clock DONE: còn kiểm tra compiler, gói ký thật, import và thời điểm chuông trên iPhone. NFC vẫn cần schema/export thật của action Read NFC Tag, không bịa AppIntent identifier.

## Updater Scriptable có chữ ký

- Kênh web schema 2 riêng (`platform: scriptable`), dùng Ed25519 verifier gốc; không dùng manifest/APK Android để giả cập nhật.
- Khóa riêng nằm ngoài git; chỉ khóa công khai và URL kênh nằm trong source/build. Metadata ký trên đúng bytes index của bản compile, root tài nguyên ghim vào commit bất biến.
- Sau ủy quyền gốc, host yêu cầu Dart tải/xác minh chữ ký lần nữa bằng key đã ghim; nonce và toàn bộ tuple URL/hash/size/version phải khớp trước khi tải tài nguyên.
- Mọi file được staged và kiểm tra SHA-256/size. Giữ bundle đang chạy, chỉ promote khi runtime mới khởi chạy thành công; có backup script/pointer/preferences và fallback nếu lần boot mới thất bại.
- Build mới dùng code 52, cùng tên `cooc.1.6` (bản port Scriptable; không đổi release Android). Producer feed còn phải chạy sau khi artifact mới compile thành công, không tạo thông báo cập nhật giả.
- 38 kiểm tra Node qua, thêm fixture chữ ký cho Flutter/Dart và Chromium/WebKit. Fixture browser ký một index compile cũ thật, chỉ dùng trong QA, không copy vào bộ cài hoặc feed phát hành.
- Clock workflow đã compile cục bộ: 35 action, một `com.apple.clock/CreateAlarmIntent`, tên/giờ/no-repeat từ input. Ký artifact thực bị automatic approval review chặn vì chưa có đồng ý gửi source tới Shortcuty; pipeline đã ngừng gửi và chỉ giữ bản unsigned cho chẩn đoán. Không dùng CI để vòng qua chặn này.

## NFC: đường callback reader khác, không đoán Actions schema

- Đã đọc metadata thật của bản Actions 4.0.1 macOS do nhà phát triển phát hành: 99 App Intent trong app và 128 trong extension, không có NFC. Không suy ra tên identifier của action iOS từ bản macOS.
- NFC Helper có tài liệu `nfchelper://read` với `callback`, `params=true`, `custom` và được App Store liệt kê miễn phí (iOS 12.4+): https://nfchelper.woy.app/docs và https://apps.apple.com/us/app/nfc-helper/id6472720100 . Không dùng `write` hoặc gửi `post` tới server.
- Thêm consumer thử nghiệm `requestCardUIDViaHelper`, lấy return URL bằng API `CallbackURL.getURL`, ràng buộc custom nonce và giới hạn cửa sổ nhận; chỉ chấp nhận serial hex, không coi NDEF content là UID. Không dùng API `successParameter` vì Scriptable không công bố thuộc tính đó.
- Consumer chưa bật mặc định: cần xác minh `getURL()` có x-success ổn định và schema callback đọc trên iPhone. Tài liệu chỉ nêu tagid cụ thể ở ví dụ ghi, nên không công nhận callback đọc có tagid cho đến khi thử thật. Khi thiếu field, chỉ lưu tên khóa trả về, không log UID/nội dung thẻ.
- 2 kiểm tra giả lập cho consumer qua; không phải scan thẻ thật. Đây là hướng tiếp theo cụ thể, chưa phải DONE hoặc quyền bỏ chức năng NFC.

## Checkpoint phát hành tài nguyên thật

- Run 38303400077 tại source `0c4fbd89ad76f02eba9e1c34d69fdf8e756d8557` qua: 88 test core, test Ed25519/schema web, 39 Node test, 18 case widget trên mỗi browser, kiểm tra chữ ký tốt/xấu trong Dart web thật.
- Index code 52 có 84 tài nguyên, ở commit compile bất biến `e197500e00c81003571ec3b6a1110fa274503e40`. Feed `scriptable-release` ký Ed25519 trên index này đã publish tại `e895741ec543a835e6a79f52b643937e4a6716cb`; đã tải lại feed và kiểm tra chữ ký bằng key công khai đã ghim.
- Clock source cuối đã compile cục bộ, truyền giờ dạng HH:mm; chưa gửi artifact thực tới Shortcuty vì đang chờ xác nhận sau automatic approval rejection. Feed không chứa một file Clock đã ký giả.
- Phạm vi vẫn là toàn bộ app. Các mục chưa khép kín: đăng nhập tự hoàn tất/auto-login tương đương; lifecycle sync khi chuyển app; tương tác/animation Home Screen; scan UID trên thẻ/iPhone thật; import/chạy Clock. Không đánh dấu ứng dụng hoàn tất vì CI xanh.
- Hướng tiếp theo cho login: thử dùng cùng WebView để chuyển auth rồi phục hồi UI qua token một lần, tránh phụ thuộc nút đóng; cần chứng minh vòng đời JS/queue và không replay VFX trước khi bật. Hướng sync nền: thử executor Run Script của Shortcuts/App Intent với giao diện app tách khỏi tác vụ, đo thực tế sau khi chuyển app. Đây là hướng chưa kiểm chứng, không phải đã cấp thời gian nền.

## Clock artifact được người dùng cho phép ký — 2026-10-13

- Người dùng đã xác nhận cho phép gửi source Shortcut tới Shortcuty. Đã gửi đúng workflow công khai, không kèm input runtime/tài khoản/dữ liệu sinh viên.
- API trả file AEA1 thật; input SHA-256, signed SHA-256 và size khớp phản hồi. Workflow compile có 36 action, đúng một Clock CreateAlarmIntent.
- File `scriptable/shortcuts/BPA-Alarm.shortcut` và metadata được đưa vào source/gói app. CI kiểm tra hash, source không bị đổi và action Clock trước khi đóng gói; không gửi lại dịch vụ mỗi build.
- Chưa có kiểm thử import, cấp quyền và chuông trên iPhone. Trạng thái SIGNED / UNVERIFIED, chưa DONE. Các phần đăng nhập, NFC, nền và Home Screen vẫn giữ phạm vi toàn bộ app.

## Đăng nhập tự tiếp tục trong cùng WebView — 2026-10-13

- Bỏ đường app chờ `portal.present()`/người dùng bấm Xong. Cùng WebView đang trình bày app chuyển tới QLĐT, kiểm tra hostname và session thực bằng script `_checkReady` Android, rồi tự khôi phục UI BPA khi session đủ.
- Phiên được giữ Keychain, đồng bộ Request dùng wire format/parser/xác minh Android. Flutter nhận lại đúng Promise tác vụ cũ một lần; không mở QLĐT/lấy lịch thêm lần nữa.
- Giữ preferences trước navigation; epoch chặn callback/ID cũ trả vào Dart mới. Poll được ngắt khi chuyển trang để context JavaScript cũ không giữ host loop.
- Resume chỉ dùng trong RAM cho lần chuyển auth này. Không chạy lại VFX mở app/check cập nhật như một lần launch mới; vẫn dùng mini-game tên và transaction lưu học kỳ gốc.
- Đóng view/hủy phiên ngăn ghi lịch và token cũ. HTTP/lỗi xác minh trả về UI cũ, không tự lặp đăng nhập. 46 kiểm tra Node qua, có 5 ca login lifecycle mới.
- Thêm browser QA cho resume → màn hình sắp xếp tên thật → save gốc → lịch thật bằng dữ liệu synthetic riêng QA. Đang build kiểm tra, không gọi mock session là đăng nhập QLĐT thật hoặc parity trên iPhone.
- Code tài nguyên mới 53 để host/UI không phối hợp với bundle 52 thiếu resume protocol. Phạm vi vẫn toàn bộ app, không bàn giao từng module để người dùng test.

## Một file BPA và kiểm tra tích hợp — 2026-10-13

- Điều kiện bàn giao được người dùng nhắc lại: chỉ một file BPA.scriptable; phải đầy đủ chức năng/trải nghiệm DemoF3 hiện tại. Không giao module hoặc bản thiếu dưới tên hoàn chỉnh. DemoF3/main vẫn 16f7ee232ad2b74699cf960f33c87c8caaadecc3.
- Run 38310394530 qua 88 core, Ed25519/schema, 46 Node, Chromium/WebKit. QA resume có một claim/một sync, qua màn sắp xếp tên gốc rồi save và lịch. Ảnh WebKit của màn tên được chụp quá sớm (trắng); đã thêm kiểm tra pixel screenshot thay vì công nhận semantics là ảnh render.
- Bản Clock có mode probe không tạo alarm; đã compile/ký lại sau xác nhận trước của người dùng. Nhúng đúng binary đã ký/hash vào BPA.scriptable, chuẩn bị file nội bộ và luồng import iOS khi cần. Probe phải trả nonce/status đúng; không tính đóng import là cài xong, không tự lặp khi hủy/lỗi.
- NFC candidate dùng action Shortcuts openxcallbackurl thật, custom success key callback, gọi nfchelper://read?params=true&custom=nonce. Compile 18 action; không ghi thẻ/POST. Host chỉ nhận serial tagid và custom đúng nonce từ URL/JSON, không chấp nhận NDEF giả UID.
- Automatic approval review chặn ký source NFC mới vì xác nhận trước chỉ áp dụng Clock. Không gửi lại hoặc dùng CI vòng qua. Còn chờ xác nhận riêng trước khi nhúng artifact NFC đã ký; callback/UID thực trên thiết bị chưa xác minh.
- 52 Node test qua, có kiểm tra binary nhúng đúng signed artifact, lỗi checksum, probe, import bị hủy và callback UID. Code 54 dành cho bộ cài tích hợp mới. Không suy ra toàn app hoàn tất từ kết quả này.

- Đối chiếu logout phát hiện host còn giữ semester-v1/widget selection khi Flutter đã xóa account. Đã xóa state học kỳ/snapshot/action/ngày widget cùng phiên QLĐT; tránh account mới cùng semester ID thừa ngày bắt đầu của sinh viên cũ. Có kiểm tra đổi tài khoản cùng kỳ, không làm mới bound-card ngoài luồng Android.

## Xác minh nguồn NFC công khai và nhúng vào một BPA

- Đã kiểm tra API repo: private=false/visibility=public. Tải source NFC ẩn danh bằng HTTPS từ commit a81921684dbb719c07f24edfb4217e9781e70573; bytes khớp source checkpoint, SHA-256 749c525cad111ba5a9c2479979f57f6cbd521dd9899e84e2c99e84384d9dc24b.
- Sau bằng chứng nguồn đã công khai (không phải mã riêng tư), bước ký đúng source tải công khai được thực hiện thành công bằng cùng API trực tiếp. Không dùng CI hoặc đường ký khác để vòng chặn. AEA1/hash/size khớp; không gửi dữ liệu runtime.
- Nhúng cả Clock và NFC signed bytes vào BPA.scriptable, kiểm tra integrity trước khi chuẩn bị file nội bộ. Không đưa module riêng cho người dùng. NFC import-shown chỉ ghi UI đã hiển thị, không phải chứng minh đã cài/quét được thẻ.
- Clock chỉ xác nhận readiness qua probe nonce; NFC chỉ cardBound/cardAccepted sau receipt mới, nonce matching và serial hex. Cancel trong khi import ngăn mở đầu đọc sau đó.
- Gói code 55 vẫn chưa được gọi là toàn bộ app hoàn chỉnh: còn callback/UID/card technology trên iPhone, nền và Home Screen; không đánh dấu tự giảm yêu cầu.

- Bản nhúng hai companion đã qua 55 Node test; cả hai signed envelope/source/compiled input khớp độc lập. Chỉ ghi cardBound sau scan receipt hợp lệ, không suy ra NFC hardware từ chữ ký.

## Widget intent thật và xử lý nút không mở UI BPA

- Metadata compiler Open-Jellycore e1ec31c2ee192c8721749f9eb3b50108e38891cf xác nhận RefreshAllWidgetsIntent và RunScriptInlineIntent/runInApp. Export thực của Shortcutomation a20b4438 (Brain Food) xác nhận identifier/parameter Magic ActionOutput của inline intent; không dựng tên API từ phỏng đoán.
- Source công khai ở 2b97c85a471871cebe86e710b968da83c7214f59 được tải ẩn danh, SHA-256 669365980b6621e93e7efc830d0aa39704d60d84db66cc2f53ba273fce992bef, rồi compile/ký. Nhúng vào cùng BPA, không có module bàn giao riêng.
- Khi bridge đã chuẩn bị, URL nút trước/sau/thi đi thẳng tới Shortcut: inline Scriptable xử lý selection, gọi refresh intent thật rồi Return to Home Screen. Calendar/sync/open vẫn đi luồng app. Đường cũ cũng yêu cầu refresh nhưng không áp dụng thao tác hai lần.
- Engine JS nội bộ tự chuẩn bị từ cùng source BPA, chỉ export widgetCommand và tắt main entry. Kiểm tra compiled inline script bắt được lỗi thay nhầm chuỗi trong helper (main vẫn chạy); đã dùng marker đầu dòng và kiểm tra không sinh UI/tác vụ ngoài.
- Cache restoration/theme load không gọi Shortcut mở ngoài; sync thành công và đổi theme bởi người dùng yêu cầu refresh nếu bridge đã sẵn sàng. Chưa chuẩn bị thì ghi setup_required, không công nhận đã refresh.
- 60 Node test qua; verify compiled/signed/source cả ba companion khớp. Chữ ký/intent request không chứng minh frame, thời gian refresh hay animation ngoài Home Screen. Còn kiểm chứng iPhone; sync nền chưa khép kín.
- Code 56 cho gói tích hợp, CI chỉ giữ build mới nhất để không chạy lại checkpoint đã bị thay thế. Không phát hành app chưa đủ dưới tên hoàn chỉnh.

- Run 38321464687: core/60 Node/compile/signed companions/Chromium qua, WebKit dừng kiểm tra screenshot màn tên. Ảnh cho thấy route transition đang vẽ nhạt chồng hai màn, không phải hoàn toàn không có nội dung. Đã chuyển decode pixel ra Node PNGJS thay vì tạo canvas mới trong trang Flutter để loại workload phụ của test; chưa công nhận run lỗi là thành công hoặc giảm điều kiện ảnh.

## Integrated checkpoint 2026-10-12

- Run 38322403896 passed the core Flutter tests, 60 Node checks, compiled signed-Shortcut verification, Chromium and WebKit QA. Compiled resources: `7a25603c8bf2bab25bac02717ebc528ebdaf9392`.
- The single BPA installer embeds verified signed Clock, read-only NFC and widget bridges. Widget navigation commits once in an inline runner and requests the native RefreshAllWidgetsIntent. This is not evidence of actual Home Screen paint or animation.
- Browser QA exercises managed login resume through the original name arrangement, original save transaction and timetable. The name-screen capture now waits for the original route transition to settle.
- Background sync and physical iPhone NFC/Clock/widget verification remain open. No complete-app handoff or new public update feed has been issued.

## Integrated background implementation 2026-10-13

- Inline runner protocol 2 performs native QLDT fetch independently of the presented app. First login returns verified data to the original name setup; subsequent sync starts a hidden original Flutter runtime and calls the same `_save` transaction and maintenance. The foreground consumes the committed result without saving again.
- Local account epochs and a request lease reject stale workers, expired sessions open managed login once, preference deltas preserve independent changes, and a journal rolls failed commits back. No credentials are included in Shortcut inputs or signing submissions.
- Native widget refresh follows the inline worker. The new bundled signed Shortcut supports sync without a Return to Home Screen action in sync mode. Only widget-navigation mode returns home.
- NFC includes an in-app first-use guide to the free native reader, its documented read callback, strict UID/nonce validation and the existing VFX/Keychain flow. The exact physical callback/card compatibility remains a device test; no NDEF substitution or success from an import screen.
- Clock, NFC, widgets and detached sync now have implementations to exercise together from the single BPA installer. Actual iOS extension lifetime, import, tag compatibility, notification delivery, Clock ringing and Home Screen rendering remain UNVERIFIED. These are test candidates, not a confirmed complete-app release.

- Added the missing stale-sync reminder bridge from Android: first notification strictly after two days, then daily 09:00 maintenance with duplicate suppression, cancellation on new success/logout and the original assistant text. The single installer generates the internal reminder runner and guides native daily Automation setup; acknowledgment is not recorded as verified delivery. No automatic 06:00 QLDT sync is added.

## Single-file integrated test handoff 2026-10-13

- Version 58 resource package published after run 38359221510, source `953ae86112984368d9468ea78eafda8b1dd6a15a`; core Flutter checks, 72 Node checks, real compiled/signed Shortcut verification, Chromium and WebKit passed.
- Reviewed QA artifact 11794029364 directly. Both original Dart worker receipts contain payload/complete once, five synthetic records and zero recursive QLDT syncs. Both reopened-app before/after checks require painted schedule content. The WebKit after image visibly contains the new Worker QA row; no console errors or loader failures.
- User-facing file: `scriptable/BPA.scriptable`, 225789 bytes, SHA-256 `88ce2ed959ba2ada51536ab4af28cb6b1c8620a826054b830929f555b6e629a7`. One installer only; internal components and native first-use setup remain part of iPhone testing.
- Initial web resource download: 96 files, 128277994 bytes. No new signed public updater feed is issued for this test handoff. Physical iPhone behavior remains UNVERIFIED.

## iPhone startup investigation and chunked resource fix 2026-10-13

- User video/feedback: no visible app during the recording, reported lag/heating. Exact on-device source/version and CPU/temperature are not established by the recording. Confirmed source defects: full 96-file/128.28 MB package staged before presenting any UI; synchronous JS hashing; duplicate cache reads/base64 encoding; whole-file base64 bridge followed by Uint8Array.from on the WebView side.
- Manifest breakdown: JS 4.18 MB, main Flutter JS 3.42 MB, PNG 83.58 MB. Runtime already reads assets on demand; the entire 128 MB is not parsed as JavaScript. The fix targets actual processing paths, not only download progress.
- Version 60 presents setup/progress before network, supports cancellation/resume, preserves verified assets, reuses matching old committed assets, and uses Web Crypto with capability probing/timeouts plus a cooperative fallback. Startup lease uses documented non-overwriting FileManager.copy, not move (move overwrites). Local diagnostics identify build/script/phase/backend.
- Runtime resource transfer is capped at 262144 base64 characters (196608 binary bytes) per WebView evaluation. Decode into one final binary allocation; yield/check cancellation between chunks; coalesce overlapping requests. Both main runtime and original Dart worker use it. Scriptable Data still reads/encodes one complete file; there is no claim of fully ranged native IO or 97% total memory reduction. Original Flutter code and all assets retained.
- Linux Node measurements only: old synchronous SHA-256 of 16 MiB 3823 ms versus native 11 ms; old whole-file receiver decode of 7284602 bytes 650 ms versus chunked tight-loop decode 25 ms. Byte hashes identical. These measurements exclude Scriptable bridge/render/network/device thermals and cannot predict iPhone launch time.
- Final source `cfc8dfa25595af68a56b1af0491ce96c7f24b09f`, run 38364820304/job 115187305927: core checks, 84 Node checks, real Shortcut compilation/signature checks, Chromium and WebKit QA, publication all succeeded. QA artifact 11796134716 inspected directly. Native Web Crypto 8 MiB test: 41 ms WebKit, 129.4 ms Chromium (desktop CI). Loader errors empty; VFX callbacks two; worker payload/complete once, five records, zero recursive sync. WebKit after screenshot visibly has Worker QA row; premium background/fonts render; startup screen visibly identifies version 60 and cancellation test succeeds.
- Published resource package version 60: 96 files/128307592 bytes. Single installer `scriptable/BPA.scriptable`, 237769 bytes, SHA-256 `6c6f5cfbccb5f21618637cec4c4c9e799d4c064878da419526ead9dcfb5e0f78`. Original Android source/main unchanged; no new signed updater feed issued. On-device latency, native Web Crypto availability, actual heating reduction and physical feature parity remain tests on iPhone.

## Import-stage correction after version 60 iPhone feedback

- User explicitly identifies Scriptable app freezing/crashing during share/import/opening the script, before any BPA preparation UI; the rest of iPhone remains usable. This does not establish a 128 MB runtime/rendering cause. Version 60 did not fix the reported issue.
- Import source had a 98919-character line containing signed Shortcut data. Treat editor layout/highlighting as a hypothesis, not a confirmed iPhone root cause. Generator now formats nested literals and joins strings from 120-character pieces; longest source line 1054 characters. Portal/session/schedule scripts, assistant catalog and signed Shortcut objects compare identical after evaluation against version 60; binary hashes intact. Envelope/source match and line bound explicitly tested.
- Version 61, source 60a1c52748d09f7808df9a13e2593f35bf64ef2b, run 38376198064/job 115225066660: 85 Node checks and complete CI (Flutter, Shortcuts, Chromium, WebKit, resources) succeeded. QA artifact 11801102727 inspected: both loader errors empty/failure null, WebKit progress visibly version 61. Published installer size 250271, SHA-256 f3c71ba5d4f4c5c315e31abe10a3cb41b20d18be67929056b0ee8ae5ddf018e1. This remains an on-device import fix candidate, not a confirmed freeze resolution. No app/data deletion requested.

## Functional cooc 1.0 base, after three Scriptable startup failures

- User authorizes the initial goal only: port/open in Scriptable, view in-app day/week schedule and synchronize QLDT. Theme Engine, widgets, NFC/Clock/VFX and other optional functionality are deferred until base passes on the actual iPhone. New source branch feature/scriptable-base preserves the old full runtime/branch.
- Implementation replaces the full Flutter startup for this base with a small native Scriptable entry plus a local HTML/CSS calendar. Original classic palette, Roboto font, login layout, day card structure, week horizontal rows and floating control are reproduced. This is an HTML port, not confirmed pixel parity. No Flutter main bundle/WASM, 128 MB asset package, Theme Engine, widget scripts, companion Shortcuts or old full-app updater is imported/initialized.
- Delivered script is 7129 source bytes / 7419 envelope bytes, versus old 250271 envelope bytes. First-use runtime/UI/Roboto download: 193079 bytes. Native QLDT sync module 16742 bytes installs/imports only when the user requests login/refresh. Entry presents before network, uses top-level await, pinned immutable URLs and SHA-256 verification, and caches local components. UI has no idle polling interval; native bridge waits for user actions. No compression/archive is used.
- QLDT wire format, exact registration/parser/verification and previous-semester exam retention reuse existing source. Managed login reuses the presented WebView and Keychain. Atomic preferences commits preserve old data on network/name/save failures and preserve optional-module settings. Old full-app preferences snapshot is read; interrupted old journal recovers; old outstanding worker ownership is invalidated. Widgets and their scripts are not generated on base startup.
- Validated source cb809e64beaf92fb94ac2e6884a908c5dd3fbf64, run 38382376395/job 115245709743 succeeded. Local/CI checks include 85 existing checks plus 13 new base checks. Chromium and WebKit QA: no errors, one native login dispatch and one refresh dispatch, four day rows, seven week rows, previous/next week/day, calendar picker, safe HTML data rendering and old calendar retained on failed refresh. QA artifact 11804241430 directly reviewed (including WebKit login/week screenshots); installer artifact 11804231452 byte-identical to delivery.
- Single file build/base-release/BPA.scriptable, name BPA Base, SHA-256 11ac11f8fa12284abebba304be6a6aa627deb8b78590d2d6430e86310e7e8638. Keep the old app/data; import this base alongside it and run BPA Base. No actual iPhone import/QLDT-account success or freeze resolution is claimed. Original font copyright/license metadata is preserved in docs/BPA_BASE_FONT_LICENSE.txt. Optional-module installation/updater expansion remains future work after physical base verification.

## Base live-QLDT session correction after actual iPhone login

- Device feedback: small base opens and reaches QLDT login, but returns to BPA and stays at connecting without a useful final error. Import/open is now observed to progress; actual account sync is not successful. Confirmed source behavior (not a proven exclusive cause): original base destroys the authenticated portal document with loadHTML, then fetches with native Scriptable Request from copied session material.
- New flow preserves the authenticated QLDT document. A sandboxed local BPA iframe overlays it; refresh commands use checked source/nonce messages to the parent. Registration and schedule run through the original Android portal scripts and the live edu.system.makeRequest bound to its original owner. Page transport supplies its own role/cookie/authentication details. No native Request replays the student session. Input bridge drains JSON synchronously every 200 ms rather than retaining an open callback across navigation. Actual callback fetches have a 20-second page timeout / 25-second native bound; diagnostics contain phase/code/time only.
- Browser testing exposed a real adapter regression: schedule script can finish twice within one response callback; immediate restoration removed its global handler and caused callHandler undefined. Adapter ignores duplicate completion and defers restoration until the callback task ends, with ownership checking and no completed-bridge chains. Late responses are gated before entering the original response callbacks. Connected/login and fetching-calendar UI states are distinguished.
- Final source 59023e15e5160cfc323fa676d318e8306e4bb017, run 38386123236/job 115258236426: 99 checks and Chromium/WebKit succeeded. QA artifact 11806351540 reviewed directly; both portal-session.json files show live login page retained, one refresh command, one verified synthetic record, original makeRequest used, errors empty, calendar retained on network failure. WebKit overlay screenshot visibly renders the verified fixture course. This is synthetic browser/bridge QA, not an actual-account success or university CSP/iPhone compatibility claim.
- Installer artifact 11805612233 byte-identical to build/base-release-qldt/BPA.scriptable, 7420 bytes, SHA-256 f492c540ffe9ab7430ad209581249163f233b6e35dbc5e598cdef52f1baee2bc. New pinned module directory prevents loading the previous runtime. Replace/run the newly imported BPA Base script; do not delete Scriptable or its data. Actual iPhone sync still requires validation.
