import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { TimezoneReporter } from "@/components/timezone-reporter";
import { DashboardNav } from "@/components/dashboard-nav";
import { DashboardBreadcrumb } from "@/components/dashboard-breadcrumb";
import { LogoutButton } from "@/components/logout-button";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const displayName = user.name?.trim() || user.email.split("@")[0] || "使用者";
  const initials = displayName.slice(0, 1).toUpperCase();

  return (
    <div className="dashboard-app-shell">
      <a className="dashboard-skip-link" href="#dashboard-main">跳到主要內容</a>
      <TimezoneReporter serverTimezone={user.profile?.timezone ?? ""} />
      <DashboardNav displayName={displayName} email={user.email} initials={initials} isAdmin={user.isAdmin} />
      <div className="dashboard-main-column">
        <header className="dashboard-topbar">
          <DashboardBreadcrumb />
          <div className="dashboard-topbar-actions">
            <div className="dashboard-account-chip">
              <span className="dashboard-avatar" aria-hidden="true">{initials}</span>
              <span className="hidden sm:inline">{displayName}</span>
              <LogoutButton className="dashboard-logout-button" />
            </div>
          </div>
        </header>
        <main className="dashboard-content" id="dashboard-main" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
