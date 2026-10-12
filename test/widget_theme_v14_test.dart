import 'package:better_phenikaa_schedule/app/bpa_pen_trace_splash.dart';
import 'package:better_phenikaa_schedule/features/giao_dien/du_lieu/custom_theme.dart';
import 'package:better_phenikaa_schedule/features/giao_dien/du_lieu/widget_theme_configuration.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Widget Theme Engine 1.4', () {
    test('legacy themes migrate with safe no-image defaults', () {
      final config = WidgetThemeConfiguration.fromJson(
        const <String, Object?>{},
      );
      expect(config.largeImagePath, isEmpty);
      expect(config.widget2ImagePath, isEmpty);
      expect(config.smallBorder.enabled, isFalse);
      expect(config.largeBorder.enabled, isFalse);
      expect(config.widget2Border.enabled, isFalse);
    });

    test(
      'legacy custom theme is marked so applying it preserves widget photos',
      () {
        final theme = CustomThemeDefinition.fromJson(const <String, Object?>{});
        expect(theme.hasWidgetConfiguration, isFalse);
      },
    );

    test('three borders remain independent after JSON round trip', () {
      const source = WidgetThemeConfiguration(
        largeImagePath: '/managed/large.jpg',
        widget2ImagePath: '/managed/widget2.jpg',
        cornerRadius: 24,
        smallBorder: WidgetBorderDefinition(
          enabled: true,
          color: Color(0xFF112233),
          width: 1.5,
        ),
        largeBorder: WidgetBorderDefinition(
          enabled: true,
          color: Color(0xFF445566),
          width: 3,
          tienMonStyle: true,
        ),
        widget2Border: WidgetBorderDefinition(
          color: Color(0xFF778899),
          width: 6,
        ),
      );
      final restored = WidgetThemeConfiguration.fromJson(source.toJson());
      expect(restored.largeImagePath, source.largeImagePath);
      expect(restored.widget2ImagePath, source.widget2ImagePath);
      expect(restored.smallBorder.color, const Color(0xFF112233));
      expect(restored.largeBorder.tienMonStyle, isTrue);
      expect(restored.widget2Border.enabled, isFalse);
      expect(restored.widget2Border.width, 6);
      expect(restored.cornerRadius, 24);
    });

    test('widget text colors persist separately and can reset', () {
      final config = const WidgetThemeConfiguration()
          .withTextColor(WidgetSurfaceKind.small, const Color(0xFFEDB873))
          .withTextColor(WidgetSurfaceKind.large, const Color(0xFFEFF7FF))
          .withTextColor(WidgetSurfaceKind.widget2, const Color(0xFF28F4CC));
      final restored = WidgetThemeConfiguration.fromJson(config.toJson());
      expect(restored.textColorFor(WidgetSurfaceKind.small), const Color(0xFFEDB873));
      expect(restored.textColorFor(WidgetSurfaceKind.large), const Color(0xFFEFF7FF));
      expect(restored.textColorFor(WidgetSurfaceKind.widget2), const Color(0xFF28F4CC));

      final changed = restored.withTextColor(WidgetSurfaceKind.large, null);
      expect(changed.textColorFor(WidgetSurfaceKind.large), isNull);
      expect(changed.textColorFor(WidgetSurfaceKind.small), const Color(0xFFEDB873));
      expect(changed.textColorFor(WidgetSurfaceKind.widget2), const Color(0xFF28F4CC));
      expect(WidgetThemeConfiguration.fromJson(const <String, Object?>{})
          .textColorFor(WidgetSurfaceKind.widget2), isNull);
    });

    test('BPA source keeps six sequential strokes and 850 ms drawing', () {
      expect(BpaPenTracePainter.buildPaths(), hasLength(6));
      expect(BpaPenTracePainter.segmentTimes.first, 0);
      expect(BpaPenTracePainter.segmentTimes.last, 850);
      expect(
        BpaPenTracePainter.segmentTimes,
        orderedEquals(<double>[0, 300, 510, 725, 770, 810, 850]),
      );
    });
  });
}
