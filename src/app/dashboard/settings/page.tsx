import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptProfile } from "@/lib/profile-crypto";
import { ProfileMetabolismForm } from "@/components/profile-metabolism-form";
import { AiSettingsForm } from "@/components/ai-settings-form";
import { LogoutButton } from "@/components/logout-button";
import { GoogleLinkPanel } from "@/components/google-link-panel";
import { AdminPanel } from "@/components/admin-panel";
import { Metric } from "@/components/health-cards";
import { WEB_VERSION } from "@/lib/version";
import { getLatestAppRelease } from "@/lib/app-release";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const decProfile = decryptProfile(user.profile);
  const profile = decProfile
    ? {
        gender: decProfile.gender,
        birthDate: decProfile.birthDate,
        heightCm: decProfile.heightCm,
        weightKg: decProfile.weightKg,
        activityLevel: decProfile.activityLevel,
        goal: decProfile.goal,
        calorieTarget: decProfile.calorieTarget
      }
    : null;
  const appConfig = user.isAdmin
    ? await prisma.appConfig.findUnique({ where: { id: "singleton" } })
    : null;
  const appRelease = await getLatestAppRelease();
  return (
    <>
      <header className="mt-6">
        <h1 className="text-4xl font-black tracking-tight">設定</h1>
        <p className="mt-1 text-sm text-stone-500">{user.email}</p>
      </header>

      <div className="mt-6 space-y-6">
        <div className="glass glass-lift rounded-[2rem] p-6">
          <h2 className="text-xl font-black">使用者設定</h2>
          <div className="mt-5">
            <ProfileMetabolismForm profile={profile} />
          </div>
        </div>
        <div className="glass glass-lift rounded-[2rem] p-6">
          <AiSettingsForm />
        </div>
        <Link className="glass glass-lift block rounded-[2rem] p-6" href="/dashboard/foods">
          <h2 className="text-xl font-black">我的食物管理</h2>
          <p className="mt-1 text-sm text-stone-500">前往獨立頁面搜尋、整理、批次封存與處理重複資料。</p>
        </Link>
        <GoogleLinkPanel clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID} linked={!!user.googleId} />
        {user.isAdmin && <AdminPanel registrationOpen={appConfig?.registrationOpen ?? true} />}
        <div className="glass glass-lift rounded-[2rem] p-6">
          <h2 className="text-xl font-black">版本資訊</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Metric label="最新版本" value={appRelease.version ? `v${appRelease.version}` : "—"} />
            <Metric label="目前版本" value={`v${WEB_VERSION}`} />
          </div>
          {appRelease.notes ? (
            <p className="mt-3 whitespace-pre-line text-xs text-stone-500">{appRelease.notes}</p>
          ) : null}
          {appRelease.apkKey ? (
            <a
              href="/api/app/download"
              className="mt-4 inline-block rounded-full bg-amber-700 px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-80"
            >
              下載 Android App (v{appRelease.version})
            </a>
          ) : null}
        </div>
        <div>
          <LogoutButton />
        </div>
      </div>
    </>
  );
}
