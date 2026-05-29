import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";

export function createHealthSyncToken() {
  return `hcs_${randomBytes(32).toString("base64url")}`;
}

export function hashHealthSyncToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function getHealthSyncUserId(request: Request) {
  const header = request.headers.get("authorization");
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return null;

  const connection = await prisma.healthConnection.findFirst({
    where: { tokenHash: hashHealthSyncToken(token), revokedAt: null },
    select: { id: true, userId: true }
  });
  if (!connection) return null;

  return connection;
}
