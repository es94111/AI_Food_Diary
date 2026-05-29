import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "權限不足" }, { status: 403 });
  }

  const config = await prisma.appConfig.findUnique({ where: { id: "singleton" } });
  return NextResponse.json({ registrationOpen: config?.registrationOpen ?? true });
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "權限不足" }, { status: 403 });
  }

  const { registrationOpen } = await request.json();
  if (typeof registrationOpen !== "boolean") {
    return NextResponse.json({ error: "registrationOpen 必須是 boolean" }, { status: 400 });
  }

  const config = await prisma.appConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", registrationOpen },
    update: { registrationOpen }
  });

  return NextResponse.json({ registrationOpen: config.registrationOpen });
}
