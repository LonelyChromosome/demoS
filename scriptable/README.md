# BPA — Scriptable host

**Bản tích hợp để kiểm tra toàn app trên iPhone; chưa xác nhận parity thiết bị.**
Đầu ra là Scriptable + WebView + Shortcuts, miễn phí, không IPA và không iCloud.

`BPA.js` là điểm khởi chạy thống nhất: tự chuẩn bị thư mục dữ liệu, tải và
kiểm tra SHA-256 gói tài nguyên web, cache cục bộ và tạo ba script widget.
Giao diện web được compile từ source Flutter DemoF3, dùng ảnh, font, shader
và các màn hình gốc. Không yêu cầu chỉnh source khi dùng.

## Trạng thái cài đặt

Bộ nạp đã render màn hình đăng nhập gốc trong Chromium, ảnh/log đã kiểm tra.
Nhánh `scriptable-web` đã có tài nguyên. Chưa xác minh cài/chạy trên iPhone thật.
Không trình bày file host hiện tại là gói app đã hoàn tất.

File nhập là `BPA.scriptable`: lưu trong Files, mở/chia sẻ sang Scriptable,
thêm BPA rồi chạy. Envelope được tạo theo file export Scriptable thật,
nhưng thao tác import chưa được xác minh trên iPhone. `BPA.js` là source cùng gói.
Bộ nạp lưu tài nguyên trong vùng dữ liệu cục bộ của Scriptable. Thêm widget
lên Home Screen vẫn cần thao tác iOS; khả năng tương tác/cập nhật và hình ảnh
của cả ba widget chưa đạt hợp đồng Android parity.

Phiên QLĐT dùng WebView và Keychain; mật khẩu, token, cookie không gửi qua
máy chủ trung gian. Server tài nguyên chỉ chứa code, font và ảnh ứng dụng.
Bản ghi học kỳ chỉ thay sau xác minh; lỗi lưu phục hồi bản cũ.

## Phần chưa hoàn tất

- Đăng nhập/cookie, chuyển app khi sync và kiểm thử tài khoản thật.
- Pixel parity, tương tác, animation và Tiên Môn của widget.
- NFC: có consumer callback, chưa có scan UID trên thẻ/iPhone thật.
- Clock: Shortcut đã compile/ký và đóng gói; chưa thử import/chạy trên iPhone.
- Updater Ed25519 cho gói web đã có source staging/rollback, feed thật đã ký/phát hành và qua kiểm tra browser; gate NFC chưa thử trên thiết bị.
- Toàn bộ kiểm thử chức năng/ảnh/hiệu ứng trên iPhone.

Chi tiết hướng đã thử và hướng tiếp theo: `docs/SCRIPTABLE_PARITY.md`.
`BPA-Scriptable-Sync.js` chỉ là công cụ chẩn đoán đồng bộ cũ, không phải sản
phẩm bàn giao thay cho app.

## Kiểm tra phát triển

```sh
python3 scriptable/build.py
python3 tool/audit_scriptable.py
TZ=Asia/Ho_Chi_Minh node --test test/scriptable/*.test.js
```

Kiểm tra Node và Chromium không thay thế kiểm thử Scriptable trên iPhone.

## Một bộ cài BPA

Người dùng chỉ nhận `BPA.scriptable`. Script tự chuẩn bị vùng dữ liệu/tài nguyên
và widget. Workflow báo thức, cầu quét thẻ và widget đã ký nằm ngay trong file BPA; không yêu cầu người
dùng tải một module khác. Lần đầu đặt báo thức, BPA mở luồng import của iOS khi
cần, rồi xác minh companion đã sẵn sàng trước khi tạo báo thức.

Dữ liệu ký và hash đều phải khớp; đóng màn import không được tính là đã cài.
Bước import/chạy Clock vẫn chưa thử trên iPhone. Companion NFC dùng đầu đọc NFC Helper miễn phí; UID/callback và chuyển app vẫn
phải kiểm chứng trên thiết bị. Đây chưa phải bộ cài hoàn chỉnh để giao người dùng.

## Bản kiểm tra tích hợp 2026-10-13

Chỉ đưa người dùng `BPA.scriptable`. File tự chuẩn bị bộ chạy widget/nhắc lịch và chứa các Shortcut đã ký; việc nhập thành phần, cài NFC Helper miễn phí, thiết lập Automation nhắc lịch và thêm widget được hướng dẫn trong app. Đồng bộ dùng inline runner độc lập, gọi cùng transaction Dart, có account epoch, journal rollback và nhận lại trạng thái khi mở app. Không đưa người dùng file module hoặc fixture riêng.

Chuyển app/khóa màn hình, callback UID, chuông, nhắc lịch và Home Screen đều là kiểm tra thực tế còn phải thực hiện. Không ghi nhận import/guide acknowledgment là thử nghiệm thành công.
