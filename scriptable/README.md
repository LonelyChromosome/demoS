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

## Bản thử nghiệm 59 — sửa bộ nạp sau phản hồi iPhone

Video người dùng cho thấy Scriptable chưa mở màn hình BPA trong khoảng quay;
ảnh phản hồi báo chậm và nóng máy. Video không xác định được phiên bản/source
đang chạy, cũng không đo được nhiệt độ hoặc CPU iPhone.

Đã xác nhận từ source bản 58: `openOriginalApp` chờ tải/kiểm tra trọn gói trước
khi tạo/present WebView. Gói 58 có 96 file, 128.277.994 byte. SHA-256 của từng
file chạy đồng bộ bằng JS với truy cập từng byte base64; file cache còn bị đọc
và encode hai lần. Đo thuật toán cũ trên Linux Node với 16 MiB: 3.823 ms;
Node native: 11 ms; hai digest giống nhau. Đây không phải phép đo iPhone,
không chứng minh toàn bộ nguyên nhân nóng máy và không dự đoán thời gian mở.

Bản 59 mở ngay màn hình tiến trình trước khi bắt đầu tải manifest; tái sử dụng
chính WebView đó để mở giao diện Flutter gốc. SHA-256 file dùng Web Crypto
trong WebView, có kiểm tra khả dụng và timeout; fallback JS nhường event loop
mỗi 64 KiB và kiểm tra hủy. Chỉ encode/đọc mỗi file một lần cho mỗi phép kiểm.
Có Hủy, khóa chống hai lượt chuẩn bị đồng thời, tiếp tục từ file hợp lệ đã tải
và dùng lại file gói cũ sau xác minh hash. Không bỏ font, ảnh hoặc chức năng để
giảm dung lượng. Gói hoàn chỉnh mới thay pointer đang dùng; file sai hash bị
chặn. Diagnostics cục bộ ghi build, tên script thực chạy, bước, backend và
thời gian, không ghi thông tin đăng nhập hoặc lịch học.

Kiểm tra bắt buộc: Node test cả startup/cancel/resume/corruption/rollback;
Chromium + WebKit kiểm tra Web Crypto thực với dữ liệu nhị phân 0/256/8 MiB,
UI tiến trình và Hủy, sau đó chạy lại toàn bộ QA giao diện Flutter/worker.
Còn cần test trên iPhone: thời gian tới màn hình tiến trình và đăng nhập,
Hủy/chạy lại, quay lại lần hai từ cache, nóng máy và ổn định khi đổi app.
Dùng đúng script BPA bản 59; không xóa dữ liệu Scriptable để nâng bản.

## Bản thử nghiệm 60 — chia khối xử lý tài nguyên WebView

Đối chiếu manifest 58: tổng 128.277.994 byte, JS 4.183.586 byte (main.dart.js
3.418.454 byte), PNG 83.579.468 byte. Không đưa toàn bộ 128 MB vào một đối tượng
JS: font, ảnh, WASM chỉ đọc lúc Flutter yêu cầu. Tuy nhiên host cũ gửi từng file
nguyên chuỗi base64 sang WebView; receiver dùng Uint8Array.from(atob(...)), có
chuỗi nhị phân và thao tác lặp từng ký tự toàn file. Đây là điểm xử lý CPU/bộ
nhớ riêng với vấn đề download và hash.

Bản 60 chia mỗi lần evaluateJavaScript truyền asset tối đa 262.144 ký tự base64
(tương ứng 196.608 byte nhị phân). Receiver giải mã từng khối bằng vòng lặp
vào một Uint8Array cuối cùng, kiểm tra offset/size/final; host nhường event loop
sau mỗi khối và dừng khi đổi/đóng màn hình. Cùng đường truyền dùng cho worker.
Yêu cầu trùng đường dẫn đang chạy được gộp, kết quả không giữ cache JS lâu dài.
File WASM 7.284.602 byte: payload mỗi lượt giảm khoảng 97,3%; không phải tuyên
bố giảm 97,3% tổng RAM/CPU/nhiệt độ. Scriptable Data không cung cấp ranged-read:
vẫn phải đọc/encode cả một file ở phía native, nhưng không chuyển/giải mã toàn
chuỗi đó trong một lần ở WebView. Code Flutter 3,42 MB giữ nguyên compile để
bảo toàn hoạt động; không cắt code JS tùy tiện. Tài nguyên đầy đủ giữ trên đĩa.

Node tests kiểm tra byte parity 0/196.609/7.284.602 byte, kích thước mỗi khối,
yêu cầu trùng, sai offset và cancellation. Browser QA chuyển các resource của
Flutter thật theo cùng giao thức chunk trong Chromium/WebKit, kiểm tra cả login,
ảnh/theme, card VFX và worker lưu/reopen. Hiệu năng và nhiệt độ iPhone vẫn cần
đo trên thiết bị thật. Bản 60 bao gồm toàn bộ sửa startup của bản 59.

## Bản thử nghiệm 61 — sửa định dạng code khi import

Phản hồi mới xác định Scriptable đứng ngay khi chia sẻ/import file, trước khi
màn hình BPA xuất hiện; điện thoại không đơ toàn hệ thống. Chưa có cơ sở gán
lần lỗi này cho xử lý 128 MB hoặc Flutter. Source 60 có một dòng nhúng Shortcut
dài 98.919 ký tự. Bản 61 chia literal dài thành các chuỗi 120 ký tự ghép lại,
trình bày object nhiều dòng; longest line 1.054 ký tự. Signed binary và các
portal script không đổi byte. Node kiểm tra import envelope/source/line limit
và hash từng signed Shortcut. Đây là loại bỏ một nghi phạm ở bước editor/import,
không phải bằng chứng đã xác nhận hoặc chữa hết lỗi trên iPhone. Không xóa dữ
liệu/app Scriptable để thử bản sửa.
