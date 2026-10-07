export const HEALTH_HISTORY_TYPES = [
  "STEPS",
  "WEIGHT",
  "ACTIVE_CALORIES",
  "TOTAL_CALORIES",
  "BASAL_CALORIES",
  "EXERCISE",
  "SLEEP",
  "SLEEP_DEEP",
  "SLEEP_LIGHT",
  "SLEEP_REM",
  "SLEEP_AWAKE",
  "HEART_RATE",
  "RESTING_HEART_RATE",
  "HRV",
  "RESPIRATORY_RATE",
  "BLOOD_OXYGEN",
  "BLOOD_PRESSURE_SYSTOLIC",
  "BLOOD_PRESSURE_DIASTOLIC",
  "BLOOD_GLUCOSE",
  "BODY_FAT",
  "BMI",
  "LEAN_BODY_MASS",
  "BODY_WATER_MASS",
  "BODY_TEMPERATURE",
  "SKIN_TEMPERATURE",
  "HEIGHT",
  "DISTANCE",
  "SPEED",
  "FLIGHTS_CLIMBED",
  "ACTIVITY_INTENSITY",
  "NUTRITION",
  "WATER",
] as const;

export type HealthHistoryType = (typeof HEALTH_HISTORY_TYPES)[number];

export const MAX_HEALTH_HISTORY_TYPES = 5;
export const DEFAULT_HEALTH_HISTORY_LIMIT = 30;
export const MIN_HEALTH_HISTORY_LIMIT = 7;
export const MAX_HEALTH_HISTORY_LIMIT = 120;

export function isHealthHistoryType(value: string): value is HealthHistoryType {
  return HEALTH_HISTORY_TYPES.includes(value as HealthHistoryType);
}
