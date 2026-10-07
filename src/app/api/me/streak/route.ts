import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { apiRoute } from "@/lib/http";
import { getRecordingStreak } from "@/lib/recording-streak-data";
import { resolveRequestTz } from "@/lib/timezone";

export const GET = apiRoute(async (request: Request) => {
  const user = await requireUser();
  const timeZone = resolveRequestTz(request, user.profile?.timezone);
  const streak = await getRecordingStreak(user.id, timeZone);
  return NextResponse.json({ streak });
});
