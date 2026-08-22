import 'package:ai_food_mobile/services/health_sync_validation.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('accepts normal sleep timelines and rejects oversized ones', () {
    final segment = {
      'stage': 'LIGHT',
      'start': '2026-08-23T00:00:00.000Z',
      'end': '2026-08-23T00:01:00.000Z',
    };

    expect(healthRawFitsSyncLimit([segment]), isTrue);
    expect(healthRawFitsSyncLimit(List.generate(500, (_) => segment)), isFalse);
  });
}
