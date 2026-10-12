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
| QLĐT, TraCuu, parse, xác minh, lưu | IMPLEMENTED / UNVERIFIED | Hai script Android nguyên gốc, parser JS, Flutter diff/retention gốc | Tài khoản thật, WebView cookie, retry và auto-login chưa tương đương Android |
| Ba renderer widget | IMPLEMENTED / UNVERIFIED | Canvas port từ XML/Kotlin, vector icon gốc, 13 ảnh gốc Widget2, state riêng | Renderer chưa đạt pixel parity, Tiên Môn/glow/timeline/trạng thái còn phải đối chiếu |
| Tương tác widget tại Home Screen | CHƯA TÌM RA GIẢI PHÁP | Scriptable dùng URL mở app; small chỉ một vùng bấm; `refreshAfterDate` không bảo đảm thời điểm cập nhật | Chưa tìm được cách giữ nguyên thao tác/tốc độ cập nhật và animation ngay trên Home Screen |
| NFC bấm gọi đầu đọc và UID | CHƯA TÌM RA GIẢI PHÁP | Đã kiểm tra API Scriptable và NFC Automation; NFC.cool có UID/deep-link nhưng cầu automation trả phí, nên loại | Chưa có đường thay thế miễn phí tương đương đã kiểm chứng |
| Báo thức | NOT STARTED | Có cầu callback tới Shortcut, chỉ nhận thành công khi callback xác nhận | Shortcut thật chưa được tạo/cài/test, hẹn đúng ngày chưa được chứng minh |
| Nhắc thi 7/3/1 | IMPLEMENTED / UNVERIFIED | Notification API, key theo môn/lịch, hủy pending cũ, tránh delivered | Text trợ lý, timing, expiry và delivery phải so với Android |
| Sync khi chuyển sang app khác | CHƯA TÌM RA GIẢI PHÁP | Đã thêm Request transport dùng nguyên wire format Android và phiên Keychain; chưa thử chuyển app trên iPhone | Chưa kiểm chứng thực tế; code không được coi là đã cấp thời gian nền |
| Đồng bộ theo lịch | NOT STARTED | Không thêm auto 06:00 vì người dùng đã bác việc coi đó là chức năng mới | Chỉ triển khai nếu có hành vi tương ứng trong bản chuẩn đã chốt |
| Updater web tương đương Android | NOT STARTED | Giữ UI/controller/verifier; không tải APK để giả cập nhật web | Kênh web có chữ ký, áp dụng bản, gate thẻ NFC và rollback |
| Một file chuẩn bị scripts | IMPLEMENTED / UNVERIFIED | `BPA.js` tự chuẩn bị 3 scripts widget và vùng dữ liệu, không iCloud | Đã build Flutter web thành công; loader cục bộ và nhánh tài nguyên đang được kiểm tra, updater chưa xong |

## Bằng chứng giới hạn

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
