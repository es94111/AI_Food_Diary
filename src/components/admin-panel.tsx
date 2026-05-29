"use client";

import { useState } from "react";

export function AdminPanel({ registrationOpen: initial }: { registrationOpen: boolean }) {
  const [registrationOpen, setRegistrationOpen] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function toggle() {
    setSaving(true);
    setMessage("");
    const next = !registrationOpen;
    const response = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registrationOpen: next })
    });
    setSaving(false);
    if (response.ok) {
      setRegistrationOpen(next);
      setMessage(next ? "已開放公開註冊" : "已關閉公開註冊");
      setTimeout(() => setMessage(""), 3000);
    }
  }

  return (
    <div className="glass glass-lift rounded-[2rem] p-6">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-stone-800 text-white">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </span>
        <h2 className="text-xl font-black">管理員設定</h2>
      </div>

      <div className="mt-5 flex items-center justify-between gap-4">
        <div>
          <p className="font-semibold text-stone-800">公開開放註冊</p>
          <p className="mt-0.5 text-sm text-stone-500">
            {registrationOpen ? "任何人可自行建立帳號。" : "已關閉，新用戶需由管理員建立帳號。"}
          </p>
        </div>
        <button
          onClick={toggle}
          disabled={saving}
          aria-label={registrationOpen ? "關閉公開註冊" : "開放公開註冊"}
          className="relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-60"
          style={{ background: registrationOpen ? "#b45309" : "#a8a29e" }}
        >
          <span
            className="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200"
            style={{ transform: registrationOpen ? "translateX(26px)" : "translateX(4px)" }}
          />
        </button>
      </div>

      {message && (
        <p className="mt-3 text-sm font-medium text-amber-700">{message}</p>
      )}
    </div>
  );
}
