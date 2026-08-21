import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { apiRoute } from "@/lib/http";
import { getDecryptedImage, isStorageKey } from "@/lib/storage";
import { parseThumbWidth, resizeImageBytes } from "@/lib/image-thumb";

// Legacy rows may hold a raw data-URL key. Only serve actual image types —
// serving an arbitrary stored content-type (e.g. text/html) would be stored XSS.
const SERVABLE_CONTENT_TYPE = /^image\/(?:jpeg|png|webp|gif|avif)$/i;

export const GET = apiRoute(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await context.params;
  const width = parseThumbWidth(new URL(request.url).searchParams.get("w"));
  const food = await prisma.savedFood.findFirst({
    where: { id, userId: user.id },
    select: { imageStorageKey: true }
  });

  if (!food?.imageStorageKey) return NextResponse.json({ error: "找不到圖片" }, { status: 404 });

  if (!isStorageKey(food.imageStorageKey)) {
    const match = food.imageStorageKey.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return NextResponse.json({ error: "圖片格式不支援" }, { status: 400 });
    if (!SERVABLE_CONTENT_TYPE.test(match[1])) {
      return NextResponse.json({ error: "圖片格式不支援" }, { status: 400 });
    }
    const body = Buffer.from(match[2], "base64");
    if (width != null) {
      const thumb = await resizeImageBytes(body, match[1], width);
      if (thumb) {
        return new NextResponse(new Uint8Array(thumb.body), {
          headers: { "Content-Type": thumb.contentType, "Cache-Control": "private, max-age=3600" }
        });
      }
    }
    return new NextResponse(body, {
      headers: { "Content-Type": match[1], "Cache-Control": "private, no-store" }
    });
  }

  const image = await getDecryptedImage(food.imageStorageKey);
  if (!image) return NextResponse.json({ error: "找不到圖片" }, { status: 404 });
  if (width != null) {
    const thumb = await resizeImageBytes(image.body, image.contentType, width);
    if (thumb) {
      return new NextResponse(new Uint8Array(thumb.body), {
        headers: { "Content-Type": thumb.contentType, "Cache-Control": "private, max-age=3600" }
      });
    }
  }
  return new NextResponse(new Uint8Array(image.body), {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "private, max-age=60"
    }
  });
});
