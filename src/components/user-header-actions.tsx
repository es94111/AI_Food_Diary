"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProfileMetabolismForm } from "@/components/profile-metabolism-form";

type Profile = {
  gender?: string | null;
  birthDate?: Date | string | null;
  heightCm?: number | null;
  weightKg?: number | string | null;
  activityLevel?: string | null;
  goal?: string | null;
  calorieTarget?: number | null;
};

export function UserHeaderActions({ profile }: { profile?: Profile | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen(true)}
          className="flex cursor-pointer items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 transition-colors hover:bg-slate-50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
          使用者設定
        </button>
        <button
          onClick={logout}
          className="cursor-pointer rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-700"
        >
          登出
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-16 sm:pt-20">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-2xl font-black">使用者設定</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="關閉"
                className="cursor-pointer rounded-full bg-slate-100 p-2 text-slate-500 transition-colors hover:bg-slate-200"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <ProfileMetabolismForm profile={profile} onSaved={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
