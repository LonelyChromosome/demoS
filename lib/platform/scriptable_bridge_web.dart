// ignore_for_file: avoid_web_libraries_in_flutter, deprecated_member_use
import 'dart:async';
import 'dart:convert';
import 'dart:html' as html;
import 'package:flutter/services.dart';

bool get available => html.document.documentElement?.dataset['bpaScriptable'] == 'ready';
bool get loginResuming => available && html.document.documentElement?.dataset['bpaLoginResume'] == 'true';
bool get syncWorker => available && html.document.documentElement?.dataset['bpaSyncWorker'] == 'true';
int _sequence = 0;
final _handlers = <String, Future<dynamic> Function(MethodCall)>{};
bool _listening = false;

void _listen() {
  if (_listening) return;
  _listening = true;
  html.window.addEventListener('bpa-native-event', (event) {
    if (event is! html.CustomEvent) return;
    final raw = jsonDecode(event.detail.toString()) as Map<String, dynamic>;
    final handler = _handlers[raw['channel']];
    if (handler != null) unawaited(handler(MethodCall(raw['method'] as String, raw['arguments'])));
  });
}
void setHandler(String channel, Future<dynamic> Function(MethodCall)? handler) {
  _listen();
  if (handler == null) { _handlers.remove(channel); } else { _handlers[channel] = handler; }
}
Future<dynamic> invoke(String channel, String method, dynamic arguments) async {
  _listen();
  final id = ++_sequence, completer = Completer<dynamic>();
  void receive(html.Event event) {
    if (event is! html.CustomEvent) return;
    final raw = jsonDecode(event.detail.toString()) as Map<String, dynamic>;
    if (raw['id'] != id || completer.isCompleted) return;
    if (raw['error'] is Map) {
      final error = raw['error'] as Map;
      completer.completeError(PlatformException(code: error['code']?.toString() ?? 'scriptable_error', message: error['message']?.toString()));
    } else { completer.complete(raw['result']); }
  }
  html.window.addEventListener('bpa-platform-result', receive);
  try {
    html.window.dispatchEvent(html.CustomEvent('bpa-platform-call', detail: jsonEncode({'id':id,'channel':channel,'method':method,'arguments':arguments})));
    final timeout = channel == 'better_phenikaa/qldt_scriptable' && method == 'sync'
        ? const Duration(minutes: 22) : const Duration(seconds: 120);
    return await completer.future.timeout(timeout);
  } finally { html.window.removeEventListener('bpa-platform-result', receive); }
}
