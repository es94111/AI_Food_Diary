import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { apiRoute, HttpError } from "@/lib/http";

export const DELETE = apiRoute(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await context.params;

  // Scope the delete to the owner so one user can't remove another's logs.
  const result = await prisma.waterLog.deleteMany({ where: { id, userId: user.id } });
  if (result.count === 0) throw new HttpError(404, "Not found", "找不到喝水紀錄。");

  return NextResponse.json({ ok: true });
});
