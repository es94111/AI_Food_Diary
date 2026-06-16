import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getImageObject, isStorageKey } from "@/lib/storage";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await context.params;
  const meal = await prisma.meal.findFirst({
    where: { id, userId: user.id },
    select: { imageStorageKey: true, imageStorageKeys: true }
  });

  // Prefer the per-image list; fall back to the legacy single key for old rows.
  const keys = meal?.imageStorageKeys.length
    ? meal.imageStorageKeys
    : meal?.imageStorageKey
      ? [meal.imageStorageKey]
      : [];
  const index = Number(new URL(request.url).searchParams.get("i") ?? "0");
  const key = Number.isInteger(index) && index >= 0 && index < keys.length ? keys[index] : undefined;
  if (!key) return NextResponse.json({ error: "找不到圖片" }, { status: 404 });

  if (!isStorageKey(key)) {
    const match = key.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return NextResponse.json({ error: "圖片格式不支援" }, { status: 400 });
    return new NextResponse(Buffer.from(match[2], "base64"), {
      headers: {
        "Content-Type": match[1],
        "Cache-Control": "private, no-store"
      }
    });
  }

  const image = await getImageObject(key);
  if (!image.Body) return NextResponse.json({ error: "找不到圖片" }, { status: 404 });

  const bytes = await image.Body.transformToByteArray();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": image.ContentType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=60"
    }
  });
}
