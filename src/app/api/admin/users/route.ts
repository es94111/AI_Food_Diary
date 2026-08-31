import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/lib/http";

export const GET = apiRoute(async () => {
  await requireAdmin();
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
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
  return NextResponse.json({ users });
});
