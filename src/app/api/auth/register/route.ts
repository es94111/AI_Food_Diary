import { NextResponse } from "next/server";

const errorMessage = "帳密註冊已停用，請使用 Google SSO 建立帳號。";

// Keep the legacy endpoint explicit for older clients and bookmarked API calls,
// but never parse or create accounts from password credentials.
export function POST() {
  return NextResponse.json({ error: errorMessage }, { status: 410 });
}
