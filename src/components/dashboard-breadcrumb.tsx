"use client";

import { usePathname, useSearchParams } from "next/navigation";

const PAGE_LABELS: Record<string, string> = {
  "/dashboard/health": "健康概覽",
  "/dashboard/foods": "我的食物",
  "/dashboard/ai-activity": "AI 操作紀錄",
  "/dashboard/settings": "設定",
  "/dashboard/admin": "管理"
};

export function DashboardBreadcrumb() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const section = pathname === "/dashboard"
    ? searchParams.get("view") === "week" ? "歷史與趨勢" : "今日飲食"
    : PAGE_LABELS[pathname] ?? (pathname.startsWith("/dashboard/ai-activity/") ? "操作詳情" : "工作台");

  return (
    <div className="dashboard-breadcrumb" aria-label="目前位置">
      <span>AI FOOD DIARY</span>
      <span className="dashboard-breadcrumb-separator" aria-hidden="true">/</span>
      <span className="dashboard-breadcrumb-current">{section}</span>
    </div>
  );
}
