import 'dart:convert';

import 'package:ai_food_mobile/models/models.dart';
import 'package:ai_food_mobile/services/daily_goal_summary.dart';
import 'package:ai_food_mobile/utils/metabolism.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('summarizes calories within range and water goal reached', () {
    final progress = DailyGoalProgress.fromApiResponses(
      date: '2026-10-07',
      userResponse: {
        'user': {
          'profile': {'calorieTarget': 2000, 'waterGoalMl': 2000},
        },
      },
      mealsResponse: {
        'meals': [
          {'totalCalories': 1350},
          {'totalCalories': 650},
        ],
      },
      waterResponse: {'totalMl': 2000},
    );

    expect(progress.mealCount, 2);
    expect(progress.totalCalories, 2000);
    expect(progress.caloriesWithinTarget, isTrue);
    expect(progress.waterGoalReached, isTrue);
    expect(progress.notificationBody(), contains('目標範圍內'));
    expect(progress.notificationBody(), contains('已達個人目標'));
    expect(progress.notificationBody(), contains('請依自己的節奏'));
  });

  test('uses the same profile-derived calorie target as the dashboard', () {
    final profileJson = {
      'gender': 'FEMALE',
      'birthDate': '1990-01-01',
      'heightCm': 170,
      'weightKg': 65,
      'activityLevel': 'MODERATE',
      'goal': 'LOSE_FAT',
      'calorieTarget': 2000,
      'waterGoalMl': 2200,
    };
    final profile = UserProfile.fromJson(profileJson);
    final progress = DailyGoalProgress.fromApiResponses(
      date: '2026-10-07',
      userResponse: {
        'user': {'profile': profileJson},
      },
      mealsResponse: {'meals': <Object>[]},
      waterResponse: {'totalMl': 0},
    );

    expect(progress.calorieTarget, metabolismFor(profile).target);
  });

  test('reports above-calorie and below-water progress without blame', () {
    final progress = DailyGoalProgress.fromApiResponses(
      date: '2026-10-07',
      userResponse: {
        'user': {
          'profile': {'calorieTarget': 1800, 'waterGoalMl': 2000},
        },
      },
      mealsResponse: {
        'meals': [
          {'totalCalories': 2100},
        ],
      },
      waterResponse: {'totalMl': 1200},
    );

    expect(progress.caloriesWithinTarget, isFalse);
    expect(progress.waterGoalReached, isFalse);
    expect(progress.notificationBody(), contains('高於參考目標'));
    expect(progress.notificationBody(), contains('1200/2000 ml'));
    expect(progress.notificationBody(), isNot(contains('失敗')));
  });

  test('does not call an empty meal day achieved', () {
    final progress = DailyGoalProgress.fromApiResponses(
      date: '2026-10-07',
      userResponse: {
        'user': {'profile': null},
      },
      mealsResponse: {'meals': <Object>[]},
      waterResponse: {'totalMl': 0},
    );

    expect(progress.caloriesWithinTarget, isFalse);
    expect(progress.notificationBody(), contains('尚無飲食紀錄'));
    expect(progress.notificationBody(), isNot(contains('目標範圍內')));
  });

  test('uses cached progress only for the day it describes', () {
    const progress = DailyGoalProgress(
      date: '2026-10-07',
      mealCount: 1,
      totalCalories: 1500,
      calorieTarget: 2000,
      waterTotalMl: 1200,
      waterGoalMl: 2000,
    );
    final encoded = jsonEncode(progress.toJson());

    expect(
      DailyGoalProgress.fromCachedJson(encoded, currentDate: '2026-10-07'),
      isNotNull,
    );
    expect(
      DailyGoalProgress.fromCachedJson(encoded, currentDate: '2026-10-08'),
      isNull,
    );
    expect(progress.notificationBody(fromCachedData: true), contains('上次同步'));
  });

  test('rejects incomplete goal data instead of fabricating progress', () {
    expect(
      () => DailyGoalProgress.fromApiResponses(
        date: '2026-10-07',
        userResponse: {'user': null},
        mealsResponse: {'meals': <Object>[]},
        waterResponse: {'totalMl': -1},
      ),
      throwsFormatException,
    );
  });
}
