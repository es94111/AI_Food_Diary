import { NextResponse } from "next/server";
import { z } from "zod";
import { analyzeNutritionLabelImage } from "@/lib/ai";
import { resolveUserAiConfig } from "@/lib/ai-config";
import { aiErrorResponse } from "@/lib/ai-errors";
import { requireUser } from "@/lib/auth";
import { deleteImageIfUnreferenced } from "@/lib/image-refs";
import { enforceAiRateLimit } from "@/lib/rate-limit";
import { resolvePreviewVisionImages } from "@/lib/vision-images";
import { imageDataUrlSchema } from "@/lib/validators";

const nutritionLabelSchema = z
  .object({
    imageDataUrl: imageDataUrlSchema().optional(),
    imageDataUrls: z.array(imageDataUrlSchema()).min(1).max(5).optional()
  })
  .refine((v) => !!v.imageDataUrl || !!v.imageDataUrls?.length, {
    message: "請先上傳營養標示圖片。"
  });

export async function POST(request: Request) {
  let byoKey = true;
  let uploadedKeys: string[] = [];
  try {
    const user = await requireUser();
    const limited = await enforceAiRateLimit(user.id);
    if (limited) return limited;
    const body = nutritionLabelSchema.parse(await request.json());
    const images = body.imageDataUrls?.length ? body.imageDataUrls : body.imageDataUrl ? [body.imageDataUrl] : [];
    const config = resolveUserAiConfig(user);
    byoKey = config.source === "user";
    // Same as the meal preview: store first (when linkable), then hand the AI
    // signed links instead of inline base64, releasing the objects in `finally`.
    const preview = await resolvePreviewVisionImages(images, user.id);
    uploadedKeys = preview.uploadedKeys;
    const analysis = await analyzeNutritionLabelImage(config, preview.inputs);
    return NextResponse.json({ analysis });
  } catch (error) {
    return aiErrorResponse(error, {
      logLabel: "Nutrition label analysis failed",
      fallbackMessage: "營養標示分析失敗，請稍後再試。",
      emptyContentMessage: "AI 服務沒有回傳分析內容，請確認模型是否支援圖片輸入。",
      byoKey
    });
  } finally {
    await Promise.all(uploadedKeys.map((key) => deleteImageIfUnreferenced(key).catch(() => undefined)));
  }
}
