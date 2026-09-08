import { redirect } from "next/navigation";
import { AiActivityList } from "@/components/ai-activity-list";
import { getCurrentUser } from "@/lib/auth";

export default async function AiActivityPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <>
      <header className="mt-6">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-800">Immutable audit trail</p>
        <h1 className="mt-1 text-4xl font-black tracking-tight">AI 操作紀錄</h1>
        <p className="mt-2 max-w-3xl text-sm text-stone-600">查看 ChatGPT MCP 的讀取、新增與失敗事件。每筆紀錄皆為 append-only；還原只會由你確認後透過 Web/App 執行。</p>
      </header>
      <AiActivityList isAdmin={user.isAdmin} />
    </>
  );
}

