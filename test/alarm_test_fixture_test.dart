import 'package:better_phenikaa_schedule/features/lich_hoc/alarm_test_fixture.dart';
import 'package:better_phenikaa_schedule/features/lich_hoc/study_alarm_card.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('test cards are already eligible at 00:50, without bypassing date checks', () {
    final now = DateTime(2026, 10, 11, 0, 50);
    final data = withAlarmTestFixture(null, now);
    expect(data.classes.length, 3);
    for (final testClass in data.classes) {
      expect(testClass.subjectName, contains('[TEST 1.6]'));
      expect(studyAlarmIsTomorrow(testClass.startAt, now), isTrue);
      expect(studyAlarmCanOpen(testClass.startAt, now), isTrue);

      final selectedMinute = testClass.startAt.hour * 60 +
          testClass.startAt.minute - 1;
      final validation = studyAlarmValidation(
        testClass.startAt,
        now,
        selectedMinute ~/ 60,
        selectedMinute % 60,
      );
      expect(validation, isNull);
    }
    expect(data.records.map((r) => r.startAt.minute), [35, 45, 49]);
  });

  test('generated cards stay eligible at common daytime hours', () {
    final now = DateTime(2026, 10, 11, 19, 5);
    final data = withAlarmTestFixture(null, now);
    expect(data.classes.every((r) => studyAlarmCanOpen(r.startAt, now)), isTrue);
    expect(data.records.map((r) => r.startAt.hour), [18, 19, 19]);
  });

  test('before 00:01 no valid next-day one-off Clock time exists', () {
    final now = DateTime(2026, 10, 11);
    final data = withAlarmTestFixture(null, now);
    expect(data.records.every((r) => !studyAlarmCanOpen(r.startAt, now)), isTrue);
    expect(studyAlarmCanOpen(data.records.first.startAt,
        DateTime(2026, 10, 11, 0, 1)), isFalse);
    expect(studyAlarmCanOpen(data.records.first.startAt,
        DateTime(2026, 10, 11, 0, 1, 1)), isTrue);
  });

  test('fixture advances across year boundary without touching real data', () {
    final now = DateTime(2026, 12, 31, 23);
    final data = withAlarmTestFixture(null, now);
    expect(data.records.first.startAt, DateTime(2027, 1, 1, 22, 45));
    final next = withAlarmTestFixture(null, DateTime(2027, 1, 1, 0, 50));
    expect(next.records.first.startAt, DateTime(2027, 1, 2, 0, 35));
  });
}
