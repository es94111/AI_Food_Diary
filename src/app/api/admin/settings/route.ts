import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/lib/http";

export const GET = apiRoute(async () => {
  await requireAdmin();
  const config = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
  return NextResponse.json({ registrationOpen: config?.registrationOpen ?? true });
});

export const PATCH = apiRoute(async (request: Request) => {
  await requireAdmin();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "request body 必須是 JSON" }, { status: 400 });
  }
  const registrationOpen = (body as { registrationOpen?: unknown } | null)?.registrationOpen;
  if (typeof registrationOpen !== "boolean") {
    return NextResponse.json({ error: "registrationOpen 必須是 boolean" }, { status: 400 });
  }

  const config = await prisma.appConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", registrationOpen },
    update: { registrationOpen }
  });

  return NextResponse.json({ registrationOpen: config.registrationOpen });
});
