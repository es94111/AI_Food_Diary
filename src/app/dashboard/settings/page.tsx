import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptProfile } from "@/lib/profile-crypto";
import { ProfileMetabolismForm } from "@/components/profile-metabolism-form";
import { AiSettingsForm } from "@/components/ai-settings-form";
import { LogoutButton } from "@/components/logout-button";
import { GoogleLinkPanel } from "@/components/google-link-panel";
import { AdminPanel } from "@/components/admin-panel";
import { SavedFoodsManager, type SavedFoodSource } from "@/components/saved-foods-manager";
import { Metric } from "@/components/health-cards";
import { decryptSavedFood } from "@/lib/b2-crypto";
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
  const savedFoods = await prisma.savedFood.findMany({
    where: { userId: user.id, archivedAt: null },
    orderBy: [{ isFavorite: "desc" }, { lastUsedAt: "desc" }, { useCount: "desc" }, { updatedAt: "desc" }]
  });

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
        <SavedFoodsManager
          initialFoods={savedFoods.map((food) => {
            const decrypted = decryptSavedFood(food);
            return {
              id: decrypted.id,
              barcode: decrypted.barcode,
              name: decrypted.name,
              estimatedAmount: decrypted.estimatedAmount,
              calories: decrypted.calories,
              protein: decrypted.protein,
              fat: decrypted.fat,
              carbs: decrypted.carbs,
              source: decrypted.source as SavedFoodSource,
              isFavorite: decrypted.isFavorite,
              useCount: decrypted.useCount,
              lastUsedAt: decrypted.lastUsedAt?.toISOString() ?? null
            };
          })}
        />
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
