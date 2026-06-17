import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDecryptedImage, isStorageKey } from "@/lib/storage";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await context.params;
  const food = await prisma.savedFood.findFirst({
    where: { id, userId: user.id },
    select: { imageStorageKey: true }
  });

  if (!food?.imageStorageKey) return NextResponse.json({ error: "找不到圖片" }, { status: 404 });

  if (!isStorageKey(food.imageStorageKey)) {
    const match = food.imageStorageKey.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return NextResponse.json({ error: "圖片格式不支援" }, { status: 400 });
    return new NextResponse(Buffer.from(match[2], "base64"), {
      headers: { "Content-Type": match[1], "Cache-Control": "private, no-store" }
    });
  }

  const image = await getDecryptedImage(food.imageStorageKey);
  if (!image) return NextResponse.json({ error: "找不到圖片" }, { status: 404 });
  return new NextResponse(new Uint8Array(image.body), {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "private, max-age=60"
    }
  });
}
