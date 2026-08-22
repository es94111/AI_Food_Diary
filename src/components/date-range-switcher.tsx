"use client";

import { useRouter } from "next/navigation";

export function DateRangeSwitcher({ date, view }: { date: string; view: "day" | "week" }) {
  const router = useRouter();

  function update(nextDate: string, nextView = view) {
    router.push(`/dashboard?date=${nextDate}&view=${nextView}`);
  }

  function shift(days: number) {
    const [year, month, day] = date.split("-").map(Number);
    const next = new Date(year, month - 1, day);
    next.setDate(next.getDate() + days);
    update(formatLocalDate(next));
  }

  return (
    <div className="date-range-switcher" aria-label="日期範圍">
      <button aria-label={`上一${view === "week" ? "週" : "日"}`} className="date-range-arrow" onClick={() => shift(view === "week" ? -7 : -1)} type="button">←</button>
      <label className="date-range-input">
        <span className="date-range-label">檢視日期</span>
        <input aria-label="選擇日期" onChange={(event) => update(event.target.value)} type="date" value={date} />
      </label>
      <div className="date-range-toggle" role="group" aria-label="檢視範圍">
        <button className={view === "day" ? "is-active" : ""} onClick={() => update(date, "day")} type="button">日</button>
        <button className={view === "week" ? "is-active" : ""} onClick={() => update(date, "week")} type="button">週</button>
      </div>
      <button aria-label={`下一${view === "week" ? "週" : "日"}`} className="date-range-arrow" onClick={() => shift(view === "week" ? 7 : 1)} type="button">→</button>
    </div>
  );
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
