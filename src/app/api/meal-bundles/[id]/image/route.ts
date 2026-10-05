import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/lib/http";
import { enforceMealBundleReadRateLimit } from "@/lib/rate-limit";
import { getDecryptedImage, isStorageKey } from "@/lib/storage";

const SERVABLE_CONTENT_TYPE = /^image\/(?:jpeg|png|webp|gif|avif)$/i;

export const GET = apiRoute(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const limited = await enforceMealBundleReadRateLimit(user.id);
  if (limited) return limited;
  const { id } = await context.params;
  const bundle = await prisma.mealBundle.findFirst({ where: { id, userId: user.id }, select: { imageStorageKey: true } });
  const key = bundle?.imageStorageKey;
  if (!key) return NextResponse.json({ error: "找不到圖片。" }, { status: 404 });

  if (!isStorageKey(key)) {
    const match = key.match(/^data:([^;]+);base64,(.+)$/);
    if (!match || !SERVABLE_CONTENT_TYPE.test(match[1])) {
      return NextResponse.json({ error: "圖片格式不支援。" }, { status: 400 });
    }
    return new NextResponse(Buffer.from(match[2], "base64"), {
      headers: { "Content-Type": match[1], "Cache-Control": "private, no-store" }
    });
  }

  const image = await getDecryptedImage(key);
  if (!image) return NextResponse.json({ error: "找不到圖片。" }, { status: 404 });
  return new NextResponse(new Uint8Array(image.body), {
    headers: { "Content-Type": image.contentType, "Cache-Control": "private, max-age=60" }
  });
});
