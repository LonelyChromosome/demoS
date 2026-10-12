import UIKit
import CoreText

enum BPAWidgetRenderer {
    static func size(_ kind: String) -> CGSize { CGSize(width: 320, height: kind == "ScheduleWidgetProvider" ? 64 : 150) }
    static func color(_ number: Any?, fallback: UInt32) -> UIColor {
        let argb = (number as? NSNumber)?.uint32Value ?? fallback
        return UIColor(red: CGFloat((argb >> 16) & 255) / 255, green: CGFloat((argb >> 8) & 255) / 255, blue: CGFloat(argb & 255) / 255, alpha: CGFloat((argb >> 24) & 255) / 255)
    }
    static func font(_ size: CGFloat, bold: Bool = false) -> UIFont {
        let theme = BPAContract.defaults.dictionary(forKey: "widget.theme") ?? [:]
        if let path = theme["fontPath"] as? String, !path.isEmpty {
            let url = URL(fileURLWithPath: path)
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            if let descriptors = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor], let descriptor = descriptors.first,
               let name = CTFontDescriptorCopyAttribute(descriptor, kCTFontNameAttribute) as? String,
               let font = UIFont(name: name, size: size) { return font }
        }
        return bold ? UIFont.boldSystemFont(ofSize: size) : UIFont.systemFont(ofSize: size)
    }
    static func configuration() -> [String: Any] {
        let theme = BPAContract.defaults.dictionary(forKey: "widget.theme") ?? [:]
        guard let raw = theme["widgetConfig"] as? String, let bytes = raw.data(using: .utf8),
              let value = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { return [:] }
        return value
    }
    static func compactSubject(_ subject: String) -> String {
        if subject.count <= 14 { return subject }
        let words = subject.split(whereSeparator: { $0.isWhitespace }).filter { !["và", "cho", "của"].contains($0.lowercased()) }
        let acronym = words.compactMap { $0.first.map { String($0).uppercased() } }.joined()
        return acronym.isEmpty ? subject : acronym
    }
    static func image(_ kind: String, selection: BPASelection, snapshot: BPASnapshot?) -> UIImage {
        let size = Self.size(kind)
        let theme = BPAContract.defaults.dictionary(forKey: "widget.theme") ?? [:]
        let config = configuration()
        let small = kind == "ScheduleWidgetProvider", overview = kind == "OverviewWidgetProvider"
        let textColor = color(config[small ? "smallTextColor" : overview ? "largeTextColor" : "widget2TextColor"] ?? theme["widgetText"], fallback: 0xfff7f7fa)
        let subtext = color(theme["widgetSubtext"], fallback: 0xffb6bfd5)
        let format = UIGraphicsImageRendererFormat(); format.scale = 3
        return UIGraphicsImageRenderer(size: size, format: format).image { renderer in
            let context = renderer.cgContext
            let bounds = CGRect(origin: .zero, size: size)
            let radius = CGFloat((config["cornerRadiusDp"] as? NSNumber)?.doubleValue ?? 18)
            context.saveGState(); UIBezierPath(roundedRect: bounds, cornerRadius: radius).addClip()
            let start = color(theme["widgetStart"], fallback: 0xff322153), end = color(theme["widgetEnd"], fallback: 0xff992c71)
            if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: [start.cgColor, end.cgColor] as CFArray, locations: [0, 1]) {
                context.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: 320, y: size.height), options: [])
            }
            let parts = Calendar.current.dateComponents([.hour, .minute], from: Date())
            let minute = (parts.hour ?? 0) * 60 + (parts.minute ?? 0)
            let key = theme["theme"] as? String ?? "classic"
            if key == "tien_mon_premium", overview {
                let name = minute >= 1110 || minute < 300 ? "w_toi" : minute >= 990 ? "wid_chieu" : "wid_sang"
                if let url = Bundle.main.url(forResource: name, withExtension: "png", subdirectory: "WidgetAssets"), let image = UIImage(contentsOfFile: url.path) { image.draw(in: bounds) }
            }
            let path = config[overview ? "largeImagePath" : "widget2ImagePath"] as? String ?? ""
            var source = UIImage(contentsOfFile: path)
            if !small && !overview && path.isEmpty {
                let names = ["classic": "macdinh.png", "lol": "lol.jpg", "valorant": "vlr.jpg", "minecraft": "minecraft.jpg", "facebook": "facebooj.png", "shopee": "shoppee.png", "tiktok": "tiktok.png", "ben10": "ben10.png.webp", "youtube": "ytb.png", "steam": "steam.png"]
                let premium = minute >= 1110 || minute < 300 ? "tienmon-toi.png" : minute >= 990 ? "tinemon-trua.png" : "tienmon-sang.png"
                if let name = key == "tien_mon_premium" ? premium : names[key], let folder = Bundle.main.url(forResource: "WidgetAssets", withExtension: nil) {
                    source = UIImage(contentsOfFile: folder.appendingPathComponent("widget2_themes/\(name)").path)
                }
            }
            if !small, let image = source, image.size.width > 0, image.size.height > 0 {
                let box = overview ? bounds : CGRect(x: 228, y: 0, width: 92, height: 112)
                let scale = min(box.width / image.size.width, box.height / image.size.height)
                let fitted = CGSize(width: image.size.width * scale, height: image.size.height * scale)
                image.draw(in: CGRect(x: box.midX - fitted.width / 2, y: box.midY - fitted.height / 2, width: fitted.width, height: fitted.height))
            }
            func text(_ value: String, _ rect: CGRect, _ points: CGFloat, _ color: UIColor, _ bold: Bool = false) {
                let paragraph = NSMutableParagraphStyle(); paragraph.lineBreakMode = .byTruncatingTail
                (value as NSString).draw(in: rect, withAttributes: [.font: font(points, bold: bold), .foregroundColor: color, .paragraphStyle: paragraph])
            }
            let items = selection.lessons(snapshot)
            if small {
                let index = min(max(0, selection.start), max(0, items.count - 1))
                if let lesson = items.indices.contains(index) ? items[index] : nil {
                    text(lesson.time, CGRect(x: 39, y: 6, width: 223, height: 15), 12, textColor, true)
                    text(lesson.subjectName, CGRect(x: 39, y: 23, width: 223, height: 18), 13, textColor, true)
                    text(lesson.room, CGRect(x: 39, y: 43, width: 223, height: 15), 11, subtext)
                } else { text(selection.exam ? "Không có lịch thi" : "Hôm nay không có lịch học", CGRect(x: 39, y: 23, width: 223, height: 25), 13, textColor) }
            } else if overview {
                let top: CGFloat = 26
                text(selection.exam ? "LỊCH THI" : "LỊCH HỌC", CGRect(x: 46, y: top + 3, width: 164, height: 17), 14, textColor, true)
                text(selection.day, CGRect(x: 46, y: top + 20, width: 164, height: 12), 10, subtext)
                let first = min(max(0, selection.start), max(0, items.count - 4))
                for (slot, lesson) in items.dropFirst(first).prefix(4).enumerated() {
                    let x = CGFloat(12 + slot * 74), card = CGRect(x: CGFloat(12 + slot * 74), y: top + 42, width: 70, height: 53)
                    UIColor.white.withAlphaComponent(0.08).setFill(); UIBezierPath(roundedRect: card, cornerRadius: 6).fill()
                    text(String(lesson.startAt.dropFirst(11).prefix(5)), CGRect(x: x + 8, y: card.minY + 3, width: 57, height: 21), 17, textColor, true)
                    text(compactSubject(lesson.subjectName), CGRect(x: x + 8, y: card.minY + 23, width: 57, height: 15), 11, textColor, true)
                    text(selection.exam ? "\(lesson.dateKey) · \(lesson.room)" : lesson.room, CGRect(x: x + 4, y: card.minY + 35, width: 62, height: 11), 9, subtext)
                }
                if items.isEmpty { text(selection.exam ? "Không có lịch thi" : "Hôm nay không có lịch học", CGRect(x: 50, y: top + 45, width: 220, height: 20), 13, textColor) }
                text(items.isEmpty ? "" : "\(first + 1)–\(min(first + 4, items.count))/\(items.count)", CGRect(x: 130, y: 133, width: 85, height: 14), 10, subtext)
            } else {
                text(selection.exam ? "LỊCH THI" : "LỊCH HỌC", CGRect(x: 12, y: 7, width: 190, height: 25), 14, textColor, true)
                let height: CGFloat = ((150 - 32 - 7) - 2.6 * 4) / 5
                for index in 0..<5 {
                    let rect = CGRect(x: 8, y: 32 + CGFloat(index) * (height + 2.6), width: 204, height: height)
                    UIColor.white.withAlphaComponent(0.08).setFill(); UIBezierPath(roundedRect: rect, cornerRadius: 5).fill()
                    guard index < items.count else { continue }
                    let lesson = items[index], accents: [UInt32] = [0xffffb547, 0xff45d2b0, 0xff5fa8ff, 0xffa881ff, 0xffff78ae]
                    color(NSNumber(value: accents[index]), fallback: accents[index]).setFill()
                    UIBezierPath(roundedRect: CGRect(x: 8, y: rect.minY + 2, width: 3, height: rect.height - 4), cornerRadius: 3).fill()
                    text(lesson.subjectName, CGRect(x: 15, y: rect.minY + 1.3, width: 192, height: rect.height - 9.7), 9.5, textColor, true)
                    text("\(lesson.time) · \(lesson.room)", CGRect(x: 15, y: rect.maxY - 9, width: 192, height: 8.2), 6.7, subtext)
                }
                if items.isEmpty { text(selection.exam ? "Không có lịch thi" : "Hôm nay không có lịch học", CGRect(x: 12, y: 65, width: 190, height: 35), 13, textColor) }
            }
            let borderKey = small ? "smallBorder" : overview ? "largeBorder" : "widget2Border"
            if let border = config[borderKey] as? [String: Any], border["enabled"] as? Bool == true {
                let width = CGFloat((border["widthDp"] as? NSNumber)?.doubleValue ?? 1)
                color(border["color"], fallback: 0xffffd66b).setStroke()
                let outline = UIBezierPath(roundedRect: bounds.insetBy(dx: width / 2, dy: width / 2), cornerRadius: max(0, radius - width / 2)); outline.lineWidth = width; outline.stroke()
            }
            context.restoreGState()
        }
    }
}
