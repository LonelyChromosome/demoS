# BPA 1.6 — chuyển sang Scriptable

Đây là bộ đồng bộ để kiểm tra trên iPhone, **chưa phải bản BPA hoàn chỉnh**.
Không cần tài khoản Apple Developer hay chữ ký IPA. Cần ứng dụng Scriptable.

## Chạy bộ đồng bộ

1. Mở `BPA-Scriptable-Sync.js` bằng Scriptable. Nếu bảng chia sẻ không có
   Scriptable, tạo script mới rồi dán toàn bộ nội dung file vào.
2. Chạy script, chọn đăng nhập và đồng bộ.
3. Đăng nhập trên trang QLĐT của trường. Khi đã vào cổng sinh viên, bấm **Xong**
   trên WebView. Script lấy TraCuu, xác minh kế hoạch/môn/lớp, lấy lịch và lưu.

Nếu tài khoản/trang chưa sẵn sàng, script báo lỗi và không thay lịch đã lưu.
Dữ liệu lưu cục bộ tại `BPA-Scriptable/semester-v1.json` trong vùng dữ liệu
của Scriptable. Không lưu dữ liệu vào iCloud. Script không ghi mật khẩu,
token hay cookie ra file hoặc log; phiên đăng nhập do WebView của Scriptable quản lý.

## Đã triển khai

- Tái sử dụng hai đoạn JavaScript QLĐT của Android: TraCuu và lấy lịch từng
  tuần, concurrency 8. Không đổi action, func hay cách gọi `edu.system`.
- Port parser, tên môn không fuzzy, subjectId, kiểm tra ngày/giờ,
  xác minh lớp và học kỳ, giữ kỳ cũ đến hết ngày +4 tháng 7 ngày.
- Chỉ thay dữ liệu sau khi toàn bộ yêu cầu và xác minh thành công.
- Bản lưu có phục hồi khi lỗi đổi tên file, không thay bằng dữ liệu demo.
- Kiểm tra Node cho parser, cầu callback, giới hạn 8 yêu cầu, timeout,
  session hết hạn và rollback lưu dữ liệu.

## Chưa hoàn tất

- Giao diện app, cả ba widget, Theme Engine/VFX, diff đồng bộ, thông báo,
  báo thức, cập nhật, tự đăng nhập và sync khi chuyển sang app khác.
- Đọc UID NFC trực tiếp: API công khai Scriptable không có đầu đọc NFC.
  NFC Automation của Shortcuts không được coi là thay thế tương đương
  thao tác bấm quét và đọc UID thẻ. Chưa có giải pháp tương đương đã kiểm chứng.
- Chưa chạy trên Scriptable/iPhone thật hoặc tài khoản QLĐT thật.
  Test Node không chứng minh đăng nhập/cookie/WebView hoạt động trên iPhone.
- Chưa xác nhận mức tương đồng 95%; không dùng file này thay app BPA đầy đủ.

## Dành cho phát triển

`python3 scriptable/build.py` trích hai đoạn JavaScript từ source Android và
đóng gói thành một file. `reuse.json` ghi hash để kiểm tra việc tái sử dụng.

`TZ=Asia/Ho_Chi_Minh node --test test/scriptable/core.test.js`
