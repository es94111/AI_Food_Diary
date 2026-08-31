import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/lib/http";

const patchSchema = z.object({
  registrationOpen: z.boolean()
});

export const GET = apiRoute(async () => {
  await requireAdmin();
  const config = await prisma.appConfig.findUnique({
    where: { id: "singleton" },
    select: { registrationOpen: true }
  });
  return NextResponse.json({ registrationOpen: config?.registrationOpen ?? true });
});

export const PATCH = apiRoute(async (request: Request) => {
  await requireAdmin();
  const body = patchSchema.parse(await request.json());
  const config = await prisma.appConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", registrationOpen: body.registrationOpen },
    update: { registrationOpen: body.registrationOpen },
    select: { registrationOpen: true }
  });
  return NextResponse.json(config);
});
