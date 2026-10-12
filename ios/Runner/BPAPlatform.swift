import Flutter
import UIKit
import WidgetKit
import UniformTypeIdentifiers
import UserNotifications

final class BPAPlatform: NSObject, UIDocumentPickerDelegate {
    private let messenger: FlutterBinaryMessenger
    private let presenter: () -> UIViewController?
    private var channels: [FlutterMethodChannel] = []
    private var runtimeChannel: FlutterMethodChannel?
    private var reader: CardReader!
    private var background: UIBackgroundTaskIdentifier = .invalid
    private var fileResult: FlutterResult?
    private var pendingAction: [String: String]?
    init(messenger: FlutterBinaryMessenger, presenter: @escaping () -> UIViewController?) {
        self.messenger = messenger; self.presenter = presenter
        super.init(); attach()
    }
    func handleURL(_ url: URL) -> Bool {
        guard url.scheme == "bpa", url.host == "widget",
              let kind = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "kind" })?.value,
              BPAContract.kinds.contains(kind), ["open", "calendar", "sync"].contains(url.lastPathComponent) else { return false }
        pendingAction = ["action": url.lastPathComponent, "kind": kind]; return true
    }
    private func channel(_ name: String, handler: @escaping (FlutterMethodCall, @escaping FlutterResult) -> Void) -> FlutterMethodChannel {
        let value = FlutterMethodChannel(name: "better_phenikaa/\(name)", binaryMessenger: messenger)
        value.setMethodCallHandler(handler); channels.append(value); return value
    }
    private func failure(_ result: FlutterResult, _ error: Error) {
        result(FlutterError(code: "native_failed", message: error.localizedDescription, details: nil))
    }
    private func attach() {
        let update = channel("update") { [weak self] call, result in
            guard let self = self else { return }
            switch call.method {
            case "versionCode": result(Int(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "51") ?? 51)
            case "versionName": result("cooc.1.6")
            case "installStatus": result("idle")
            case "hasBoundCard": result(self.reader.hasBinding)
            case "startBindCard", "startCard":
                if call.method == "startBindCard" && self.reader.hasBinding {
                    result(FlutterError(code: "already_bound", message: "Thẻ đã được liên kết.", details: nil)); return
                }
                do { try self.reader.start(binding: call.method == "startBindCard"); result(nil) }
                catch { result(FlutterError(code: "nfc_unavailable", message: error.localizedDescription, details: nil)) }
            case "stopCard": self.reader.stop(); result(nil)
            case "removeBoundCard":
                do { self.reader.stop(); try SecureStore.clear("bound-card-uid"); result(nil) } catch { self.failure(result, error) }
            case "canInstall": result(false)
            case "downloadAndInstall", "installSettings": result(FlutterError(code: "ios_signing_required", message: "iOS cần bản cập nhật đã ký cho iPhone.", details: nil))
            case "cancel": self.reader.stop(); result(nil)
            default: result(FlutterMethodNotImplemented)
            }
        }
        reader = CardReader(channel: update)
        _ = channel("qldt_credentials") { [weak self] call, result in
            do {
                switch call.method {
                case "save":
                    guard let args = call.arguments as? [String: String], let user = args["username"], let password = args["password"] else {
                        result(FlutterError(code: "invalid_credentials", message: nil, details: nil)); return
                    }
                    try SecureStore.save("qldt-credentials", JSONSerialization.data(withJSONObject: ["username": user, "password": password])); result(nil)
                case "read": result(try SecureStore.read("qldt-credentials").map { try JSONSerialization.jsonObject(with: $0) })
                case "clear": try SecureStore.clear("qldt-credentials"); result(nil)
                default: result(FlutterMethodNotImplemented)
                }
            } catch { self?.failure(result, error) }
        }
        runtimeChannel = channel("ios_runtime") { [weak self] call, result in
            guard let self = self else { return }
            switch call.method {
            case "takeWidgetAction": result(self.pendingAction); self.pendingAction = nil
            case "selectWidgetDay":
                guard let args = call.arguments as? [String: String], let kind = args["kind"], BPAContract.kinds.contains(kind), let day = args["day"] else {
                    result(FlutterError(code: "invalid_selection", message: nil, details: nil)); return
                }
                var selection = BPASelection.read(kind); selection.day = day; selection.start = 0; selection.save(kind)
                WidgetCenter.shared.reloadTimelines(ofKind: kind); result(nil)
            case "beginSync":
                self.endSync()
                self.background = UIApplication.shared.beginBackgroundTask(withName: "BPA manual QLDT sync") { [weak self] in
                    self?.endSync(); self?.runtimeChannel?.invokeMethod("syncExpired", arguments: nil)
                }
                if self.background == .invalid { result(FlutterError(code: "background_unavailable", message: "iOS chưa cấp thời gian chạy nền.", details: nil)) } else { result(nil) }
            case "endSync": self.endSync(); result(nil)
            case "publishSnapshot": BPAContract.defaults.set(call.arguments as? String, forKey: BPAContract.snapshot); WidgetCenter.shared.reloadAllTimelines(); result(nil)
            case "refreshWidgets": WidgetCenter.shared.reloadAllTimelines(); result(nil)
            default: result(FlutterMethodNotImplemented)
            }
        }
        _ = channel("widget_theme") { call, result in
            guard call.method == "applyTheme", var args = call.arguments as? [String: Any] else { result(FlutterMethodNotImplemented); return }
            do {
                if let raw = args["widgetConfig"] as? String, let bytes = raw.data(using: .utf8), var config = try JSONSerialization.jsonObject(with: bytes) as? [String: Any] {
                    for key in ["largeImagePath", "widget2ImagePath"] {
                        if let path = config[key] as? String, !path.isEmpty { config[key] = try Self.sharedFile(path).path }
                    }
                    args["widgetConfig"] = String(data: try JSONSerialization.data(withJSONObject: config), encoding: .utf8)
                }
                if let path = args["fontPath"] as? String, !path.isEmpty { args["fontPath"] = try Self.sharedFile(path).path }
                BPAContract.defaults.set(args, forKey: "widget.theme"); WidgetCenter.shared.reloadAllTimelines(); result(3)
            } catch { result(FlutterError(code: "theme_failed", message: error.localizedDescription, details: nil)) }
        }
        _ = channel("daily_sync") { call, result in
            switch call.method {
            case "enable", "disable": result(nil) // No 06:00 scheduled sync.
            case "recordAppSyncSuccess": BPAContract.defaults.set(Int64(Date().timeIntervalSince1970 * 1000), forKey: "sync.lastSuccess"); result(nil)
            case "status": result(["lastSuccessAtMillis": BPAContract.defaults.integer(forKey: "sync.lastSuccess")])
            case "refreshWidgetToday":
                for kind in BPAContract.kinds { BPASelection(day: BPASelection.dateKey()).save(kind) }
                WidgetCenter.shared.reloadAllTimelines(); result(nil)
            case "examNotice": result(BPAContract.defaults.string(forKey: "exam.notice"))
            case "ackExamNotice": BPAContract.defaults.removeObject(forKey: "exam.notice"); result(nil)
            case "syncReminders": Self.syncReminders(result)
            case "clearReminders": UNUserNotificationCenter.current().getPendingNotificationRequests { requests in
                UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: requests.filter { $0.identifier.hasPrefix("bpa.exam.") }.map(\.identifier))
                DispatchQueue.main.async { result(nil) }
            }
            default: result(FlutterMethodNotImplemented)
            }
        }
        _ = channel("widget_session") { call, result in
            if call.method == "clear" { BPAContract.defaults.removeObject(forKey: BPAContract.snapshot); WidgetCenter.shared.reloadAllTimelines() }
            if ["clear", "invalidate"].contains(call.method) { result(nil) } else { result(FlutterMethodNotImplemented) }
        }
        _ = channel("local_files") { [weak self] call, result in
            guard let self = self, call.method == "pickFile", self.fileResult == nil else { result(FlutterError(code: "picker_busy", message: nil, details: nil)); return }
            let font = (call.arguments as? [String: Any])?["kind"] as? String == "font"
            let types: [UTType] = font ? [UTType(filenameExtension: "ttf") ?? .data, UTType(filenameExtension: "otf") ?? .data] : [.image]
            guard let presenter = self.presenter() else { result(FlutterError(code: "picker_unavailable", message: nil, details: nil)); return }
            self.fileResult = result
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: true); picker.delegate = self
            presenter.present(picker, animated: true)
        }
        _ = channel("widget_pin") { _, result in result(false) }
        _ = channel("study_alarm") { _, result in result(FlutterError(code: "clock_bridge_unverified", message: "Cầu báo thức iPhone chưa được xác minh.", details: nil)) }
    }
    private func endSync() {
        if background != .invalid { UIApplication.shared.endBackgroundTask(background); background = .invalid }
    }
    private static func sharedFile(_ path: String) throws -> URL {
        guard let container = BPAContract.container else { throw NSError(domain: "app_group_unavailable", code: 1) }
        let source = URL(fileURLWithPath: path)
        if source.path.hasPrefix(container.path + "/") { return source }
        let directory = container.appendingPathComponent("assets", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let destination = directory.appendingPathComponent(UUID().uuidString + "-" + source.lastPathComponent)
        try FileManager.default.copyItem(at: source, to: destination); return destination
    }
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { fileResult?(nil); fileResult = nil }
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        defer { fileResult = nil }
        guard let url = urls.first else { fileResult?(nil); return }
        do {
            let path = try Self.sharedFile(url.path)
            let size = try path.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            fileResult?(["path": path.path, "name": url.lastPathComponent, "size": size, "mimeType": UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"])
        } catch { fileResult?(FlutterError(code: "file_failed", message: error.localizedDescription, details: nil)) }
    }
    private static func syncReminders(_ result: @escaping FlutterResult) {
        let center = UNUserNotificationCenter.current()
        center.getPendingNotificationRequests { requests in
            center.removePendingNotificationRequests(withIdentifiers: requests.filter { $0.identifier.hasPrefix("bpa.exam.") }.map(\.identifier))
            center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
                if let error = error { DispatchQueue.main.async { result(FlutterError(code: "notification_failed", message: error.localizedDescription, details: nil)) }; return }
                guard granted else { DispatchQueue.main.async { result(nil) }; return }
                for exam in BPASnapshot.read()?.exams ?? [] {
                    let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.dateFormat = "yyyy-MM-dd"
                    guard let date = formatter.date(from: exam.dateKey) else { continue }
                    for days in [7, 3, 1] {
                        guard let day = Calendar.current.date(byAdding: .day, value: -days, to: date), let due = Calendar.current.date(bySettingHour: 9, minute: 0, second: 0, of: day), due > Date() else { continue }
                        let content = UNMutableNotificationContent(); content.title = "Lịch thi"; content.body = "\(exam.subjectName) · còn \(days) ngày"; content.sound = .default
                        let trigger = UNCalendarNotificationTrigger(dateMatching: Calendar.current.dateComponents([.year, .month, .day, .hour, .minute], from: due), repeats: false)
                        center.add(UNNotificationRequest(identifier: "bpa.exam.\(exam.id).\(days)", content: content, trigger: trigger))
                    }
                }
                DispatchQueue.main.async { result(nil) }
            }
        }
    }
}
