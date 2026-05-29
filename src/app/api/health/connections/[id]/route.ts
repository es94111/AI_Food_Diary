import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await prisma.healthConnection.updateMany({
      where: { id, userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "Unauthorized") return NextResponse.json({ error: "請先登入後再撤銷健康同步裝置。" }, { status: 401 });
    return NextResponse.json({ error: "健康同步裝置撤銷失敗，請稍後再試。" }, { status: 500 });
  }
}
