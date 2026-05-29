import 'package:health/health.dart';
import 'package:intl/intl.dart';

class HealthService {
  static final Health _health = Health();

  static const _types = [
    HealthDataType.STEPS,
    HealthDataType.WEIGHT,
    HealthDataType.ACTIVE_ENERGY_BURNED,
  ];

  static Future<bool> requestPermissions() async {
    await _health.configure();
    return _health.requestAuthorization(
      _types,
      permissions: List.filled(_types.length, HealthDataAccess.READ),
    );
  }

  static Future<List<Map<String, dynamic>>> fetchLast7Days() async {
    final now = DateTime.now();
    final start = now.subtract(const Duration(days: 7));

    final data = await _health.getHealthDataFromTypes(
      startTime: start,
      endTime: now,
      types: _types,
    );

    return data.map(_toPayload).toList();
  }

  static Map<String, dynamic> _toPayload(HealthDataPoint p) {
    final type = switch (p.type) {
      HealthDataType.STEPS => 'STEPS',
      HealthDataType.WEIGHT => 'WEIGHT',
      HealthDataType.ACTIVE_ENERGY_BURNED => 'ACTIVE_CALORIES',
      _ => p.type.name,
    };

    final unit = switch (p.type) {
      HealthDataType.STEPS => 'count',
      HealthDataType.WEIGHT => 'kg',
      HealthDataType.ACTIVE_ENERGY_BURNED => 'kcal',
      _ => '',
    };

    final raw = p.value;
    final value = raw is NumericHealthValue
        ? raw.numericValue.toDouble()
        : double.tryParse(raw.toString()) ?? 0.0;

    return {
      'type': type,
      'value': value,
      'unit': unit,
      'measuredAt': DateFormat("yyyy-MM-dd'T'HH:mm:ss.000'Z'")
          .format(p.dateFrom.toUtc()),
    };
  }
}
