import { NextResponse } from "next/server";

const errorMessage = "公開帳密註冊已停用，登入與註冊請一律使用 Google SSO。";

// The old admin registration toggle is intentionally inert. Keep explicit
// responses for older app builds instead of allowing them to mistake a legacy
// setting for an active account-creation control.
export function GET() {
  return NextResponse.json({ error: errorMessage }, { status: 410 });
}

export function PATCH() {
  return NextResponse.json({ error: errorMessage }, { status: 410 });
}
