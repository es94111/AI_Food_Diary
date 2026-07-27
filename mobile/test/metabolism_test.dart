// 純邏輯測試：BMR / TDEE / 熱量目標 / 巨量目標運算（Mifflin-St Jeor），
// 與 web 端 src/lib/metabolism.ts 對齊。抓數學與性別/目標分支回歸。
// 執行：flutter test test/metabolism_test.dart

import 'package:ai_food_mobile/models/models.dart';
import 'package:ai_food_mobile/utils/metabolism.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('calculateAge', () {
    test('null / empty / unparseable → null', () {
      expect(calculateAge(null), isNull);
      expect(calculateAge(''), isNull);
      expect(calculateAge('not-a-date'), isNull);
    });

    test('future birth date → null (>0 guard)', () {
      expect(calculateAge('2099-01-01'), isNull);
    });

    test('a 1990 birth date yields a plausible adult age', () {
      final age = calculateAge('1990-01-01');
      expect(age, isNotNull);
      expect(age, greaterThanOrEqualTo(30));
    });
  });

  group('activityFactor', () {
    test('maps known levels and defaults SEDENTARY', () {
      expect(activityFactor(null), 1.2);
      expect(activityFactor('SEDENTARY'), 1.2);
      expect(activityFactor('LIGHT'), 1.375);
      expect(activityFactor('MODERATE'), 1.55);
      expect(activityFactor('HIGH'), 1.725);
      expect(activityFactor('ATHLETE'), 1.9);
    });
  });

  group('calculateBmr', () {
    const birth = '1990-01-01';
    final age = calculateAge(birth);

    test('returns null when any required input is missing', () {
      expect(calculateBmr(gender: 'MALE', birthDate: birth, heightCm: 175, weightKg: null), isNull);
      expect(calculateBmr(gender: 'MALE', birthDate: birth, heightCm: null, weightKg: 70), isNull);
      expect(calculateBmr(gender: 'MALE', birthDate: null, heightCm: 175, weightKg: 70), isNull);
    });

    test('returns null for non-positive weight', () {
      expect(calculateBmr(gender: 'MALE', birthDate: birth, heightCm: 175, weightKg: 0), isNull);
      expect(calculateBmr(gender: 'MALE', birthDate: birth, heightCm: 175, weightKg: -5), isNull);
    });

    test('female offset is 166 below male for identical stats (Mifflin-St Jeor)', () {
      final male = calculateBmr(gender: 'MALE', birthDate: birth, heightCm: 175, weightKg: 70)!;
      final female = calculateBmr(gender: 'FEMALE', birthDate: birth, heightCm: 175, weightKg: 70)!;
      expect(female - male, -166);
    });

    test('matches the documented formula (10w + 6.25h - 5a + offset, rounded)', () {
      final male = calculateBmr(gender: 'MALE', birthDate: birth, heightCm: 175, weightKg: 70)!;
      final expected = (10 * 70 + 6.25 * 175 - 5 * age! + 5).round();
      expect(male, expected);
    });
  });

  group('calculateTdee', () {
    test('null bmr → null', () {
      expect(calculateTdee(null, 'MODERATE'), isNull);
    });

    test('multiplies bmr by activity factor and rounds', () {
      expect(calculateTdee(1700, 'MODERATE'), (1700 * 1.55).round()); // 2635
      expect(calculateTdee(1700, null), (1700 * 1.2).round()); // 2040
    });
  });

  group('calorieTargetFromGoal', () {
    test('LOSE_FAT subtracts 400 with an 800 floor', () {
      expect(calorieTargetFromGoal(2000, 'LOSE_FAT'), 1600);
      expect(calorieTargetFromGoal(1000, 'LOSE_FAT'), 800); // 600 clamped up
    });

    test('BUILD_MUSCLE adds 250', () {
      expect(calorieTargetFromGoal(2000, 'BUILD_MUSCLE'), 2250);
    });

    test('MAINTAIN (and unknown) returns tdee unchanged', () {
      expect(calorieTargetFromGoal(2000, 'MAINTAIN'), 2000);
      expect(calorieTargetFromGoal(2000, null), 2000);
      expect(calorieTargetFromGoal(2000, 'WHATEVER'), 2000);
    });

    test('null tdee → null', () {
      expect(calorieTargetFromGoal(null, 'LOSE_FAT'), isNull);
    });
  });

  group('macroTargetsFor', () {
    test('LOSE_FAT: 40/30/30 (protein & carbs /4, fat /9)', () {
      final m = macroTargetsFor(2000, 'LOSE_FAT');
      expect(m.protein, 200); // 2000*0.40/4
      expect(m.fat, 67);      // 2000*0.30/9 = 66.67 → 67
      expect(m.carbs, 150);   // 2000*0.30/4
    });

    test('BUILD_MUSCLE: 30/25/45', () {
      final m = macroTargetsFor(2000, 'BUILD_MUSCLE');
      expect(m.protein, 150); // 2000*0.30/4
      expect(m.fat, 56);      // 2000*0.25/9 = 55.56 → 56
      expect(m.carbs, 225);   // 2000*0.45/4
    });

    test('MAINTAIN (and unknown): 30/30/40', () {
      final m = macroTargetsFor(2000, 'MAINTAIN');
      expect(m.protein, 150);
      expect(m.fat, 67);
      expect(m.carbs, 200);
      final u = macroTargetsFor(2000, null);
      expect((u.protein, u.fat, u.carbs), (150, 67, 200));
    });

    test('zero target → zero macros', () {
      final m = macroTargetsFor(0, 'LOSE_FAT');
      expect((m.protein, m.fat, m.carbs), (0, 0, 0));
    });
  });

  group('metabolismFor', () {
    test('null profile → (null, null, 2000)', () {
      final r = metabolismFor(null);
      expect(r.bmr, isNull);
      expect(r.tdee, isNull);
      expect(r.target, 2000);
    });

    test('synced positive weight overrides profile weight for BMR', () {
      final profile = UserProfile(
        gender: 'MALE', birthDate: '1990-01-01', heightCm: 175, weightKg: 70,
        activityLevel: 'MODERATE', goal: 'MAINTAIN', calorieTarget: 2000,
      );
      final r = metabolismFor(profile, syncedWeightKg: 75);
      final expectedBmr = calculateBmr(gender: 'MALE', birthDate: '1990-01-01', heightCm: 175, weightKg: 75)!;
      expect(r.bmr, expectedBmr);
    });

    test('synced weight of 0 does NOT override (guards against failed decrypt)', () {
      final profile = UserProfile(
        gender: 'MALE', birthDate: '1990-01-01', heightCm: 175, weightKg: 70,
        activityLevel: 'MODERATE', goal: 'MAINTAIN', calorieTarget: 2000,
      );
      final r = metabolismFor(profile, syncedWeightKg: 0);
      final expectedBmr = calculateBmr(gender: 'MALE', birthDate: '1990-01-01', heightCm: 175, weightKg: 70)!;
      expect(r.bmr, expectedBmr);
    });

    test('falls back to stored calorieTarget when TDEE is unknown', () {
      final profile = UserProfile(
        gender: 'MALE', birthDate: null, heightCm: 175, weightKg: 70,
        activityLevel: 'MODERATE', goal: 'MAINTAIN', calorieTarget: 2200,
      );
      final r = metabolismFor(profile);
      expect(r.bmr, isNull);
      expect(r.tdee, isNull);
      expect(r.target, 2200);
    });

    test('falls back to 2000 when target and TDEE both unknown', () {
      final profile = UserProfile(
        gender: 'MALE', birthDate: null, heightCm: 175, weightKg: 70,
        goal: 'MAINTAIN', calorieTarget: 0,
      );
      expect(metabolismFor(profile).target, 2000);
    });
  });

  group('date helpers', () {
    test('startOfLocalDay truncates to midnight', () {
      expect(startOfLocalDay(DateTime(2026, 7, 27, 15, 30, 45)), DateTime(2026, 7, 27));
    });

    test('startOfLocalWeek always returns a Monday containing the input', () {
      for (final d in [
        DateTime(2026, 7, 27, 10),
        DateTime(2026, 7, 26, 10), // Sunday
        DateTime(2026, 1, 1, 10),
      ]) {
        final week = startOfLocalWeek(d);
        expect(week.weekday, 1, reason: '$week should be Monday');
        expect(!week.isAfter(d), isTrue, reason: 'week start must be on/before $d');
        expect(week.add(const Duration(days: 7)).isAfter(d), isTrue, reason: 'd must fall within the week');
      }
    });

    test('isoDate zero-pads month and day', () {
      expect(isoDate(DateTime(2026, 7, 27)), '2026-07-27');
      expect(isoDate(DateTime(2026, 1, 5)), '2026-01-05');
    });

    test('localTzOffsetMinutes matches DateTime.now().timeZoneOffset', () {
      expect(localTzOffsetMinutes(), DateTime.now().timeZoneOffset.inMinutes);
    });
  });
}