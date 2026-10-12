import 'package:flutter/services.dart';
import 'scriptable_bridge_stub.dart'
    if (dart.library.html) 'scriptable_bridge_web.dart' as bridge;

bool get scriptableAvailable => bridge.available;

/// Native channels keep their original implementation. In Scriptable, only
/// the platform transport is replaced; app widgets and controllers are reused.
class BpaChannel extends MethodChannel {
  const BpaChannel(super.name);

  @override
  Future<T?> invokeMethod<T>(String method, [dynamic arguments]) async {
    if (!bridge.available) return super.invokeMethod<T>(method, arguments);
    return await bridge.invoke(name, method, arguments) as T?;
  }

  @override
  void setMethodCallHandler(Future<dynamic> Function(MethodCall call)? handler) {
    if (!bridge.available) {
      super.setMethodCallHandler(handler);
      return;
    }
    bridge.setHandler(name, handler);
  }
}
