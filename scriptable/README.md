# BPA — Scriptable host

**Đang triển khai; chưa đủ điều kiện gọi là BPA hoàn chỉnh.**
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
- Shortcut quét UID NFC và tạo báo thức thật: có consumer callback, chưa có
  Shortcut cài được và chưa kiểm chứng phần cứng.
- Updater Ed25519 cho gói web đã có source staging/rollback, đang kiểm tra trước khi mở feed; gate NFC chưa thử trên thiết bị.
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
