import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
    private var platform: BPAPlatform?
    private var pendingURL: URL?
    func receiveWidgetURL(_ url: URL) {
        if let platform = platform { _ = platform.handleURL(url) } else { pendingURL = url }
    }
    func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
        GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
        platform = BPAPlatform(messenger: engineBridge.applicationRegistrar.messenger()) { [weak self] in
            let sceneWindow = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows).first { $0.isKeyWindow }
            var controller = sceneWindow?.rootViewController ?? self?.window?.rootViewController
            while let presented = controller?.presentedViewController { controller = presented }
            return controller
        }
        if let url = pendingURL { _ = platform?.handleURL(url); pendingURL = nil }
    }
}
