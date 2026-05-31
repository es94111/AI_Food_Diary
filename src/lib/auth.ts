import "server-only";

import argon2 from "argon2";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { forbidden, unauthorized } from "@/lib/http";

const cookieName = "food_diary_session";

function getJwtSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET is required");
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string) {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}

export async function createSession(userId: string, tokenVersion: number) {
  // `tv` lets us revoke outstanding tokens by bumping the user's tokenVersion
  // (see invalidateUserSessions) without server-side session storage.
  const token = await new SignJWT({ userId, tv: tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getJwtSecret());

  const cookieStore = await cookies();
  cookieStore.set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
}

// Revokes every outstanding token for the current user by bumping tokenVersion.
// This is the "sign out of all devices" / compromised-account escape hatch (and
// the hook for a future password-change flow) — normal per-device logout does
// NOT call this. Returns the userId, or null if no valid session was present.
export async function invalidateUserSessions(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    if (typeof payload.userId !== "string") return null;
    await prisma.user.update({
      where: { id: payload.userId },
      data: { tokenVersion: { increment: 1 } }
    });
    return payload.userId;
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getJwtSecret());
    if (typeof payload.userId !== "string") return null;

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true, isAdmin: true, googleId: true, tokenVersion: true, profile: true }
    });
    if (!user) return null;

    // Reject tokens issued before the current tokenVersion. Tokens minted before
    // this field existed carry no `tv`; treat them as 0 so existing logins survive.
    const tokenVersion = typeof payload.tv === "number" ? payload.tv : 0;
    if (tokenVersion !== user.tokenVersion) return null;

    // Drop tokenVersion (internal) from the object handed to callers/responses.
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isAdmin: user.isAdmin,
      googleId: user.googleId,
      profile: user.profile
    };
  } catch {
    return null;
  }
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return user;
}

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  if (!user.isAdmin) throw forbidden();
  return user;
}
