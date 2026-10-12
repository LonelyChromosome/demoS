import 'package:flutter/services.dart';
bool get available => false;
bool get loginResuming => false;
Future<dynamic> invoke(String channel, String method, dynamic arguments) =>
    Future<dynamic>.error(MissingPluginException('Scriptable is not available'));
void setHandler(String channel, Future<dynamic> Function(MethodCall)? handler) {}
