import 'dart:convert';

import 'package:better_phenikaa_schedule/features/app_update/update_controller.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('better_phenikaa/update');

  test(
    'cached update survives restart; repeated NFC taps start once',
    () async {
      SharedPreferences.setMockInitialValues({
        'app_update_notice_v1': jsonEncode({
          'versionCode': 29,
          'versionName': 'cooc.1.2',
          'notes': 'Bản mới',
          'publishedAt': '2026-10-07T13:00:00Z',
        }),
      });
      var starts = 0;
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, (call) async {
            if (call.method == 'versionCode') return 28;
            if (call.method == 'startCard') starts++;
            return null;
          });
      final controller = UpdateController();
      await controller.restore();
      expect(controller.notice?.versionName, 'cooc.1.2');
      await controller.startCard();
      await controller.startCard();
      expect(starts, 1);
      await controller.cancel();
      controller.dispose();
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, null);
    },
  );
}
