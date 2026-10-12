import Foundation

enum BPAContract {
    static let group = "group.vn.edu.phenikaa.bpa"
    static let snapshot = "better_phenikaa_widget_snapshot_v1"
    static let kinds = ["ScheduleWidgetProvider", "OverviewWidgetProvider", "Widget2Provider"]
    static var defaults: UserDefaults { UserDefaults(suiteName: group)! }
    static var container: URL? { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) }
}
struct BPALesson: Decodable, Identifiable {
    let id: String
    let subjectName: String
    let room: String
    let startAt: String
    let endAt: String
    var dateKey: String { String(startAt.prefix(10)) }
    var time: String { "\(startAt.dropFirst(11).prefix(5))–\(endAt.dropFirst(11).prefix(5))" }
}
struct BPASnapshot: Decodable {
    let schemaVersion: Int
    let classes: [BPALesson]
    let exams: [BPALesson]
    static func read() -> Self? {
        guard let raw = BPAContract.defaults.string(forKey: BPAContract.snapshot),
              let bytes = raw.data(using: .utf8),
              let value = try? JSONDecoder().decode(Self.self, from: bytes), value.schemaVersion == 1 else { return nil }
        return value
    }
}
struct BPASelection: Codable {
    var day: String
    var exam = false
    var start = 0
    static func dateKey(_ date: Date = Date()) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
    static func read(_ kind: String) -> Self {
        guard let bytes = BPAContract.defaults.data(forKey: "selection.\(kind)"),
              let value = try? JSONDecoder().decode(Self.self, from: bytes) else { return Self(day: dateKey()) }
        return value
    }
    func save(_ kind: String) { BPAContract.defaults.set(try? JSONEncoder().encode(self), forKey: "selection.\(kind)") }
    func lessons(_ snapshot: BPASnapshot?) -> [BPALesson] {
        let source = exam ? (snapshot?.exams ?? []) : (snapshot?.classes ?? [])
        return source.filter { exam ? $0.dateKey >= Self.dateKey() : $0.dateKey == day }
            .sorted { $0.startAt == $1.startAt ? $0.id < $1.id : $0.startAt < $1.startAt }
    }
    mutating func move(_ direction: Int, kind: String, count: Int) {
        let last = max(0, count - (kind == "OverviewWidgetProvider" ? 4 : 1))
        start = min(max(0, start), last)
        if kind == "OverviewWidgetProvider" {
            // Exact OverviewWindow.withinDay behavior; do not fix Android edge cases here.
            if direction > 0 && start < last { start = last; return }
            if direction < 0 && start > 0 { start = 0; return }
        } else if kind == "ScheduleWidgetProvider" {
            let next = start + direction
            if next >= 0 && next < count { start = next; return }
        }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        guard let date = formatter.date(from: day),
              let next = Calendar.current.date(byAdding: .day, value: direction, to: date) else { return }
        day = Self.dateKey(next); start = 0
    }
}
