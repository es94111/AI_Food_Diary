import 'package:flutter_test/flutter_test.dart';
import 'package:ai_food_mobile/models/insights.dart';

void main() {
  test('parses daily nutrition and weight points from the shared API shape', () {
    final snapshot = InsightsSnapshot.fromJson({
      'period': 'week',
      'startDate': '2026-10-05',
      'endDateExclusive': '2026-10-12',
      'targetCalories': 1950,
      'days': [
        {
          'date': '2026-10-05',
          'calories': 420.5,
          'protein': 22,
          'fat': 12,
          'carbs': 55.5,
          'mealCount': 2,
        }
      ],
      'weightPoints': [
        {'at': '2026-10-05T09:00:00.000Z', 'value': 63.2}
      ],
    });

    expect(snapshot.period, 'week');
    expect(snapshot.targetCalories, 1950);
    expect(snapshot.days.single.calories, 420.5);
    expect(snapshot.days.single.mealCount, 2);
    expect(snapshot.weightPoints.single.value, 63.2);
  });

  test('missing collections produce empty states instead of parse failures', () {
    final snapshot = InsightsSnapshot.fromJson({
      'period': 'month',
      'startDate': '2026-10-01',
      'endDateExclusive': '2026-11-01',
    });

    expect(snapshot.days, isEmpty);
    expect(snapshot.weightPoints, isEmpty);
    expect(snapshot.targetCalories, 0);
  });
}
