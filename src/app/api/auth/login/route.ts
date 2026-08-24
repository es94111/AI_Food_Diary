import { NextResponse } from "next/server";

const errorMessage = "帳密登入已停用，請使用 Google SSO 登入。";

// Keep the legacy endpoint explicit for older clients and bookmarked API calls,
// but never parse or authenticate password credentials.
export function POST() {
  return NextResponse.json({ error: errorMessage }, { status: 410 });
}
