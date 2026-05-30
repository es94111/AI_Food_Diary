"use client";

import { useState, type ReactNode } from "react";

type TabKey = "food" | "health" | "settings";

const TABS: { key: TabKey; label: string }[] = [
  { key: "food", label: "飲食" },
  { key: "health", label: "健康" },
  { key: "settings", label: "設定" }
];

export function DashboardTabs({
  food,
  health,
  settings
}: {
  food: ReactNode;
  health: ReactNode;
  settings: ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>("food");

  return (
    <>
      <nav className="glass mt-6 flex gap-1 rounded-full p-1 text-sm font-semibold">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 cursor-pointer rounded-full px-4 py-2.5 transition-colors ${
              tab === t.key ? "bg-amber-700 text-white" : "text-stone-600 hover:text-stone-900"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* All panels stay mounted (hidden when inactive) to preserve their state. */}
      <div className={`mt-6 space-y-6 ${tab === "food" ? "" : "hidden"}`}>{food}</div>
      <div className={`mt-6 space-y-6 ${tab === "health" ? "" : "hidden"}`}>{health}</div>
      <div className={`mt-6 space-y-6 ${tab === "settings" ? "" : "hidden"}`}>{settings}</div>
    </>
  );
}
