// 純邏輯測試：驗證所有 model 的 fromJson / toPayload 與預設值，抓 API 契約漂移。
// 執行：flutter test test/models_test.dart

import 'package:ai_food_mobile/models/models.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('fmtNum', () {
    test('drops trailing .0 but keeps fractions', () {
      expect(fmtNum(150.0), '150');
      expect(fmtNum(53.5), '53.5');
      expect(fmtNum(0), '0');
    });
  });

  group('UserProfile', () {
    test('parses full payload', () {
      final p = UserProfile.fromJson({
        'gender': 'MALE',
        'birthDate': '1990-05-01',
        'heightCm': 175,
        'weightKg': 70.5,
        'activityLevel': 'MODERATE',
        'goal': 'LOSE_FAT',
        'calorieTarget': 1800,
        'waterGoalMl': 2500,
      });
      expect(p.gender, 'MALE');
      expect(p.birthDate, '1990-05-01');
      expect(p.heightCm, 175);
      expect(p.weightKg, 70.5);
      expect(p.activityLevel, 'MODERATE');
      expect(p.goal, 'LOSE_FAT');
      expect(p.calorieTarget, 1800);
      expect(p.waterGoalMl, 2500);
    });

    test('falls back to defaults when fields are missing', () {
      final p = UserProfile.fromJson({});
      expect(p.goal, 'MAINTAIN');
      expect(p.calorieTarget, 2000);
      expect(p.waterGoalMl, 2000);
      expect(p.heightCm, isNull);
      expect(p.weightKg, isNull);
    });

    test('coerces numeric strings to numbers', () {
      final p = UserProfile.fromJson({
        'heightCm': '175',
        'weightKg': '70.5',
        'calorieTarget': '1800',
      });
      expect(p.heightCm, 175);
      expect(p.weightKg, 70.5);
      expect(p.calorieTarget, 1800);
    });
  });

  group('WaterLog', () {
    test('parses fields and coerces amount strings', () {
      final log = WaterLog.fromJson({
        'id': 'log-1',
        'amountMl': '250',
        'drankAt': '2026-07-27T08:00:00Z',
      });
      expect(log.id, 'log-1');
      expect(log.amountMl, 250);
      expect(log.drankAt, DateTime.parse('2026-07-27T08:00:00Z').toLocal());
    });

    test('falls back to now when drankAt is unparseable', () {
      final before = DateTime.now();
      final log = WaterLog.fromJson({'id': 'log-2', 'amountMl': 100, 'drankAt': 'nope'});
      final after = DateTime.now();
      expect(log.amountMl, 100);
      expect(log.drankAt.isAfter(before.subtract(const Duration(seconds: 1))), isTrue);
      expect(log.drankAt.isBefore(after.add(const Duration(seconds: 1))), isTrue);
    });
  });

  group('AppUser', () {
    test('parses profile and derives googleLinked from googleId', () {
      final u = AppUser.fromJson({
        'id': 'u-1',
        'email': 'a@b.c',
        'name': 'Alice',
        'isAdmin': true,
        'googleId': 'g-123',
        'profile': {'goal': 'BUILD_MUSCLE', 'calorieTarget': 3000},
      });
      expect(u.id, 'u-1');
      expect(u.email, 'a@b.c');
      expect(u.name, 'Alice');
      expect(u.isAdmin, isTrue);
      expect(u.googleLinked, isTrue);
      expect(u.profile?.goal, 'BUILD_MUSCLE');
      expect(u.profile?.calorieTarget, 3000);
    });

    test('googleLinked false when googleId absent', () {
      final u = AppUser.fromJson({'id': 'u-2', 'email': 'a@b.c'});
      expect(u.googleLinked, isFalse);
      expect(u.isAdmin, isFalse);
      expect(u.profile, isNull);
    });
  });

  group('MealItem', () {
    test('parses with defaults', () {
      final item = MealItem.fromJson({
        'name': '白飯',
        'estimatedAmount': '1 碗',
        'calories': 280,
        'protein': 5,
        'fat': 1,
        'carbs': 60,
      });
      expect(item.id, isNull);
      expect(item.name, '白飯');
      expect(item.calories, 280);
      expect(item.aiRating, 'MANUAL');
    });

    test('toPayload includes id only when present', () {
      final withoutId = MealItem(
        name: '蛋', estimatedAmount: '1 顆',
        calories: 70, protein: 6, fat: 5, carbs: 0,
      );
      expect(withoutId.toPayload().containsKey('id'), isFalse);

      final withId = MealItem(
        id: 'i-1', name: '蛋', estimatedAmount: '1 顆',
        calories: 70, protein: 6, fat: 5, carbs: 0, aiRating: 'GOOD',
      );
      final payload = withId.toPayload();
      expect(payload['id'], 'i-1');
      expect(payload['aiRating'], 'GOOD');
    });
  });

  group('Meal', () {
    test('parses totals, items and eatenAt', () {
      final meal = Meal.fromJson({
        'id': 'm-1',
        'mealType': 'LUNCH',
        'imageCount': 2,
        'totalCalories': 500,
        'totalProtein': 30,
        'totalFat': 10,
        'totalCarbs': 60,
        'aiNotes': '備註',
        'eatenAt': '2026-07-27T12:30:00Z',
        'items': [
          {'name': '白飯', 'estimatedAmount': '1 碗', 'calories': 280, 'protein': 5, 'fat': 1, 'carbs': 60},
          {'name': '雞胸', 'estimatedAmount': '100g', 'calories': 220, 'protein': 25, 'fat': 9, 'carbs': 0},
        ],
      });
      expect(meal.mealType, 'LUNCH');
      expect(meal.imageCount, 2);
      expect(meal.hasImage, isTrue);
      expect(meal.totalCalories, 500);
      expect(meal.items, hasLength(2));
      expect(meal.items.first.name, '白飯');
    });

    test('legacy single-image meals fall back to imageCount 1 from storage key', () {
      final meal = Meal.fromJson({
        'id': 'm-2',
        'mealType': 'BREAKFAST',
        'imageStorageKey': 'legacy/key.jpg',
        'eatenAt': '2026-07-27T07:00:00Z',
      });
      expect(meal.imageCount, 1);
      expect(meal.hasImage, isTrue);
      expect(meal.items, isEmpty);
    });

    test('meal with no image reports hasImage false', () {
      final meal = Meal.fromJson({
        'id': 'm-3', 'mealType': 'SNACK', 'eatenAt': '2026-07-27T15:00:00Z',
      });
      expect(meal.imageCount, 0);
      expect(meal.hasImage, isFalse);
    });
  });

  group('FoodAnalysisItem', () {
    test('defaults aiRating to OK', () {
      final f = FoodAnalysisItem.fromJson({
        'name': '三明治', 'estimatedAmount': '1 份',
        'calories': 300, 'protein': 12, 'fat': 8, 'carbs': 40,
      });
      expect(f.aiRating, 'OK');
      expect(f.calories, 300);
    });
  });

  group('DailySummary', () {
    test('parses fields with safe defaults', () {
      final s = DailySummary.fromJson({
        'aiSummary': '# 昨日\n- 多吃蔬菜',
        'aiRecommendation': '今天補充蛋白質',
        'totalCalories': 1850,
      });
      expect(s.aiSummary, '# 昨日\n- 多吃蔬菜');
      expect(s.aiRecommendation, '今天補充蛋白質');
      expect(s.totalCalories, 1850);

      final empty = DailySummary.fromJson({});
      expect(empty.aiSummary, '');
      expect(empty.totalCalories, 0);
    });
  });

  group('HealthMetricValue', () {
    test('parses basic metric', () {
      final m = HealthMetricValue.fromJson({
        'type': 'STEPS', 'value': '5230', 'unit': 'count',
        'measuredAt': '2026-07-27T08:00:00Z',
      });
      expect(m.type, 'STEPS');
      expect(m.value, 5230);
      expect(m.sleepStages, isEmpty);
    });

    test('parses SLEEP raw timeline into stages (drops invalid)', () {
      final m = HealthMetricValue.fromJson({
        'type': 'SLEEP', 'value': 7.5, 'unit': 'h',
        'measuredAt': '2026-07-27T08:00:00Z',
        'raw': [
          {'stage': 'deep', 'start': '2026-07-26T23:00:00Z', 'end': '2026-07-27T01:00:00Z'},
          {'stage': 'rem', 'start': '2026-07-27T01:00:00Z', 'end': '2026-07-27T03:00:00Z'},
          {'stage': 'awake', 'start': 'bad', 'end': 'also-bad'}, // dropped (unparseable)
          {'stage': 'light', 'start': '2026-07-27T03:00:00Z', 'end': '2026-07-27T02:00:00Z'}, // dropped (end<=start)
        ],
      });
      expect(m.sleepStages, hasLength(2));
      expect(m.sleepStages.first.stage, 'deep');
      expect(m.sleepStages.last.stage, 'rem');
    });
  });

  group('HealthHistory', () {
    test('parses series and filters non-map points', () {
      final s = HealthHistorySeries.fromJson({
        'type': 'WEIGHT', 'unit': 'kg',
        'points': [
          {'at': '2026-07-20T08:00:00Z', 'value': 70.5},
          {'at': '2026-07-21T08:00:00Z', 'value': 70.4},
          'not-a-map',
        ],
      });
      expect(s.type, 'WEIGHT');
      expect(s.points, hasLength(2));
      expect(s.points.first.value, 70.5);
    });
  });

  group('HealthConnection', () {
    test('isActive reflects revokedAt', () {
      final active = HealthConnection.fromJson({'id': 'c-1', 'provider': 'HEALTH_CONNECT'});
      expect(active.isActive, isTrue);
      final revoked = HealthConnection.fromJson({
        'id': 'c-2', 'provider': 'HEALTH_CONNECT',
        'revokedAt': '2026-07-27T00:00:00Z',
      });
      expect(revoked.isActive, isFalse);
      expect(revoked.revokedAt, isNotNull);
    });
  });

  group('HealthSyncStatus', () {
    test('parses latestByType map and weight series', () {
      final s = HealthSyncStatus.fromJson({
        'lastSyncedAt': '2026-07-27T08:00:00Z',
        'latestByType': {
          'STEPS': {'type': 'STEPS', 'value': 5230, 'unit': 'count', 'measuredAt': '2026-07-27T08:00:00Z'},
        },
        'weightSeries': [70.5, 70.4, 70.3],
      });
      expect(s.lastSyncedAt, isNotNull);
      expect(s.latestByType['STEPS']?.value, 5230);
      expect(s.weightSeries, [70.5, 70.4, 70.3]);
    });

    test('handles empty payload', () {
      final s = HealthSyncStatus.fromJson({});
      expect(s.lastSyncedAt, isNull);
      expect(s.latestByType, isEmpty);
      expect(s.weightSeries, isEmpty);
    });
  });

  group('Totals', () {
    test('sums meal totals', () {
      final meals = [
        Meal(id: 'a', mealType: 'LUNCH', totalCalories: 300, totalProtein: 10, totalFat: 5, totalCarbs: 40, eatenAt: DateTime.now(), items: const []),
        Meal(id: 'b', mealType: 'DINNER', totalCalories: 700, totalProtein: 30, totalFat: 20, totalCarbs: 80, eatenAt: DateTime.now(), items: const []),
      ];
      final t = Totals.fromMeals(meals);
      expect(t.calories, 1000);
      expect(t.protein, 40);
      expect(t.fat, 25);
      expect(t.carbs, 120);
    });
  });

  group('SavedFood', () {
    test('parses full payload with barcode and timestamps', () {
      final f = SavedFood.fromJson({
        'id': 'f-1',
        'barcode': '471123456',
        'name': '豆漿',
        'estimatedAmount': '1 杯',
        'calories': 100, 'protein': 8, 'fat': 3, 'carbs': 10,
        'source': 'BARCODE',
        'isFavorite': true,
        'hasImage': true,
        'useCount': 5,
        'lastUsedAt': '2026-07-20T08:00:00Z',
        'createdAt': '2026-01-01T00:00:00Z',
        'updatedAt': '2026-07-20T08:00:00Z',
      });
      expect(f.id, 'f-1');
      expect(f.barcode, '471123456');
      expect(f.source, 'BARCODE');
      expect(f.isFavorite, isTrue);
      expect(f.hasImage, isTrue);
      expect(f.useCount, 5);
      expect(f.lastUsedAt, isNotNull);
    });

    test('defaults source to MANUAL and nulls to absent', () {
      final f = SavedFood.fromJson({
        'id': 'f-2', 'name': '水', 'estimatedAmount': '1 杯',
        'calories': 0, 'protein': 0, 'fat': 0, 'carbs': 0,
      });
      expect(f.source, 'MANUAL');
      expect(f.barcode, isNull);
      expect(f.isFavorite, isFalse);
      expect(f.hasImage, isFalse);
      expect(f.useCount, 0);
      expect(f.lastUsedAt, isNull);
      expect(f.archivedAt, isNull);
    });
  });
}