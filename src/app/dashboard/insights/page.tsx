import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { todayStr } from "@/lib/dates";
import { resolveUserTz, TZ_COOKIE, tzName } from "@/lib/timezone";
import { InsightsDashboard } from "@/components/insights-dashboard";

export default async function InsightsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const cookieStore = await cookies();
  const tz = resolveUserTz(cookieStore.get(TZ_COOKIE)?.value, user.profile?.timezone);
  return <InsightsDashboard initialDate={todayStr(tz)} timeZone={tzName(tz)} />;
}
