export function calculateAge(birthDate?: Date | string | null) {
  if (!birthDate) return null;
  const date = typeof birthDate === "string" ? new Date(birthDate) : birthDate;
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) age -= 1;
  return age > 0 ? age : null;
}

export function activityFactor(activityLevel?: string | null) {
  switch (activityLevel) {
    case "LIGHT":
      return 1.375;
    case "MODERATE":
      return 1.55;
    case "HIGH":
      return 1.725;
    case "ATHLETE":
      return 1.9;
    default:
      return 1.2;
  }
}

export function calculateBmr(input?: { gender?: string | null; birthDate?: Date | string | null; heightCm?: number | null; weightKg?: number | string | { toString(): string } | null } | null) {
  if (!input) return null;
  const age = calculateAge(input.birthDate);
  const height = input.heightCm ? Number(input.heightCm) : null;
  const weight = input.weightKg ? Number(input.weightKg) : null;
  if (!age || !height || !weight) return null;
  const offset = input.gender === "FEMALE" ? -161 : 5;
  return Math.round(10 * weight + 6.25 * height - 5 * age + offset);
}

export function calculateTdee(bmr: number | null, activityLevel?: string | null) {
  if (!bmr) return null;
  return Math.round(bmr * activityFactor(activityLevel));
}
