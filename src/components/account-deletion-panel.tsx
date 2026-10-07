"use client";

import { useState } from "react";
import Link from "next/link";
import {
  clearDeletedAccountPwaState,
  type AccountDeletionBrowserCleanup,
} from "@/lib/account-deletion-client";
import { setPwaLogoutInProgress } from "@/lib/pwa-storage";

export function getAccountDeletionCleanupNoticeModel(
  cleanup: AccountDeletionBrowserCleanup,
  serverDeletionStatus: "complete" | "unknown",
) {
  const failedSurfaces = [
    ...(cleanup.localStorage === "failed" ? ["本機草稿與應用狀態"] : []),
    ...(cleanup.caches === "failed" ? ["離線快取"] : []),
  ];
  if (failedSurfaces.length === 0) return null;

  return {
    heading: `${serverDeletionStatus === "complete" ? "帳號與伺服器資料已刪除，但無法清除" : "無法確認伺服器刪除結果，且無法清除"}：${failedSurfaces.join("、")}。`,
    guidance: "可重試自動清除；若仍失敗，請在瀏覽器的此網站設定中清除網站資料與快取。伺服器刪除無法復原。",
    failedSurfaces,
  };
}

export function AccountDeletionCleanupNotice({
  cleanup,
  retrying,
  onRetry,
  serverDeletionStatus,
}: {
  cleanup: AccountDeletionBrowserCleanup;
  retrying: boolean;
  onRetry: () => void;
  serverDeletionStatus: "complete" | "unknown";
}) {
  const notice = getAccountDeletionCleanupNoticeModel(cleanup, serverDeletionStatus);
  if (!notice) return null;

  return (
    <div className="mt-4 rounded-2xl border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
      <p className="font-bold">{notice.heading}</p>
      <p className="mt-2">{notice.guidance}</p>
      <button
        className="mt-3 rounded-full bg-white px-4 py-2 font-semibold shadow-sm disabled:opacity-50"
        type="button"
        onClick={onRetry}
        disabled={retrying}
      >
        {retrying ? "正在重試…" : "重試清除本機資料"}
      </button>
    </div>
  );
}

export function AccountDeletionPanel() {
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleted, setDeleted] = useState(false);
  const [photoCleanupPending, setPhotoCleanupPending] = useState(false);
  const [browserCleanup, setBrowserCleanup] = useState<AccountDeletionBrowserCleanup | null>(null);
  const [retryingBrowserCleanup, setRetryingBrowserCleanup] = useState(false);

  async function retryBrowserCleanup() {
    setRetryingBrowserCleanup(true);
    try {
      setBrowserCleanup(await clearDeletedAccountPwaState());
    } finally {
      setRetryingBrowserCleanup(false);
    }
  }

  async function deleteAccount() {
    setPending(true);
    setError(null);
    setPwaLogoutInProgress(true);
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: unknown;
        photoCleanup?: unknown;
      };
      if (!response.ok) {
        setPwaLogoutInProgress(false);
        setError(
          typeof body.error === "string"
            ? body.error
            : "帳號刪除失敗，請稍後再試。",
        );
        return;
      }
      setBrowserCleanup(await clearDeletedAccountPwaState());
      setPhotoCleanupPending(body.photoCleanup === "pending");
      setDeleted(true);
    } catch {
      setBrowserCleanup(await clearDeletedAccountPwaState());
      setError("無法確認刪除結果；為保護隱私，已嘗試清除本機草稿與快取。若帳號已刪除，既有登入也已失效。");
    } finally {
      setPending(false);
    }
  }

  if (deleted) {
    return (
      <section className="glass rounded-[2rem] border border-rose-300/70 p-6" aria-labelledby="account-deletion-title">
        <h2 id="account-deletion-title" className="text-xl font-black text-rose-800">
          帳號已刪除
        </h2>
        <p className="mt-2 text-sm text-stone-600" role="status">
          {photoCleanupPending
            ? "帳號與伺服器資料已永久刪除並登出；照片清理尚未完成，待處理工作可由維運人員重試。"
            : "帳號與伺服器資料已永久刪除，所有登入工作階段均已失效。"}
        </p>
        {browserCleanup ? (
          <AccountDeletionCleanupNotice
            cleanup={browserCleanup}
            retrying={retryingBrowserCleanup}
            onRetry={retryBrowserCleanup}
            serverDeletionStatus="complete"
          />
        ) : null}
        <Link className="mt-4 inline-block rounded-full bg-white px-5 py-3 font-semibold shadow-sm" href="/login">
          前往登入頁
        </Link>
      </section>
    );
  }

  return (
    <section className="glass rounded-[2rem] border border-rose-300/70 p-6" aria-labelledby="account-deletion-title">
      <h2 id="account-deletion-title" className="text-xl font-black text-rose-800">
        永久刪除帳號
      </h2>
      <p className="mt-2 text-sm text-stone-600">
        這會刪除你的個人設定、餐點與照片、常用食物、餐組、飲水、每日／每週摘要、健康資料及未使用的 OAuth 授權碼，並立即撤銷登入。此操作無法復原；請先保存你需要保留的資料。
      </p>
      <p className="mt-2 text-sm text-stone-600">
        為維持不可變稽核歷史，AI 操作紀錄會保留（包含加密的前後狀態），但會解除與你的帳號及還原者身分連結。
        若照片儲存服務暫時無法使用，帳號仍會刪除，照片清理會保留待重試工作。
      </p>
      <p className="mt-4 text-sm font-semibold text-stone-700">
        刪除前請先下載你想保留的資料副本。
      </p>
      <a
        href="/api/me/data/export"
        className="mt-2 inline-block rounded-full bg-white px-5 py-3 font-semibold text-stone-800 shadow-sm"
      >
        下載我的資料
      </a>
      <label className="mt-5 block text-sm font-semibold text-stone-700" htmlFor="account-deletion-confirmation">
        輸入 DELETE 以確認
      </label>
      <input
        id="account-deletion-confirmation"
        autoComplete="off"
        className="mt-2 w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-200"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        disabled={pending}
      />
      <button
        className="mt-4 rounded-full bg-rose-700 px-5 py-3 font-semibold text-white transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
        type="button"
        onClick={deleteAccount}
        disabled={pending || confirmation !== "DELETE"}
      >
        {pending ? "正在刪除…" : "永久刪除我的帳號"}
      </button>
      {error ? (
        <p className="mt-3 text-sm text-rose-800" role="alert">
          {error}
        </p>
      ) : null}
      {browserCleanup ? (
        <AccountDeletionCleanupNotice
          cleanup={browserCleanup}
          retrying={retryingBrowserCleanup}
          onRetry={retryBrowserCleanup}
          serverDeletionStatus="unknown"
        />
      ) : null}
    </section>
  );
}
