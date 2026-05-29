import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createHealthSyncToken, hashHealthSyncToken } from "@/lib/health-auth";

const connectionSchema = z.object({
  deviceName: z.string().min(1).max(120).optional(),
  provider: z.string().min(1).max(80).default("HEALTH_CONNECT")
});

export async function GET() {
  try {
    const user = await requireUser();
    const connections = await prisma.healthConnection.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        provider: true,
        deviceName: true,
        lastSyncedAt: true,
        revokedAt: true,
        createdAt: true
      }
    });

    return NextResponse.json({ connections });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "Unauthorized") return NextResponse.json({ error: "請先登入後再查看健康同步裝置。" }, { status: 401 });
    return NextResponse.json({ error: "健康同步裝置讀取失敗，請稍後再試。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = connectionSchema.parse(await request.json());
    const token = createHealthSyncToken();
    const connection = await prisma.healthConnection.create({
      data: {
        userId: user.id,
        provider: body.provider,
        deviceName: body.deviceName,
        tokenHash: hashHealthSyncToken(token)
      },
      select: {
        id: true,
        provider: true,
        deviceName: true,
        createdAt: true
      }
    });

    return NextResponse.json({ connection, token });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "Unauthorized") return NextResponse.json({ error: "請先登入後再建立健康同步裝置。" }, { status: 401 });
    return NextResponse.json({ error: "健康同步裝置建立失敗，請稍後再試。" }, { status: 500 });
  }
}
