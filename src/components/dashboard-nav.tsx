"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "今日飲食", eyebrow: "01", icon: "plate", exact: true },
  { href: "/dashboard?view=week", label: "歷史與趨勢", eyebrow: "02", icon: "chart", exact: false },
  { href: "/dashboard/health", label: "健康概覽", eyebrow: "03", icon: "pulse", exact: false },
  { href: "/dashboard/foods", label: "我的食物", eyebrow: "04", icon: "food", exact: false },
  { href: "/dashboard/settings", label: "設定", eyebrow: "05", icon: "settings", exact: false }
] as const;

// Admin-only entry, appended after the standard items (desktop sidebar only —
// the mobile nav keeps its curated four; admin tools are rarely used on the go).
const ADMIN_NAV_ITEM = { href: "/dashboard/admin", label: "管理", eyebrow: "06", icon: "shield", exact: false } as const;

export function DashboardNav({ displayName, email, initials, isAdmin }: { displayName: string; email: string; initials: string; isAdmin?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isWeek = pathname === "/dashboard" && searchParams.get("view") === "week";
  const items = isAdmin ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;

  function isActive(item: (typeof NAV_ITEMS)[number] | typeof ADMIN_NAV_ITEM) {
    if (item.href === "/dashboard?view=week") return isWeek;
    if (item.exact) return pathname === item.href && !isWeek;
    return pathname.startsWith(item.href);
  }

  return (
    <>
      <aside className="dashboard-sidebar" aria-label="主要導覽">
        <div className="dashboard-brand">
          <span className="dashboard-brand-symbol" aria-hidden="true"><BrandMark /></span>
          <span>
            <span className="dashboard-brand-name">AI Food Diary</span>
            <span className="dashboard-brand-note">Personal nutrition desk</span>
          </span>
        </div>

        <div className="dashboard-sidebar-kicker">你的工作台</div>
        <Link className="dashboard-record-button" href="/dashboard#capture">
          <span className="dashboard-record-plus" aria-hidden="true">+</span>
          <span>
            <strong>記錄飲食</strong>
            <small>拍照、描述或手動</small>
          </span>
          <span className="dashboard-record-key" aria-hidden="true">N</span>
        </Link>

        <nav className="dashboard-primary-nav">
          <div className="dashboard-nav-label">瀏覽</div>
          {items.map((item) => {
            const active = isActive(item);
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`dashboard-nav-item${active ? " is-active" : ""}`}
                href={item.href}
                key={item.href}
              >
                <span className="dashboard-nav-icon" aria-hidden="true"><NavIcon name={item.icon} /></span>
                <span className="dashboard-nav-copy">
                  <span>{item.label}</span>
                  {active ? <small>目前檢視</small> : null}
                </span>
                <span className="dashboard-nav-index" aria-hidden="true">{item.eyebrow}</span>
              </Link>
            );
          })}
        </nav>

        <div className="dashboard-sidebar-footer">
          <div className="dashboard-sidebar-footer-heading"><span className="dashboard-status-dot" aria-hidden="true" /> 工作區狀態</div>
          <p>所有飲食紀錄都會先保留在你的工作區，再由你確認儲存。</p>
          <div className="dashboard-user-mini">
            <span className="dashboard-avatar" aria-hidden="true">{initials}</span>
            <span><strong>{displayName}</strong><small>{email}</small></span>
          </div>
        </div>
      </aside>

      <nav className="dashboard-mobile-nav" aria-label="主要導覽">
        {/* Curated four (today / history / health / settings); the admin entry
            stays desktop-only. */}
        {[NAV_ITEMS[0], NAV_ITEMS[1], NAV_ITEMS[2], NAV_ITEMS[4]].map((item) => {
          const active = isActive(item);
          return (
            <Link aria-current={active ? "page" : undefined} className={active ? "is-active" : ""} href={item.href} key={item.href}>
              <span aria-hidden="true"><NavIcon name={item.icon} /></span>
              <small>{item.label.replace("健康概覽", "健康").replace("今日飲食", "今日")}</small>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" fill="none">
      <path d="M6 8.5h20M6 15.5h20M6 22.5h11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="23" cy="22" r="3.5" fill="currentColor" />
    </svg>
  );
}

function NavIcon({ name }: { name: (typeof NAV_ITEMS)[number]["icon"] | (typeof ADMIN_NAV_ITEM)["icon"] }) {
  const common = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "chart") return <svg {...common}><path d="M4 19V5M4 19h16" /><path d="m7 15 3-4 3 2 5-7" /><path d="M18 6h2v2" /></svg>;
  if (name === "pulse") return <svg {...common}><path d="M3 12h4l2-7 4 14 2-7h6" /></svg>;
  if (name === "food") return <svg {...common}><path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v7M10 3v7M7 13v8" /><path d="M17 3v18M17 3c2.4 0 4 1.8 4 4s-1.6 4-4 4" /></svg>;
  if (name === "settings") return <svg {...common}><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /><circle cx="12" cy="12" r="4" /></svg>;
  if (name === "shield") return <svg {...common}><path d="M12 3 5 6v5c0 4.4 3 8.3 7 10 4-1.7 7-5.6 7-10V6l-7-3Z" /><path d="m9.5 12 2 2 3.5-4" /></svg>;
  return <svg {...common}><path d="M4 12c2.2-5.2 5-7.8 8-7.8s5.8 2.6 8 7.8c-2.2 5.2-5 7.8-8 7.8S6.2 17.2 4 12Z" /><path d="M12 8.5c1.8 0 3.2 1.6 3.2 3.5s-1.4 3.5-3.2 3.5-3.2-1.6-3.2-3.5S10.2 8.5 12 8.5Z" /></svg>;
}
