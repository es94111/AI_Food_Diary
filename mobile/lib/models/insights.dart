class InsightsSnapshot {
  final String period;
  final String startDate;
  final String endDateExclusive;
  final int targetCalories;
  final List<InsightDay> days;
  final List<InsightWeightPoint> weightPoints;

  const InsightsSnapshot({
    required this.period,
    required this.startDate,
    required this.endDateExclusive,
    required this.targetCalories,
    required this.days,
    required this.weightPoints,
  });

  factory InsightsSnapshot.fromJson(Map<String, dynamic> json) =>
      InsightsSnapshot(
        period: json['period'] as String? ?? 'week',
        startDate: json['startDate'] as String? ?? '',
        endDateExclusive: json['endDateExclusive'] as String? ?? '',
        targetCalories: _insightInt(json['targetCalories']),
        days: (json['days'] as List?)
                ?.whereType<Map<String, dynamic>>()
                .map(InsightDay.fromJson)
                .toList() ??
            const [],
        weightPoints: (json['weightPoints'] as List?)
                ?.whereType<Map<String, dynamic>>()
                .map(InsightWeightPoint.fromJson)
                .toList() ??
            const [],
      );
}

class InsightDay {
  final String date;
  final double calories;
  final double protein;
  final double fat;
  final double carbs;
  final int mealCount;

  const InsightDay({
    required this.date,
    required this.calories,
    required this.protein,
    required this.fat,
    required this.carbs,
    required this.mealCount,
  });

  factory InsightDay.fromJson(Map<String, dynamic> json) => InsightDay(
        date: json['date'] as String? ?? '',
        calories: _insightDouble(json['calories']),
        protein: _insightDouble(json['protein']),
        fat: _insightDouble(json['fat']),
        carbs: _insightDouble(json['carbs']),
        mealCount: _insightInt(json['mealCount']),
      );
}

class InsightWeightPoint {
  final DateTime at;
  final double value;

  const InsightWeightPoint({required this.at, required this.value});

  factory InsightWeightPoint.fromJson(Map<String, dynamic> json) =>
      InsightWeightPoint(
        at: DateTime.tryParse(json['at']?.toString() ?? '')?.toLocal() ??
            DateTime.now(),
        value: _insightDouble(json['value']),
      );
}

double _insightDouble(dynamic value) {
  if (value is num) return value.toDouble();
  return double.tryParse(value?.toString() ?? '') ?? 0;
}

int _insightInt(dynamic value) {
  if (value is num) return value.toInt();
  return int.tryParse(value?.toString() ?? '') ?? 0;
}
