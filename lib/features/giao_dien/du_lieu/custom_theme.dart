import 'package:better_phenikaa_schedule/features/giao_dien/bo_may/theme_source.dart';
import 'package:better_phenikaa_schedule/features/giao_dien/bo_may/theme_tokens.dart';
import 'package:better_phenikaa_schedule/features/giao_dien/phong_chu/font_choice.dart';
import 'package:better_phenikaa_schedule/features/giao_dien/du_lieu/widget_theme_configuration.dart';
import 'package:flutter/foundation.dart';

@immutable
final class CustomThemeDefinition {
  const new({
    required this.id,
    required this.name,
    required this.source,
    required this.tokens,
    required this.font,
    required this.createdAt,
    required this.updatedAt,
    this.widgets = const WidgetThemeConfiguration(),
    this.hasWidgetConfiguration = true,
  });

  factory fromJson(Map<String, Object?> json) {
    final now = DateTime.now();
    return CustomThemeDefinition(
      id: json['id'] as String? ?? now.microsecondsSinceEpoch.toString(),
      name: json['name'] as String? ?? 'Theme tùy chỉnh',
      source: ThemeSourceData.fromJson(
        Map<String, Object?>.from(
          json['source'] as Map<Object?, Object?>? ?? const <String, Object?>{},
        ),
      ),
      tokens: ThemeTokens.fromJson(
        Map<String, Object?>.from(
          json['tokens'] as Map<Object?, Object?>? ?? const <String, Object?>{},
        ),
      ),
      font: AppFontChoice.fromJson(
        Map<String, Object?>.from(
          json['font'] as Map<Object?, Object?>? ?? const <String, Object?>{},
        ),
      ),
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ?? now,
      updatedAt: DateTime.tryParse(json['updatedAt'] as String? ?? '') ?? now,
      widgets: WidgetThemeConfiguration.fromJson(
        Map<String, Object?>.from(
          json['widgets'] as Map<Object?, Object?>? ??
              const <String, Object?>{},
        ),
      ),
      hasWidgetConfiguration: json.containsKey('widgets'),
    );
  }

  final String id;
  final String name;
  final ThemeSourceData source;
  final ThemeTokens tokens;
  final AppFontChoice font;
  final DateTime createdAt;
  final DateTime updatedAt;
  final WidgetThemeConfiguration widgets;
  final bool hasWidgetConfiguration;

  CustomThemeDefinition copyWith({
    String? name,
    ThemeSourceData? source,
    ThemeTokens? tokens,
    AppFontChoice? font,
    DateTime? updatedAt,
    WidgetThemeConfiguration? widgets,
    bool? hasWidgetConfiguration,
  }) => CustomThemeDefinition(
    id: id,
    name: name ?? this.name,
    source: source ?? this.source,
    tokens: tokens ?? this.tokens,
    font: font ?? this.font,
    createdAt: createdAt,
    updatedAt: updatedAt ?? this.updatedAt,
    widgets: widgets ?? this.widgets,
    hasWidgetConfiguration:
        hasWidgetConfiguration ?? this.hasWidgetConfiguration,
  );

  Map<String, Object?> toJson() => <String, Object?>{
    'id': id,
    'name': name,
    'source': source.toJson(),
    'tokens': tokens.toJson(),
    'font': font.toJson(),
    'createdAt': createdAt.toIso8601String(),
    'updatedAt': updatedAt.toIso8601String(),
    'widgets': widgets.toJson(),
  };
}
