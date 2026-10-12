import AppIntents
import SwiftUI
import WidgetKit

struct BPAWidgetAction: AppIntent {
    static var title: LocalizedStringResource = "Điều khiển lịch BPA"
    @Parameter(title: "Widget") var kind: String
    @Parameter(title: "Thao tác") var action: String
    init() {}
    init(kind: String, action: String) { self.kind = kind; self.action = action }
    func perform() async throws -> some IntentResult {
        guard BPAContract.kinds.contains(kind) else { return .result() }
        var selection = BPASelection.read(kind)
        switch action {
        case "previous", "next": selection.move(action == "next" ? 1 : -1, kind: kind, count: selection.lessons(BPASnapshot.read()).count)
        case "mode": selection.exam.toggle(); selection.start = 0
        default: return .result()
        }
        selection.save(kind); WidgetCenter.shared.reloadTimelines(ofKind: kind); return .result()
    }
}
struct BPAEntry: TimelineEntry {
    let date: Date
    let kind: String
    let selection: BPASelection
    let snapshot: BPASnapshot?
}
struct BPAProvider: TimelineProvider {
    let kind: String
    func placeholder(in context: Context) -> BPAEntry { current() }
    func getSnapshot(in context: Context, completion: @escaping (BPAEntry) -> Void) { completion(current()) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<BPAEntry>) -> Void) {
        let now = Date(), midnight = Calendar.current.startOfDay(for: Date()).addingTimeInterval(86400)
        let transitions = [300, 990, 1110].compactMap { Calendar.current.date(bySettingHour: $0 / 60, minute: $0 % 60, second: 0, of: now) }.filter { $0 > now }
        completion(Timeline(entries: [current()], policy: .after(min(transitions.min() ?? midnight, midnight))))
    }
    private func current() -> BPAEntry { BPAEntry(date: Date(), kind: kind, selection: BPASelection.read(kind), snapshot: BPASnapshot.read()) }
}
struct BPAWidgetView: View {
    let entry: BPAEntry
    private func url(_ action: String) -> URL { URL(string: "bpa://widget/\(action)?kind=\(entry.kind)")! }
    private func button(_ action: String, _ symbol: String, _ x: CGFloat, _ y: CGFloat, _ width: CGFloat, _ height: CGFloat) -> some View {
        Button(intent: BPAWidgetAction(kind: entry.kind, action: action)) { Image(systemName: symbol).font(.system(size: 15)).frame(width: width, height: height) }
            .buttonStyle(.plain).position(x: x + width / 2, y: y + height / 2)
    }
    private func link(_ action: String, _ symbol: String, _ x: CGFloat, _ y: CGFloat, _ width: CGFloat, _ height: CGFloat) -> some View {
        Link(destination: url(action)) { Image(systemName: symbol).font(.system(size: 15)).frame(width: width, height: height) }.position(x: x + width / 2, y: y + height / 2)
    }
    var body: some View {
        GeometryReader { host in
            let size = BPAWidgetRenderer.size(entry.kind), scale = min(host.size.width / BPAWidgetRenderer.size(entry.kind).width, host.size.height / BPAWidgetRenderer.size(entry.kind).height)
            ZStack(alignment: .topLeading) {
                Image(uiImage: BPAWidgetRenderer.image(entry.kind, selection: entry.selection, snapshot: entry.snapshot)).resizable().frame(width: size.width, height: size.height)
                if entry.kind == "OverviewWidgetProvider" {
                    link("calendar", "calendar", 215, 32, 31, 36)
                    link("sync", "arrow.clockwise", 246, 32, 31, 36)
                    button("mode", entry.selection.exam ? "book" : "bell", 277, 32, 31, 36)
                    button("previous", "chevron.left", 12, 132, 40, 16)
                    button("next", "chevron.right", 268, 132, 40, 16)
                } else if entry.kind == "Widget2Provider" {
                    button("previous", "chevron.up", 200, 37, 28, 38)
                    button("next", "chevron.down", 200, 75, 28, 38)
                    link("calendar", "calendar", 224, 111, 28, 34)
                    link("sync", "arrow.clockwise", 252, 111, 28, 34)
                    button("mode", entry.selection.exam ? "book" : "bell", 280, 111, 28, 34)
                } else {
                    link("calendar", "calendar", 0, 0, 32, 21)
                    link("sync", "arrow.clockwise", 0, 21, 32, 21)
                    button("mode", entry.selection.exam ? "book" : "bell", 0, 42, 32, 22)
                    button("previous", "chevron.up", 281, 0, 32, 32)
                    button("next", "chevron.down", 281, 32, 32, 32)
                }
            }
            .foregroundStyle(Color(uiColor: BPAWidgetRenderer.color(BPAContract.defaults.dictionary(forKey: "widget.theme")?["widgetIcon"], fallback: 0xfff7f7fa)))
            .frame(width: size.width, height: size.height).scaleEffect(scale, anchor: .topLeading)
            .frame(width: size.width * scale, height: size.height * scale).position(x: host.size.width / 2, y: host.size.height / 2)
        }
        .widgetURL(url("open")).containerBackground(.clear, for: .widget)
    }
}
struct BPASmallWidget: Widget {
    let kind = "ScheduleWidgetProvider"
    var body: some WidgetConfiguration { StaticConfiguration(kind: kind, provider: BPAProvider(kind: kind)) { BPAWidgetView(entry: $0) }.configurationDisplayName("BPA · Widget nhỏ").description("Lịch học và lịch thi BPA.").supportedFamilies([.systemMedium]).contentMarginsDisabled() }
}
struct BPAOverviewWidget: Widget {
    let kind = "OverviewWidgetProvider"
    var body: some WidgetConfiguration { StaticConfiguration(kind: kind, provider: BPAProvider(kind: kind)) { BPAWidgetView(entry: $0) }.configurationDisplayName("BPA · Tổng quan").description("Bốn card theo bố cục BPA Android.").supportedFamilies([.systemMedium]).contentMarginsDisabled() }
}
struct BPASecondWidget: Widget {
    let kind = "Widget2Provider"
    var body: some WidgetConfiguration { StaticConfiguration(kind: kind, provider: BPAProvider(kind: kind)) { BPAWidgetView(entry: $0) }.configurationDisplayName("BPA · Widget 2").description("Lịch và ảnh theo bố cục BPA Android.").supportedFamilies([.systemMedium]).contentMarginsDisabled() }
}
@main struct BPAWidgets: WidgetBundle { var body: some Widget { BPASmallWidget(); BPAOverviewWidget(); BPASecondWidget() } }
