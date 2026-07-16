import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/lib/http";
import { savedFoodBatchArchiveSchema } from "@/lib/validators";

export const PATCH = apiRoute(async (request: Request) => {
  const user = await requireUser();
  const { ids } = savedFoodBatchArchiveSchema.parse(await request.json());
  const uniqueIds = [...new Set(ids)];
  const result = await prisma.savedFood.updateMany({
    where: { id: { in: uniqueIds }, userId: user.id, archivedAt: null },
    data: { archivedAt: new Date() }
  });
  return NextResponse.json({ archivedCount: result.count });
});
