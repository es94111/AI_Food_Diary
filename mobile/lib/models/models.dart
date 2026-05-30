// Plain data models mirroring the web app's API JSON shapes.

double _toDouble(dynamic v) {
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v) ?? 0;
  return 0;
}

int _toInt(dynamic v) {
  if (v is num) return v.toInt();
  if (v is String) return int.tryParse(v) ?? 0;
  return 0;
}

class UserProfile {
  final String? gender;
  final String? birthDate; // ISO string
  final int? heightCm;
  final double? weightKg;
  final String? activityLevel;
  final String goal;
  final int calorieTarget;

  UserProfile({
    this.gender,
    this.birthDate,
    this.heightCm,
    this.weightKg,
    this.activityLevel,
    this.goal = 'MAINTAIN',
    this.calorieTarget = 2000,
  });

  factory UserProfile.fromJson(Map<String, dynamic> j) => UserProfile(
        gender: j['gender'] as String?,
        birthDate: j['birthDate'] as String?,
        heightCm: j['heightCm'] == null ? null : _toInt(j['heightCm']),
        weightKg: j['weightKg'] == null ? null : _toDouble(j['weightKg']),
        activityLevel: j['activityLevel'] as String?,
        goal: (j['goal'] as String?) ?? 'MAINTAIN',
        calorieTarget: j['calorieTarget'] == null ? 2000 : _toInt(j['calorieTarget']),
      );
}

class AppUser {
  final String id;
  final String email;
  final String? name;
  final bool isAdmin;
  final bool googleLinked;
  final UserProfile? profile;

  AppUser({
    required this.id,
    required this.email,
    this.name,
    this.isAdmin = false,
    this.googleLinked = false,
    this.profile,
  });

  factory AppUser.fromJson(Map<String, dynamic> j) => AppUser(
        id: j['id'] as String,
        email: j['email'] as String,
        name: j['name'] as String?,
        isAdmin: j['isAdmin'] == true,
        googleLinked: j['googleId'] != null,
        profile: j['profile'] is Map<String, dynamic>
            ? UserProfile.fromJson(j['profile'] as Map<String, dynamic>)
            : null,
      );
}

class MealItem {
  final String? id;
  final String name;
  final String estimatedAmount;
  final int calories;
  final double protein;
  final double fat;
  final double carbs;
  final String aiRating;

  MealItem({
    this.id,
    required this.name,
    required this.estimatedAmount,
    required this.calories,
    required this.protein,
    required this.fat,
    required this.carbs,
    this.aiRating = 'MANUAL',
  });

  factory MealItem.fromJson(Map<String, dynamic> j) => MealItem(
        id: j['id'] as String?,
        name: (j['name'] as String?) ?? '',
        estimatedAmount: (j['estimatedAmount'] as String?) ?? '',
        calories: _toInt(j['calories']),
        protein: _toDouble(j['protein']),
        fat: _toDouble(j['fat']),
        carbs: _toDouble(j['carbs']),
        aiRating: (j['aiRating'] as String?) ?? 'MANUAL',
      );

  Map<String, dynamic> toPayload() => {
        if (id != null) 'id': id,
        'name': name,
        'estimatedAmount': estimatedAmount,
        'calories': calories,
        'protein': protein,
        'fat': fat,
        'carbs': carbs,
        'aiRating': aiRating,
      };
}

class Meal {
  final String id;
  final String mealType;
  final String? imageStorageKey; // relative path like /api/meals/{id}/image
  final int totalCalories;
  final double totalProtein;
  final double totalFat;
  final double totalCarbs;
  final String? aiNotes;
  final DateTime eatenAt;
  final List<MealItem> items;

  Meal({
    required this.id,
    required this.mealType,
    this.imageStorageKey,
    required this.totalCalories,
    required this.totalProtein,
    required this.totalFat,
    required this.totalCarbs,
    this.aiNotes,
    required this.eatenAt,
    required this.items,
  });

  bool get hasImage => imageStorageKey != null;

  factory Meal.fromJson(Map<String, dynamic> j) => Meal(
        id: j['id'] as String,
        mealType: (j['mealType'] as String?) ?? 'LUNCH',
        imageStorageKey: j['imageStorageKey'] as String?,
        totalCalories: _toInt(j['totalCalories']),
        totalProtein: _toDouble(j['totalProtein']),
        totalFat: _toDouble(j['totalFat']),
        totalCarbs: _toDouble(j['totalCarbs']),
        aiNotes: j['aiNotes'] as String?,
        eatenAt: DateTime.tryParse(j['eatenAt']?.toString() ?? '')?.toLocal() ??
            DateTime.now(),
        items: (j['items'] as List?)
                ?.map((e) => MealItem.fromJson(e as Map<String, dynamic>))
                .toList() ??
            const [],
      );
}

/// AI analysis result returned by the analyze-* endpoints.
class FoodAnalysisItem {
  final String name;
  final String estimatedAmount;
  final int calories;
  final double protein;
  final double fat;
  final double carbs;
  final String aiRating;

  FoodAnalysisItem({
    required this.name,
    required this.estimatedAmount,
    required this.calories,
    required this.protein,
    required this.fat,
    required this.carbs,
    required this.aiRating,
  });

  factory FoodAnalysisItem.fromJson(Map<String, dynamic> j) => FoodAnalysisItem(
        name: (j['name'] as String?) ?? '',
        estimatedAmount: (j['estimatedAmount'] as String?) ?? '',
        calories: _toInt(j['calories']),
        protein: _toDouble(j['protein']),
        fat: _toDouble(j['fat']),
        carbs: _toDouble(j['carbs']),
        aiRating: (j['aiRating'] as String?) ?? 'OK',
      );
}

class SavedFood {
  final String id;
  final String name;
  final String estimatedAmount;
  final int calories;
  final double protein;
  final double fat;
  final double carbs;

  SavedFood({
    required this.id,
    required this.name,
    required this.estimatedAmount,
    required this.calories,
    required this.protein,
    required this.fat,
    required this.carbs,
  });

  factory SavedFood.fromJson(Map<String, dynamic> j) => SavedFood(
        id: j['id'] as String,
        name: (j['name'] as String?) ?? '',
        estimatedAmount: (j['estimatedAmount'] as String?) ?? '',
        calories: _toInt(j['calories']),
        protein: _toDouble(j['protein']),
        fat: _toDouble(j['fat']),
        carbs: _toDouble(j['carbs']),
      );
}

class DailySummary {
  final String aiSummary;
  final String aiRecommendation;
  final int totalCalories;

  DailySummary({
    required this.aiSummary,
    required this.aiRecommendation,
    required this.totalCalories,
  });

  factory DailySummary.fromJson(Map<String, dynamic> j) => DailySummary(
        aiSummary: (j['aiSummary'] as String?) ?? '',
        aiRecommendation: (j['aiRecommendation'] as String?) ?? '',
        totalCalories: _toInt(j['totalCalories']),
      );
}

class HealthMetricValue {
  final String type;
  final double value;
  final String unit;
  final DateTime measuredAt;

  HealthMetricValue({
    required this.type,
    required this.value,
    required this.unit,
    required this.measuredAt,
  });

  factory HealthMetricValue.fromJson(Map<String, dynamic> j) => HealthMetricValue(
        type: (j['type'] as String?) ?? '',
        value: _toDouble(j['value']),
        unit: (j['unit'] as String?) ?? '',
        measuredAt:
            DateTime.tryParse(j['measuredAt']?.toString() ?? '')?.toLocal() ??
                DateTime.now(),
      );
}

class HealthConnection {
  final String id;
  final String provider;
  final String? deviceName;
  final DateTime? lastSyncedAt;
  final DateTime? revokedAt;

  HealthConnection({
    required this.id,
    required this.provider,
    this.deviceName,
    this.lastSyncedAt,
    this.revokedAt,
  });

  bool get isActive => revokedAt == null;

  factory HealthConnection.fromJson(Map<String, dynamic> j) => HealthConnection(
        id: j['id'] as String,
        provider: (j['provider'] as String?) ?? 'HEALTH_CONNECT',
        deviceName: j['deviceName'] as String?,
        lastSyncedAt: j['lastSyncedAt'] == null
            ? null
            : DateTime.tryParse(j['lastSyncedAt'].toString())?.toLocal(),
        revokedAt: j['revokedAt'] == null
            ? null
            : DateTime.tryParse(j['revokedAt'].toString())?.toLocal(),
      );
}

class HealthSyncStatus {
  final DateTime? lastSyncedAt;
  final Map<String, HealthMetricValue> latestByType;

  HealthSyncStatus({this.lastSyncedAt, required this.latestByType});

  factory HealthSyncStatus.fromJson(Map<String, dynamic> j) {
    final latest = <String, HealthMetricValue>{};
    final raw = j['latestByType'];
    if (raw is Map) {
      raw.forEach((key, value) {
        if (value is Map<String, dynamic>) {
          latest[key as String] = HealthMetricValue.fromJson(value);
        }
      });
    }
    return HealthSyncStatus(
      lastSyncedAt: j['lastSyncedAt'] == null
          ? null
          : DateTime.tryParse(j['lastSyncedAt'].toString())?.toLocal(),
      latestByType: latest,
    );
  }
}

class Totals {
  final int calories;
  final double protein;
  final double fat;
  final double carbs;
  const Totals(this.calories, this.protein, this.fat, this.carbs);

  static Totals fromMeals(List<Meal> meals) {
    var c = 0;
    var p = 0.0, f = 0.0, cb = 0.0;
    for (final m in meals) {
      c += m.totalCalories;
      p += m.totalProtein;
      f += m.totalFat;
      cb += m.totalCarbs;
    }
    return Totals(c, p, f, cb);
  }
}
