import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dayRangeUtc, normalizeDateStr, todayStr } from "@/lib/dates";
import { apiRoute, HttpError } from "@/lib/http";
import { enforceWaterReadRateLimit, enforceWaterWriteRateLimit } from "@/lib/rate-limit";
import { resolveRequestTz } from "@/lib/timezone";
import { waterLogSchema } from "@/lib/validators";
import { MAX_WATER_LOGS_PER_DAY } from "@/lib/water-limits";

export const GET = apiRoute(async (request: Request) => {
  const user = await requireUser();
  const limited = await enforceWaterReadRateLimit(user.id);
  if (limited) return limited;
  const url = new URL(request.url);
  const tz = resolveRequestTz(request, user.profile?.timezone);
  const dateStr = normalizeDateStr(url.searchParams.get("date"), tz);
  const { start, end } = dayRangeUtc(dateStr, tz);
  const where = { userId: user.id, drankAt: { gte: start, lt: end } };

  const [logs, total] = await Promise.all([
    prisma.waterLog.findMany({
      where,
      orderBy: { drankAt: "desc" },
      take: MAX_WATER_LOGS_PER_DAY
    }),
    prisma.waterLog.aggregate({ where, _sum: { amountMl: true } })
  ]);

  const totalMl = total._sum.amountMl ?? 0;
  return NextResponse.json({ logs, totalMl });
});

export const POST = apiRoute(async (request: Request) => {
  const user = await requireUser();
  const limited = await enforceWaterWriteRateLimit(user.id);
  if (limited) return limited;
  const body = waterLogSchema.parse(await request.json());
  const tz = resolveRequestTz(request, user.profile?.timezone);
  const drankAt = body.drankAt ? new Date(body.drankAt) : new Date();
  const { start, end } = dayRangeUtc(todayStr(tz, drankAt), tz);

  const log = await prisma.$transaction(async (tx) => {
    const dayCount = await tx.waterLog.count({
      where: { userId: user.id, drankAt: { gte: start, lt: end } }
    });
    if (dayCount >= MAX_WATER_LOGS_PER_DAY) {
      throw new HttpError(429, "Water log day limit exceeded", "單日飲水紀錄已達上限，請刪除多餘紀錄後再試。");
    }
    return tx.waterLog.create({
      data: { userId: user.id, amountMl: body.amountMl, drankAt }
    });
  });
  return NextResponse.json({ log });
});
