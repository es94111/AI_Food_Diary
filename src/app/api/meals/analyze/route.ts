import { NextResponse } from "next/server";
import { analyzeMealImage, analyzeMealImageStable, preciseSampleCount } from "@/lib/ai";
import { resolveUserAiConfig } from "@/lib/ai-config";
import { aiErrorResponse } from "@/lib/ai-errors";
import { requireUser } from "@/lib/auth";
import { deleteImageIfUnreferenced } from "@/lib/image-refs";
import { enforceAiRateLimit } from "@/lib/rate-limit";
import { resolvePreviewVisionImages } from "@/lib/vision-images";
import { mealSchema } from "@/lib/validators";

export async function POST(request: Request) {
  // Whose API key the request ran on — operator-key errors must be sanitised
  // before reaching the client (see aiErrorResponse's byoKey).
  let byoKey = true;
  let uploadedKeys: string[] = [];
  try {
    const user = await requireUser();
    // Precise mode fans out into parallel provider calls; charge the budget for
    // all of them up front instead of letting one request buy a 5× discount.
    const body = mealSchema.parse(await request.json());
    const limited = await enforceAiRateLimit(user.id, body.precise ? preciseSampleCount() : 1);
    if (limited) return limited;
    const images = body.imageDataUrls?.length ? body.imageDataUrls : body.imageDataUrl ? [body.imageDataUrl] : [];
    if (images.length === 0) return NextResponse.json({ error: "請先上傳圖片再進行 AI 分析。" }, { status: 400 });
    const config = resolveUserAiConfig(user);
    byoKey = config.source === "user";
    // Preview analysis no longer ships base64: photos go to the private bucket
    // first, and the AI is handed short-lived signed links instead. The uploaded
    // keys are released again in `finally` — the preview is not persisted and the
    // client re-uploads the photos when it saves the meal.
    const preview = await resolvePreviewVisionImages(images, user.id);
    uploadedKeys = preview.uploadedKeys;
    // Precise mode trades ~3× tokens for a median-of-samples estimate that drifts
    // far less between identical photos.
    const analysis = body.precise
      ? await analyzeMealImageStable(config, preview.inputs)
      : await analyzeMealImage(config, preview.inputs);
    return NextResponse.json({ analysis });
  } catch (error) {
    return aiErrorResponse(error, {
      logLabel: "Meal preview analysis failed",
      fallbackMessage: "餐點分析失敗，請稍後再試。",
      emptyContentMessage: "AI 服務沒有回傳分析內容，請確認模型是否支援圖片輸入。",
      byoKey
    });
  } finally {
    // Leaving preview objects behind would accumulate unreferenced storage for
    // every analyse tap, so they are always released.
    await Promise.all(uploadedKeys.map((key) => deleteImageIfUnreferenced(key).catch(() => undefined)));
  }
}
