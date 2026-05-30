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
    <div className="glass mt-6 rounded-[2rem] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <input className="rounded-xl border border-stone-200 px-3 py-2" onChange={(event) => update(event.target.value)} type="date" value={date} />
        <div className="flex rounded-xl bg-stone-100 p-1 text-sm font-semibold">
          <button className={`rounded-lg px-3 py-2 ${view === "day" ? "bg-white shadow-sm" : "text-stone-500"}`} onClick={() => update(date, "day")} type="button">日</button>
          <button className={`rounded-lg px-3 py-2 ${view === "week" ? "bg-white shadow-sm" : "text-stone-500"}`} onClick={() => update(date, "week")} type="button">星期</button>
        </div>
        <button className="rounded-xl border border-stone-200 px-3 py-2 text-sm font-semibold" onClick={() => shift(view === "week" ? -7 : -1)} type="button">上一{view === "week" ? "週" : "日"}</button>
        <button className="rounded-xl border border-stone-200 px-3 py-2 text-sm font-semibold" onClick={() => shift(view === "week" ? 7 : 1)} type="button">下一{view === "week" ? "週" : "日"}</button>
      </div>
    </div>
  );
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
