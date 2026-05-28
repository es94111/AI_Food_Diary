"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { calculateBmr, calculateTdee, calorieTargetFromGoal } from "@/lib/metabolism";

type Profile = {
  gender?: string | null;
  birthDate?: Date | string | null;
  heightCm?: number | null;
  weightKg?: number | string | null;
  activityLevel?: string | null;
  goal?: string | null;
  calorieTarget?: number | null;
};

export function ProfileMetabolismForm({ profile }: { profile?: Profile | null }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [gender, setGender] = useState(profile?.gender ?? "MALE");
  const [birthDateValue, setBirthDateValue] = useState(profile?.birthDate ? new Date(profile.birthDate).toISOString().slice(0, 10) : "");
  const [heightCm, setHeightCm] = useState(profile?.heightCm ? String(profile.heightCm) : "");
  const [weightKg, setWeightKg] = useState(profile?.weightKg ? String(Number(profile.weightKg)) : "");
  const [activityLevel, setActivityLevel] = useState(profile?.activityLevel ?? "SEDENTARY");
  const [goal, setGoal] = useState(profile?.goal ?? "MAINTAIN");
  const birthDate = profile?.birthDate ? new Date(profile.birthDate).toISOString().slice(0, 10) : "";
  const bmr = calculateBmr({ gender, birthDate: birthDateValue, heightCm: Number(heightCm), weightKg: Number(weightKg) });
  const tdee = calculateTdee(bmr, activityLevel);
  const calorieTarget = calorieTargetFromGoal(tdee, goal) ?? profile?.calorieTarget ?? 2000;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setMessage("");
    const response = await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gender: formData.get("gender") || undefined,
        birthDate: formData.get("birthDate") || undefined,
        heightCm: formData.get("heightCm") || undefined,
        weightKg: formData.get("weightKg") || undefined,
        activityLevel: formData.get("activityLevel") || undefined,
        goal: formData.get("goal") || undefined,
        calorieTarget
      })
    });
    if (!response.ok) {
      setMessage("儲存失敗，請確認資料格式。");
      return;
    }
    setMessage("已更新 BMR/TDEE 資料。");
    router.refresh();
  }

  return (
    <form className="rounded-[2rem] bg-white p-6 shadow-sm" onSubmit={onSubmit}>
      <h2 className="text-2xl font-black">BMR / TDEE 設定</h2>
      <p className="mt-2 text-sm text-slate-600">填寫身體資料後會自動估算基礎代謝與每日總消耗。</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <select className="rounded-xl border border-slate-200 px-3 py-2" name="gender" onChange={(event) => setGender(event.target.value)} value={gender}>
          <option value="MALE">男性</option>
          <option value="FEMALE">女性</option>
        </select>
        <input className="rounded-xl border border-slate-200 px-3 py-2" name="birthDate" onChange={(event) => setBirthDateValue(event.target.value)} type="date" value={birthDateValue || birthDate} />
        <input className="rounded-xl border border-slate-200 px-3 py-2" name="heightCm" onChange={(event) => setHeightCm(event.target.value)} placeholder="身高 cm" type="number" value={heightCm} />
        <input className="rounded-xl border border-slate-200 px-3 py-2" name="weightKg" onChange={(event) => setWeightKg(event.target.value)} placeholder="體重 kg" type="number" step="0.1" value={weightKg} />
        <select className="rounded-xl border border-slate-200 px-3 py-2" name="activityLevel" onChange={(event) => setActivityLevel(event.target.value)} value={activityLevel}>
          <option value="SEDENTARY">久坐少動</option>
          <option value="LIGHT">輕度活動</option>
          <option value="MODERATE">中度活動</option>
          <option value="HIGH">高度活動</option>
          <option value="ATHLETE">運動員等級</option>
        </select>
        <select className="rounded-xl border border-slate-200 px-3 py-2" name="goal" onChange={(event) => setGoal(event.target.value)} value={goal}>
          <option value="LOSE_FAT">減脂</option>
          <option value="MAINTAIN">維持</option>
          <option value="BUILD_MUSCLE">增肌</option>
        </select>
        <div className="rounded-xl bg-slate-50 px-3 py-2 sm:col-span-2">
          <p className="text-xs text-slate-500">自動熱量目標</p>
          <p className="text-2xl font-black">{calorieTarget} kcal</p>
          <p className="text-xs text-slate-500">依 TDEE 與目標自動計算：減脂 -400、增肌 +250、維持 = TDEE。</p>
        </div>
      </div>
      {message ? <p className="mt-3 text-sm text-emerald-700">{message}</p> : null}
      <button className="mt-4 w-full rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white" type="submit">儲存身體資料</button>
    </form>
  );
}
