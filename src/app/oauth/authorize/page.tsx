import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getMcpRuntimeConfig } from "@/lib/mcp/config";
import {
  createConsentToken,
  OAuthRequestError,
  validateAuthorizationRequest,
} from "@/lib/mcp/oauth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function toUrlSearchParams(values: Record<string, string | string[] | undefined>) {
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string") result.append(key, value);
    else if (Array.isArray(value)) value.forEach((item) => result.append(key, item));
  }
  return result;
}

const SCOPE_LABELS: Record<string, string> = {
  "meals:read": "查看與搜尋你的餐點",
  "meals:create": "新增餐點（不能修改或刪除）",
  "saved_foods:read": "查看與搜尋你的常用食物",
  "saved_foods:create": "新增常用食物（不能修改或刪除）",
  "water_logs:read": "查看你的飲水紀錄",
  "water_logs:create": "新增飲水紀錄（不能修改或刪除）",
};

export default async function OAuthAuthorizePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const rawParams = toUrlSearchParams(await searchParams);
  const returnPath = `/oauth/authorize?${rawParams.toString()}`;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnPath)}`);

  try {
    const config = getMcpRuntimeConfig();
    const authorization = await validateAuthorizationRequest(rawParams, config);
    const consentToken = await createConsentToken(user.id, authorization, config);
    return (
      <main className="flex min-h-dvh items-center justify-center px-6 py-12">
        <section className="glass iridescent w-full max-w-xl rounded-[2rem] p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-amber-700">
            ChatGPT MCP 授權
          </p>
          <h1 className="mt-2 text-3xl font-black">連結 AI Food Diary</h1>
          <p className="mt-3 text-stone-600">
            {authorization.clientName} 將代表 <strong>{user.email}</strong> 使用下列最小權限。
            MCP 永遠不能修改、刪除、覆寫、還原資料或變更權限。
          </p>
          <ul className="mt-6 space-y-3 rounded-2xl bg-white/70 p-5 text-sm text-stone-800">
            {authorization.scopes.map((scope) => (
              <li key={scope} className="flex gap-3">
                <span aria-hidden="true" className="text-emerald-700">✓</span>
                <span>{SCOPE_LABELS[scope] ?? scope}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-xs leading-5 text-stone-500">
            每次 AI 操作都會寫入不可變更的活動紀錄。由 AI 新增的資料只能由你在 Web 或 App
            中確認後還原，且後續有人工變更時會拒絕還原。
          </p>
          <form action="/oauth/authorize/decision" method="post" className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <input type="hidden" name="consent_token" value={consentToken} />
            <button
              type="submit"
              name="decision"
              value="deny"
              className="min-h-12 rounded-xl border border-stone-300 px-5 font-semibold text-stone-700"
            >
              取消
            </button>
            <button
              type="submit"
              name="decision"
              value="approve"
              className="min-h-12 rounded-xl bg-amber-600 px-5 font-bold text-white shadow-sm hover:bg-amber-700"
            >
              允許連結
            </button>
          </form>
        </section>
      </main>
    );
  } catch (error) {
    const message =
      error instanceof OAuthRequestError
        ? error.message
        : "授權服務目前無法完成請求。";
    return (
      <main className="flex min-h-dvh items-center justify-center px-6 py-12">
        <section className="glass w-full max-w-lg rounded-[2rem] p-8">
          <h1 className="text-2xl font-black">無法授權連結</h1>
          <p className="mt-3 text-stone-600">{message}</p>
        </section>
      </main>
    );
  }
}

