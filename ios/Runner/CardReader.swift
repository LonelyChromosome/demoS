import CoreNFC
import Flutter

final class CardReader: NSObject, NFCTagReaderSessionDelegate {
    private var session: NFCTagReaderSession?
    private var binding = false
    private var accepted = false
    private let channel: FlutterMethodChannel
    init(channel: FlutterMethodChannel) { self.channel = channel }
    var hasBinding: Bool { SecureStore.read("bound-card-uid") != nil }
    func start(binding: Bool) throws {
        guard NFCTagReaderSession.readingAvailable else { throw NSError(domain: "nfc_unavailable", code: 1) }
        stop(); self.binding = binding; accepted = false
        session = NFCTagReaderSession(pollingOption: [.iso14443, .iso15693], delegate: self, queue: nil)
        session?.alertMessage = "Đưa thẻ sinh viên lại gần iPhone."
        session?.begin()
    }
    func stop() { let previous = session; session = nil; previous?.invalidate() }
    private func event(_ type: String) { DispatchQueue.main.async { self.channel.invokeMethod("event", arguments: ["type": type]) } }
    func tagReaderSessionDidBecomeActive(_ session: NFCTagReaderSession) {}
    func tagReaderSession(_ session: NFCTagReaderSession, didInvalidateWithError error: Error) {
        guard self.session === session else { return }
        if !accepted { event("cardError") }; self.session = nil
    }
    func tagReaderSession(_ session: NFCTagReaderSession, didDetect tags: [NFCTag]) {
        guard !accepted, tags.count == 1, let tag = tags.first else { session.restartPolling(); return }
        session.connect(to: tag) { error in
            guard error == nil else { self.event("cardError"); session.invalidate(); return }
            let uid: Data
            switch tag {
            case .miFare(let value): uid = value.identifier
            case .iso7816(let value): uid = value.identifier
            case .iso15693(let value): uid = value.identifier
            case .feliCa(let value): uid = value.currentIDm
            @unknown default: self.event("cardError"); session.invalidate(); return
            }
            guard !uid.isEmpty else { self.event("cardError"); session.invalidate(); return }
            do {
                if let saved = SecureStore.read("bound-card-uid") {
                    guard saved == uid else { self.event("wrongCard"); session.restartPolling(); return }
                } else { try SecureStore.save("bound-card-uid", uid) }
                self.accepted = true
                self.event(self.binding ? "cardBound" : "cardAccepted")
                session.invalidate()
            } catch { self.event("cardError"); session.invalidate() }
        }
    }
}
