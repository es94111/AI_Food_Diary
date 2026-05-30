import "server-only";
import { createRemoteJWKSet, jwtVerify } from "jose";

// Google's public keys for verifying ID token signatures (cached by jose).
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export type GoogleIdentity = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
};

export class GoogleAuthError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/// Verifies a Google ID token (signature, issuer, audience) and returns the
/// verified identity. Throws GoogleAuthError on any problem.
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new GoogleAuthError("尚未設定 Google 登入（GOOGLE_CLIENT_ID）。", 400);
  }

  let payload: { sub?: string; email?: string; email_verified?: boolean | string; name?: string };
  try {
    const verified = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId
    });
    payload = verified.payload as typeof payload;
  } catch {
    throw new GoogleAuthError("Google 登入驗證失敗，請重試。", 401);
  }

  const email = payload.email?.toLowerCase();
  const emailVerified = payload.email_verified === true || payload.email_verified === "true";
  if (!payload.sub || !email || !emailVerified) {
    throw new GoogleAuthError("此 Google 帳號的 Email 未驗證。", 401);
  }

  return { sub: payload.sub, email, emailVerified, name: payload.name ?? null };
}
