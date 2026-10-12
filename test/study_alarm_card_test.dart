import 'package:better_phenikaa_schedule/features/lich_hoc/study_alarm_card.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('native Clock label is only the course name without prefixes or IDs', () {
    expect(
      studyAlarmClockLabel('Lập trình thiết bị di động'),
      'Lập trình thiết bị di động',
    );
    expect(
      studyAlarmClockLabel('[TEST 1.6] Phân tích thiết kế hệ thống'),
      'Phân tích thiết kế hệ thống',
    );
    expect(
      studyAlarmClockLabel('  Cơ sở dữ liệu  '),
      'Cơ sở dữ liệu',
    );
    expect(
      studyAlarmClockLabel('Tên môn ' + List<String>.filled(150, 'A').join()).length,
      120,
    );
  });

  test('alarm action uses a strict rolling 24-hour window', () {
    final classStart = DateTime(2026, 10, 12, 9, 30);
    expect(studyAlarmCanOpen(classStart, DateTime(2026, 10, 11, 9, 29)), isFalse);
    expect(studyAlarmCanOpen(classStart, DateTime(2026, 10, 11, 9, 30)), isFalse);
    expect(studyAlarmCanOpen(classStart, DateTime(2026, 10, 11, 9, 30, 1)), isTrue);
    expect(studyAlarmCanOpen(classStart, DateTime(2026, 10, 12, 1)), isTrue);
    expect(studyAlarmCanOpen(classStart, DateTime(2026, 10, 12, 3, 39)), isTrue);
    expect(studyAlarmCanOpen(classStart, classStart), isFalse);
    expect(studyAlarmCanOpen(classStart, DateTime(2026, 10, 12, 10)), isFalse);
  });

  test('setting an alarm after midnight for class later that morning works', () {
    final classStart = DateTime(2026, 10, 12, 9, 30);
    final now = DateTime(2026, 10, 12, 1);
    expect(studyAlarmValidation(classStart, now, 8, 30), isNull);
    expect(studyAlarmValidation(classStart, now, 0, 59), contains('đã qua'));
    expect(studyAlarmValidation(classStart, now, 1, 0), contains('đã qua'));
    expect(studyAlarmValidation(classStart, now, 9, 30), contains('trước giờ học'));
  });

  test('picker starts exactly at class time and requires scrolling back', () {
    final s = DateTime(2026, 10, 11, 9, 30);
    expect(studyAlarmDefaultHour(s), 9);
    expect(studyAlarmDefaultMinute(s), 30);
    final now = DateTime(2026, 10, 10, 19);
    expect(studyAlarmValidation(s, now, 9, 30), contains('trước giờ học'));
    expect(studyAlarmValidation(s, now, 9, 29), isNull);
    expect(studyAlarmValidation(s, now, 8, 59), isNull);
    expect(studyAlarmValidation(s, now, 10, 0), contains('trước giờ học'));
    expect(studyAlarmOccurrence(s, 9, 29), DateTime(2026, 10, 11, 9, 29));
  });

  test('date rules work across year/month boundaries', () {
    final s = DateTime(2027, 1, 1, 9, 30);
    expect(studyAlarmCanOpen(s, DateTime(2026, 12, 31, 10)), isTrue);
    expect(studyAlarmValidation(s, DateTime(2026, 12, 31, 10), 9, 29), isNull);
  });

  test('midnight class also falls within the rolling window', () {
    final s = DateTime(2026, 10, 11, 0, 0);
    expect(studyAlarmCanOpen(s, DateTime(2026, 10, 10, 18)), isTrue);
  });
}
