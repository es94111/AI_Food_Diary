"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { href: string; label: string }[] = [
  { href: "/dashboard", label: "飲食" },
  { href: "/dashboard/health", label: "健康" },
  { href: "/dashboard/settings", label: "設定" }
];

export function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav className="glass mt-6 flex gap-1 rounded-full p-1 text-sm font-semibold">
      {TABS.map((t) => {
        // "飲食" lives at the segment root, so match it exactly; the others
        // match any path beneath them (e.g. future /dashboard/health/...).
        const active = t.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex-1 cursor-pointer rounded-full px-4 py-2.5 text-center transition-colors ${
              active ? "bg-amber-700 text-white" : "text-stone-600 hover:text-stone-900"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
