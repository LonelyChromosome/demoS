# Trạng thái port BPA 1.6

## Đầu ra đã chốt lại: Scriptable, miễn phí hoàn toàn

Người dùng yêu cầu Scriptable và không trả phí Apple Developer. Các phần
iOS native bên dưới là kết quả đi sai hướng, không phải phương án phát hành
đã được người dùng chấp thuận. Không chạy quy trình TestFlight hay yêu cầu
người dùng mua chứng chỉ để thay thế yêu cầu này.

Đã triển khai `scriptable/BPA-Scriptable-Sync.js`: bộ đồng bộ kiểm tra,
tái sử dụng hai đoạn JavaScript QLĐT của Android, port parser/verification/
subjectId/retention và lưu có rollback. 12 kiểm tra Node qua. Chưa chạy trên
Scriptable thật; chưa phải app hoàn chỉnh. Xem `scriptable/README.md`.

Giao diện BPA, cả 3 widgets, NFC UID, sync khi chuyển app, diff, thông báo,
báo thức và updater vẫn chưa hoàn tất. Không coi NFC Automation là bản quét
UID tương đương. Chưa tìm được giải pháp miễn phí tương đương toàn bộ các
hành vi bị giới hạn trong API Scriptable. Không tự chấp thuận bỏ chức năng.

## Kết quả native trước đó (không phải đầu ra Scriptable)

Bản triển khai ban đầu; chưa hoàn tất và chưa xác nhận đạt 95%.

| Phần | Trạng thái |
|---|---|
| App | Giữ source Flutter gốc, không dựng mock mới; cần so ảnh và thao tác trên iPhone |
| Lịch/học kỳ | Giữ parser, xác minh, retention, diff và dữ liệu gốc |
| Sync | Cầu HTTP gốc, request theo tuần, concurrency 8, iOS background task; cần kiểm chứng khi chuyển TikTok và lưu kết quả ở nền |
| NFC | Nút liên kết gọi Core NFC, Keychain giữ UID; cần kiểm chứng loại thẻ thật |
| Widget | Cả ba loại trong một extension; renderer là bản port đầu tiên, chưa pixel-match, small timeline/range, per-instance state, progress/glow/viền và chuyển cảnh còn phải hoàn thiện |
| Báo thức | Giữ UI/validation Android; cầu Apple Clock chưa được xác minh, không giả thành công bằng notification |
| Thông báo | Prototype 7/3/1 ngày lúc 09:00; grouping/delivered milestone và assistant text chưa port đủ |
| Cập nhật | Giữ UI/VFX và NFC; kênh iPhone có chữ ký và hành vi cập nhật chưa hoàn tất |
| Cài đặt | CI tạo bản unsigned kiểm tra; chưa có bản ký hay TestFlight link |

Không thêm tự động đồng bộ 06:00, không yêu cầu sync khi khóa máy, không sửa lỗi biên
Android trong lần port này. Các phần còn thiếu không phải khác biệt đã được chấp thuận.

Ở lượt trước: 88 test lõi qua; Dart không có compile error. Suite UI gốc có lỗi và
`app_update_ui_test.dart` cũng lỗi trên baseline chưa sửa. Lượt này chạy lại kiểm tra trong CI macOS.

Source đã được khôi phục từ commit cố định qua GitHub sau khi checkout tạm của lượt trước
không còn. SHA mới thay SHA local cũ; không tuyên bố đã đẩy nguyên hai SHA không còn trong workspace.

## Build đã xác minh

Commit `d3e8e423786f23fbd28c45329353157535c53364` đã build thành công trên macOS.
88 test lõi qua. IPA có app `vn.edu.phenikaa.bpa`, extension `vn.edu.phenikaa.bpa.widgets`,
version 1.6.0 build 51. Các binary và tài nguyên widget đã được kiểm tra trực tiếp trong IPA.
Xem `BUILD_VALIDATION.json` và workflow run 38268436131.

IPA hiện **chưa ký và không có provisioning profile**, không phải bản cài được trên iPhone.
Build xanh không xác nhận NFC/sync nền/widget trên thiết bị hoặc mức tương đồng 95%.
Workflow ký TestFlight đã có trên main, nhưng lượt này chưa chạy hay công bố bản ký.
