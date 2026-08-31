"use client";

import { useCallback, useEffect, useState } from "react";

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  isAdmin: boolean;
  isDisabled: boolean;
  createdAt: string;
  updatedAt: string;
};

function errorText(body: unknown, fallback: string) {
  if (body && typeof body === "object" && "error" in body && typeof (body as { error?: unknown }).error === "string") {
    return (body as { error: string }).error;
  }
  return fallback;
}

export function AdminControlPanel({ currentUserId }: { currentUserId: string }) {
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRegistration, setSavingRegistration] = useState(false);
  const [changingUserId, setChangingUserId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [settingsRes, usersRes] = await Promise.all([
        fetch("/api/admin/settings", { cache: "no-store" }),
        fetch("/api/admin/users", { cache: "no-store" })
      ]);
      const settingsBody = await settingsRes.json().catch(() => null);
      const usersBody = await usersRes.json().catch(() => null);
      if (!settingsRes.ok) throw new Error(errorText(settingsBody, `讀取註冊設定失敗（HTTP ${settingsRes.status}）`));
      if (!usersRes.ok) throw new Error(errorText(usersBody, `讀取使用者清單失敗（HTTP ${usersRes.status}）`));
      setRegistrationOpen(Boolean((settingsBody as { registrationOpen?: boolean }).registrationOpen));
      setUsers(Array.isArray((usersBody as { users?: AdminUser[] }).users) ? (usersBody as { users: AdminUser[] }).users : []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "讀取管理資料失敗。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateRegistration(next: boolean) {
    setSavingRegistration(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationOpen: next })
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorText(body, `更新註冊設定失敗（HTTP ${res.status}）`));
      setRegistrationOpen(Boolean((body as { registrationOpen?: boolean }).registrationOpen));
      setMessage(next ? "已允許新使用者透過 Google SSO 建立帳號。" : "已關閉新使用者註冊；既有帳號仍可登入。");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新註冊設定失敗。");
    } finally {
      setSavingRegistration(false);
    }
  }

  async function updateUserStatus(user: AdminUser, isDisabled: boolean) {
    if (isDisabled && !window.confirm(`確定要停用 ${user.email}？\n此使用者目前所有登入工作階段會立即失效。`)) return;
    setChangingUserId(user.id);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isDisabled })
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorText(body, `更新使用者失敗（HTTP ${res.status}）`));
      const updated = (body as { user: AdminUser }).user;
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setMessage(isDisabled ? `已停用 ${user.email}。` : `已重新啟用 ${user.email}。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "更新使用者失敗。");
    } finally {
      setChangingUserId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="glass glass-lift rounded-[2rem] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">新使用者註冊</h2>
            <p className="mt-2 max-w-2xl text-sm text-stone-500">
              控制是否允許尚未建立帳號的人透過 Google SSO 建立新帳號。關閉後，既有使用者仍可正常登入；第一位系統使用者仍可建立以完成管理員初始化。
            </p>
          </div>
          <button
            type="button"
            disabled={loading || savingRegistration || registrationOpen === null}
            onClick={() => registrationOpen !== null && void updateRegistration(!registrationOpen)}
            className={`rounded-full px-5 py-2.5 text-sm font-bold text-white disabled:opacity-40 ${registrationOpen ? "bg-emerald-700" : "bg-stone-700"}`}
          >
            {savingRegistration ? "更新中…" : registrationOpen ? "目前：允許註冊" : "目前：關閉註冊"}
          </button>
        </div>
      </section>

      <section className="glass glass-lift rounded-[2rem] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">使用者管理</h2>
            <p className="mt-2 text-sm text-stone-500">
              可查看所有帳號並停用一般使用者。停用會立即撤銷該使用者所有既有登入權杖，之後也無法再次登入。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="rounded-full border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700 disabled:opacity-40"
          >
            {loading ? "載入中…" : "重新整理"}
          </button>
        </div>

        {message ? <div className="mt-4 rounded-2xl bg-stone-100 px-4 py-3 text-sm text-stone-700">{message}</div> : null}

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-stone-200 text-stone-500">
              <tr>
                <th className="px-3 py-3 font-semibold">使用者</th>
                <th className="px-3 py-3 font-semibold">角色</th>
                <th className="px-3 py-3 font-semibold">狀態</th>
                <th className="px-3 py-3 font-semibold">建立時間</th>
                <th className="px-3 py-3 text-right font-semibold">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = user.id === currentUserId;
                const canDisable = !user.isAdmin && !isSelf;
                return (
                  <tr key={user.id} className="border-b border-stone-100 last:border-0">
                    <td className="px-3 py-4">
                      <div className="font-bold text-stone-900">{user.name || "未設定名稱"}</div>
                      <div className="text-xs text-stone-500">{user.email}</div>
                    </td>
                    <td className="px-3 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${user.isAdmin ? "bg-amber-100 text-amber-800" : "bg-stone-100 text-stone-600"}`}>
                        {user.isAdmin ? "管理員" : "使用者"}
                      </span>
                    </td>
                    <td className="px-3 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${user.isDisabled ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                        {user.isDisabled ? "已停用" : "正常"}
                      </span>
                    </td>
                    <td className="px-3 py-4 text-stone-600">{new Date(user.createdAt).toLocaleString("zh-TW")}</td>
                    <td className="px-3 py-4 text-right">
                      {user.isDisabled ? (
                        <button
                          type="button"
                          onClick={() => void updateUserStatus(user, false)}
                          disabled={changingUserId === user.id}
                          className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
                        >
                          {changingUserId === user.id ? "處理中…" : "重新啟用"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void updateUserStatus(user, true)}
                          disabled={!canDisable || changingUserId === user.id}
                          title={!canDisable ? (isSelf ? "不能停用目前登入的帳號" : "管理員帳號不能在此停用") : undefined}
                          className="rounded-full bg-red-700 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          {changingUserId === user.id ? "處理中…" : "停用"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!loading && users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-stone-500">目前沒有使用者資料。</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
