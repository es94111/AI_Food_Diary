import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { TimezoneReporter } from "@/components/timezone-reporter";
import { DashboardNav } from "@/components/dashboard-nav";
import { LogoutButton } from "@/components/logout-button";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const displayName = user.name?.trim() || user.email.split("@")[0] || "使用者";
  const initials = displayName.slice(0, 1).toUpperCase();

  return (
    <div className="dashboard-app-shell">
      <TimezoneReporter serverTimezone={user.profile?.timezone ?? ""} />
      <DashboardNav displayName={displayName} email={user.email} initials={initials} isAdmin={user.isAdmin} />
      <div className="dashboard-main-column">
        <header className="dashboard-topbar">
          <div className="dashboard-breadcrumb" aria-label="目前位置">
            <span className="dashboard-breadcrumb-mark" aria-hidden="true">01</span>
            <span>AI FOOD DIARY</span>
            <span className="dashboard-breadcrumb-separator" aria-hidden="true">/</span>
            <span className="dashboard-breadcrumb-current">工作台</span>
          </div>
          <div className="dashboard-topbar-actions">
            <div className="dashboard-system-status" role="status">
              <span className="dashboard-status-dot" aria-hidden="true" />
              <span>資料同步正常</span>
            </div>
            <div className="dashboard-account-chip">
              <span className="dashboard-avatar" aria-hidden="true">{initials}</span>
              <span className="hidden sm:inline">{displayName}</span>
              <LogoutButton className="dashboard-logout-button" />
            </div>
          </div>
        </header>
        <main className="dashboard-content">{children}</main>
      </div>
    </div>
  );
}
