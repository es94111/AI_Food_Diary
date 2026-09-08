import Link from "next/link";
import { AiActivityDetail } from "@/components/ai-activity-detail";

export default async function AiActivityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <header className="mt-6">
        <Link className="text-sm font-semibold text-amber-800 underline-offset-4 hover:underline" href="/dashboard/ai-activity">← 返回 AI 操作紀錄</Link>
        <h1 className="mt-3 text-4xl font-black tracking-tight">AI 操作詳情</h1>
      </header>
      <AiActivityDetail eventId={id} />
    </>
  );
}

