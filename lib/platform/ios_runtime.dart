import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'bpa_channel.dart';

abstract final class IosRuntime {
  static const appGroup = 'group.vn.edu.phenikaa.bpa';
  static const _channel = BpaChannel('better_phenikaa/ios_runtime');
  static VoidCallback? onSyncExpired;
  static bool get supported => scriptableAvailable || (!kIsWeb && defaultTargetPlatform == TargetPlatform.iOS);
  static Future<void> beginSync() async {
    if (!supported) return;
    _channel.setMethodCallHandler((call) async {
      if (call.method == 'syncExpired') onSyncExpired?.call();
    });
    await _channel.invokeMethod<void>('beginSync');
  }
  static Future<void> endSync() async {
    if (supported) await _channel.invokeMethod<void>('endSync');
  }
  static Future<void> publish(String? snapshot) async {
    if (supported) await _channel.invokeMethod<void>('publishSnapshot', snapshot);
  }
  static Future<void> refreshWidgets() async {
    if (supported) await _channel.invokeMethod<void>('refreshWidgets');
  }
  static Future<Map<String, String>?> takeWidgetAction() async {
    if (!supported) return null;
    return await _channel.invokeMapMethod<String, String>('takeWidgetAction');
  }
  static Future<void> selectWidgetDay(String kind, DateTime date) async {
    if (!supported) return;
    String two(int value) => value.toString().padLeft(2, '0');
    await _channel.invokeMethod<void>('selectWidgetDay', <String, String>{
      'kind': kind, 'day': '${date.year}-${two(date.month)}-${two(date.day)}',
    });
  }
}
