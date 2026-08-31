import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/lib/http";

const patchSchema = z.object({
  isDisabled: z.boolean()
});

export const PATCH = apiRoute(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const admin = await requireAdmin();
  const { id } = await context.params;
  const body = patchSchema.parse(await request.json());

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, isAdmin: true, isDisabled: true, createdAt: true, updatedAt: true }
  });
  if (!target) return NextResponse.json({ error: "找不到使用者。" }, { status: 404 });

  if (body.isDisabled && target.id === admin.id) {
    return NextResponse.json({ error: "不能停用目前登入的管理員帳號。" }, { status: 400 });
  }
  if (body.isDisabled && target.isAdmin) {
    return NextResponse.json({ error: "不能從此功能停用管理員帳號。" }, { status: 400 });
  }

  if (target.isDisabled === body.isDisabled) {
    return NextResponse.json({ user: target });
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      isDisabled: body.isDisabled,
      // Immediately invalidate every existing JWT for this account. Re-enable
      // also bumps the version so no token issued before the state transition
      // can become valid again.
      tokenVersion: { increment: 1 }
    },
    select: {
      id: true,
      email: true,
      name: true,
      isAdmin: true,
      isDisabled: true,
      createdAt: true,
      updatedAt: true
    }
  });

  return NextResponse.json({ user });
});
