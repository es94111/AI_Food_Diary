import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";

// Per-device logout: only drops this device's cookie. Other devices stay signed
// in. To revoke every session at once (e.g. a compromised account or future
// password change), bump the user's tokenVersion via invalidateUserSessions().
export async function POST() {
  await clearSession();
  return NextResponse.json({ ok: true });
}
