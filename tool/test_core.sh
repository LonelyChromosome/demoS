#!/usr/bin/env bash
set -euo pipefail
exec flutter test --timeout=45s \
  test/alarm_test_fixture_test.dart test/study_alarm_card_test.dart \
  test/tracuu_api_test.dart test/qldt_parser_test.dart test/registration_parser_test.dart \
  test/semester_data_test.dart test/semester_retention_test.dart \
  test/semester_schedule_range_test.dart test/semester_schedule_verifier_test.dart \
  test/semester_sync_test.dart test/semester_changes_test.dart \
  test/widget_theme_v14_test.dart test/theme_engine_test.dart \
  test/tien_mon_premium_contract_test.dart test/tien_mon_premium_state_test.dart
