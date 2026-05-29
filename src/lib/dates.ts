export function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function parseLocalDate(value?: string | null) {
  if (!value) return startOfLocalDay(new Date());
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? startOfLocalDay(new Date()) : date;
}

export function startOfLocalWeek(date: Date) {
  const start = startOfLocalDay(date);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(start, diff);
}
