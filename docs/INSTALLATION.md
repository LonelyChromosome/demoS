# Cài BPA iPhone

Mục tiêu là một link TestFlight → cài BPA. App chứa cả ba widget, không cần
Scriptable, nhập script hoặc tạo Shortcuts Automation. Chưa có link TestFlight hoạt động.

Thiết lập phân phối một lần cho người quản lý dự án:

- App IDs: `vn.edu.phenikaa.bpa`, `vn.edu.phenikaa.bpa.widgets`.
- App Group chung: `group.vn.edu.phenikaa.bpa`.
- Runner có NFC Tag Reader entitlement `TAG`.
- App Store Connect có ứng dụng trùng Bundle ID của Runner.
- GitHub secrets: `APPLE_TEAM_ID`, `IOS_DISTRIBUTION_P12_BASE64`,
  `IOS_DISTRIBUTION_P12_PASSWORD`, `IOS_RUNNER_PROFILE_BASE64`,
  `IOS_WIDGET_PROFILE_BASE64`, `APP_STORE_CONNECT_KEY_ID`,
  `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY_BASE64`.

Chứng chỉ/profile phải bao gồm App Group và NFC đúng app. Workflow kiểm tra chúng
trước khi build. Private key không được commit trong source.

Sau khi bản ký được tải lên và Apple cho phép phân phối: mở link TestFlight, cài
BPA, đăng nhập QLĐT. Nếu dùng widget, nhấn giữ Home Screen → thêm widget → Better
Phenikaa → chọn Widget nhỏ, Tổng quan hoặc Widget 2; chúng lấy dữ liệu/theme từ app.

IPA unsigned không cài được như app iPhone bình thường. Chưa xác minh đường cài
miễn phí đáp ứng đủ NFC, App Group và ba widget; không dùng web/PWA để giả đạt yêu cầu.
