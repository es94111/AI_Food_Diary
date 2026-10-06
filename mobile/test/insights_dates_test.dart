import 'package:ai_food_mobile/utils/insights_dates.dart';
import 'package:ai_food_mobile/utils/metabolism.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('weekly navigation shifts by local calendar days', () {
    final selected = DateTime(2026, 3, 9);
    expect(
      isoDate(shiftInsightsDate(selected, monthly: false, amount: -1)),
      '2026-03-02',
    );
    expect(
      isoDate(shiftInsightsDate(selected, monthly: false, amount: 1)),
      '2026-03-16',
    );
  });

  test('monthly navigation handles year boundaries', () {
    expect(
      isoDate(shiftInsightsDate(DateTime(2026, 1, 14), monthly: true, amount: -1)),
      '2025-12-01',
    );
    expect(
      isoDate(shiftInsightsDate(DateTime(2026, 12, 20), monthly: true, amount: 1)),
      '2027-01-01',
    );
  });
}
