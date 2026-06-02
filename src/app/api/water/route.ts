import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dayRangeUtc, normalizeDateStr } from "@/lib/dates";
import { apiRoute } from "@/lib/http";
import { resolveRequestTz } from "@/lib/timezone";
import { waterLogSchema } from "@/lib/validators";

export const GET = apiRoute(async (request: Request) => {
  const user = await requireUser();
  const url = new URL(request.url);
  const tz = resolveRequestTz(request, user.profile?.timezone);
  const dateStr = normalizeDateStr(url.searchParams.get("date"), tz);
  const { start, end } = dayRangeUtc(dateStr, tz);

  const logs = await prisma.waterLog.findMany({
    where: { userId: user.id, drankAt: { gte: start, lt: end } },
    orderBy: { drankAt: "desc" }
  });

  const totalMl = logs.reduce((sum, log) => sum + log.amountMl, 0);
  return NextResponse.json({ logs, totalMl });
});

export const POST = apiRoute(async (request: Request) => {
  const user = await requireUser();
  const body = waterLogSchema.parse(await request.json());
  const log = await prisma.waterLog.create({
    data: {
      userId: user.id,
      amountMl: body.amountMl,
      drankAt: body.drankAt ? new Date(body.drankAt) : new Date()
    }
  });
  return NextResponse.json({ log });
});
