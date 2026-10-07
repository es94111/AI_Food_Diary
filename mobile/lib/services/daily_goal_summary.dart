import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../models/models.dart';
import '../utils/metabolism.dart';

const dailyGoalSummaryNotificationId = 2612;
const dailyGoalSummaryChannelId = 'daily_reminders';
const dailyGoalSummaryChannelName = '日常提醒';

@immutable
class DailyGoalProgress {
  const DailyGoalProgress({
    required this.date,
    required this.mealCount,
    required this.totalCalories,
    required this.calorieTarget,
    required this.waterTotalMl,
    required this.waterGoalMl,
  });

  final String date;
  final int mealCount;
  final double totalCalories;
  final int calorieTarget;
  final int waterTotalMl;
  final int waterGoalMl;

  // Matches InsightsScreen's within-goal definition; no meal entries are not a pass.
  bool get caloriesWithinTarget =>
      mealCount > 0 && totalCalories <= calorieTarget;
  bool get waterGoalReached => waterTotalMl >= waterGoalMl;

  String notificationBody({bool fromCachedData = false}) {
    final calorieText = mealCount == 0
        ? '今天尚無飲食紀錄'
        : caloriesWithinTarget
        ? '熱量紀錄在目標範圍內（${_formatCalories(totalCalories)}/$calorieTarget kcal）'
        : '熱量紀錄高於參考目標（${_formatCalories(totalCalories)}/$calorieTarget kcal）';
    final waterText = waterGoalReached
        ? '喝水紀錄已達個人目標（$waterTotalMl/$waterGoalMl ml）'
        : '喝水紀錄目前為 $waterTotalMl/$waterGoalMl ml';
    final sourceText = fromCachedData ? '依上次同步的資料：' : '';
    return '$sourceText$calorieText；$waterText。進度僅供回顧參考，請依自己的節奏。';
  }

  Map<String, Object> toJson() => {
    'date': date,
    'mealCount': mealCount,
    'totalCalories': totalCalories,
    'calorieTarget': calorieTarget,
    'waterTotalMl': waterTotalMl,
    'waterGoalMl': waterGoalMl,
  };

  factory DailyGoalProgress.fromApiResponses({
    required String date,
    required Map<String, dynamic> userResponse,
    required Map<String, dynamic> mealsResponse,
    required Map<String, dynamic> waterResponse,
  }) {
    final user = _asMap(userResponse['user']);
    final profileData = user['profile'] == null
        ? null
        : UserProfile.fromJson(_asMap(user['profile']));
    final meals = mealsResponse['meals'];
    if (meals is! List) throw const FormatException('Missing meals list.');

    var totalCalories = 0.0;
    for (final value in meals) {
      if (value is! Map) throw const FormatException('Invalid meal entry.');
      final calories = _readDouble(value['totalCalories']);
      if (calories == null || calories < 0) {
        throw const FormatException('Invalid meal calories.');
      }
      totalCalories += calories;
      if (!totalCalories.isFinite) {
        throw const FormatException('Invalid meal calorie total.');
      }
    }

    final waterTotalMl = _readInt(waterResponse['totalMl']);
    if (waterTotalMl == null || waterTotalMl < 0) {
      throw const FormatException('Invalid water total.');
    }
    final calorieTarget = metabolismFor(profileData).target;
    final waterGoalMl = profileData?.waterGoalMl ?? 2000;
    if (calorieTarget <= 0 || waterGoalMl <= 0) {
      throw const FormatException('Invalid daily goals.');
    }

    return DailyGoalProgress(
      date: date,
      mealCount: meals.length,
      totalCalories: totalCalories,
      calorieTarget: calorieTarget,
      waterTotalMl: waterTotalMl,
      waterGoalMl: waterGoalMl,
    );
  }

  static DailyGoalProgress? fromCachedJson(
    Object? encoded, {
    required String currentDate,
  }) {
    if (encoded is! String || encoded.isEmpty) return null;
    try {
      final json = jsonDecode(encoded);
      if (json is! Map<String, dynamic>) return null;
      final progress = DailyGoalProgress.fromJson(json);
      return progress.date == currentDate ? progress : null;
    } catch (_) {
      return null;
    }
  }

  factory DailyGoalProgress.fromJson(Map<String, dynamic> json) {
    final date = json['date'];
    final mealCount = _readInt(json['mealCount']);
    final totalCalories = _readDouble(json['totalCalories']);
    final calorieTarget = _readInt(json['calorieTarget']);
    final waterTotalMl = _readInt(json['waterTotalMl']);
    final waterGoalMl = _readInt(json['waterGoalMl']);
    if (date is! String ||
        mealCount == null ||
        mealCount < 0 ||
        totalCalories == null ||
        totalCalories < 0 ||
        calorieTarget == null ||
        calorieTarget <= 0 ||
        waterTotalMl == null ||
        waterTotalMl < 0 ||
        waterGoalMl == null ||
        waterGoalMl <= 0) {
      throw const FormatException('Invalid cached goal progress.');
    }
    return DailyGoalProgress(
      date: date,
      mealCount: mealCount,
      totalCalories: totalCalories,
      calorieTarget: calorieTarget,
      waterTotalMl: waterTotalMl,
      waterGoalMl: waterGoalMl,
    );
  }

  static String _formatCalories(double value) => value.round().toString();

  static Map<String, dynamic> _asMap(Object? value) {
    if (value is! Map) throw const FormatException('Invalid response object.');
    return Map<String, dynamic>.from(value);
  }

  static int? _readInt(Object? value) {
    if (value is int) return value;
    if (value is num && value.isFinite && value == value.roundToDouble()) {
      return value.toInt();
    }
    return int.tryParse(value?.toString() ?? '');
  }

  static double? _readDouble(Object? value) {
    final parsed = value is num
        ? value.toDouble()
        : double.tryParse(value?.toString() ?? '');
    return parsed != null && parsed.isFinite ? parsed : null;
  }
}
