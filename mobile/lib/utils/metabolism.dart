import '../models/models.dart';

/// Dart port of the web app's lib/metabolism.ts so the dashboard shows the
/// same BMR / TDEE / calorie-target numbers.

int? calculateAge(String? birthDateIso) {
  if (birthDateIso == null || birthDateIso.isEmpty) return null;
  final date = DateTime.tryParse(birthDateIso);
  if (date == null) return null;
  final now = DateTime.now();
  var age = now.year - date.year;
  final monthDiff = now.month - date.month;
  if (monthDiff < 0 || (monthDiff == 0 && now.day < date.day)) age -= 1;
  return age > 0 ? age : null;
}

double activityFactor(String? activityLevel) {
  switch (activityLevel) {
    case 'LIGHT':
      return 1.375;
    case 'MODERATE':
      return 1.55;
    case 'HIGH':
      return 1.725;
    case 'ATHLETE':
      return 1.9;
    default:
      return 1.2;
  }
}

int? calculateBmr({
  String? gender,
  String? birthDate,
  int? heightCm,
  double? weightKg,
}) {
  final age = calculateAge(birthDate);
  if (age == null || heightCm == null || weightKg == null || weightKg <= 0) {
    return null;
  }
  final offset = gender == 'FEMALE' ? -161 : 5;
  return (10 * weightKg + 6.25 * heightCm - 5 * age + offset).round();
}

int? calculateTdee(int? bmr, String? activityLevel) {
  if (bmr == null) return null;
  return (bmr * activityFactor(activityLevel)).round();
}

int? calorieTargetFromGoal(int? tdee, String? goal) {
  if (tdee == null) return null;
  switch (goal) {
    case 'LOSE_FAT':
      return (tdee - 400) < 800 ? 800 : (tdee - 400);
    case 'BUILD_MUSCLE':
      return tdee + 250;
    default:
      return tdee;
  }
}

/// Convenience wrapper computing all three from a profile, honoring a
/// Health-Connect-synced weight override when available.
class MetabolismResult {
  final int? bmr;
  final int? tdee;
  final int target;
  const MetabolismResult(this.bmr, this.tdee, this.target);
}

MetabolismResult metabolismFor(UserProfile? profile, {double? syncedWeightKg}) {
  if (profile == null) return const MetabolismResult(null, null, 2000);
  final weight = syncedWeightKg ?? profile.weightKg;
  final bmr = calculateBmr(
    gender: profile.gender,
    birthDate: profile.birthDate,
    heightCm: profile.heightCm,
    weightKg: weight,
  );
  final tdee = calculateTdee(bmr, profile.activityLevel);
  final target = profile.calorieTarget != 0
      ? profile.calorieTarget
      : (calorieTargetFromGoal(tdee, profile.goal) ?? 2000);
  return MetabolismResult(bmr, tdee, target);
}

// ---- date helpers (lib/dates.ts) ----

DateTime startOfLocalDay(DateTime d) => DateTime(d.year, d.month, d.day);

DateTime startOfLocalWeek(DateTime d) {
  final start = startOfLocalDay(d);
  final day = start.weekday % 7; // Dart: Mon=1..Sun=7 -> JS Sun=0
  final diff = day == 0 ? -6 : 1 - day;
  return start.add(Duration(days: diff));
}

String isoDate(DateTime d) {
  final m = d.month.toString().padLeft(2, '0');
  final day = d.day.toString().padLeft(2, '0');
  return '${d.year}-$m-$day';
}
