import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteAccount } from "@/lib/account-deletion";
import { clearSession, requireUser } from "@/lib/auth";
import { apiRoute, HttpError } from "@/lib/http";

const confirmationSchema = z
  .object({ confirmation: z.literal("DELETE") })
  .strict();

export const DELETE = apiRoute(async (request: Request) => {
  const user = await requireUser();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  if (!confirmationSchema.safeParse(body).success) {
    throw new HttpError(
      400,
      "Invalid deletion confirmation",
      "請輸入 DELETE 以確認永久刪除。",
    );
  }

  const photoCleanup = await deleteAccount(user.id);
  try {
    await clearSession();
  } catch {
    // The deleted user row already makes every session token invalid.
    console.error("Account deleted but its session cookie could not be cleared");
  }
  return NextResponse.json(
    { ok: true, photoCleanup },
    {
      status: photoCleanup === "pending" ? 202 : 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
});
