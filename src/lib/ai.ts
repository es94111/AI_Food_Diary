import * as Sentry from "@sentry/nextjs";
import OpenAI from "openai";
import { z } from "zod";

const foodAnalysisSchema = z.object({
  foods: z.array(
    z.object({
      name: z.string(),
      estimatedAmount: z.string(),
      calories: z.number().int().nonnegative(),
      protein: z.number().nonnegative(),
      fat: z.number().nonnegative(),
      carbs: z.number().nonnegative(),
      aiRating: z.enum(["GOOD", "OK", "LIMIT", "MANUAL"])
    })
  ),
  total: z.object({
    calories: z.number().int().nonnegative(),
    protein: z.number().nonnegative(),
    fat: z.number().nonnegative(),
    carbs: z.number().nonnegative()
  }),
  confidence: z.number().min(0).max(1),
  notes: z.string()
});

export type FoodAnalysis = z.infer<typeof foodAnalysisSchema>;

// Step-wise estimation: ask the model to fix the portion in grams first, then
// apply a per-100g nutrient density, instead of guessing total calories in one
// leap. Decomposing "weight × density" both improves accuracy and makes the
// estimate auditable (the assumptions land in notes), which shrinks the spread
// between runs on the same photo.
const defaultMealAnalysisPrompt =
  '你是專業營養分析助手。請依下列步驟分析餐點照片，每一種可辨識食物都必須獨立成 foods 陣列中的一個項目，不要合併成便當、套餐、餐盤或其他總稱（例如炸素排與玉米濃湯必須分成兩筆）：\n步驟1：辨識每一種食物。\n步驟2：估算每項食物的可見份量，換算成公克或毫升，estimatedAmount 請寫成含數量的描述（例如「約 150g」「約 240ml」）。若畫面中有餐具、碗盤、手或包裝可當比例尺，請用它們輔助判斷大小。\n步驟3：取該食物每 100g（或每 100ml）的標準熱量與三大營養素密度。\n步驟4：以「份量 ÷ 100 × 密度」計算該項的 calories、protein、fat、carbs。\n步驟5：為每項食物給 aiRating：GOOD 代表較推薦，OK 代表普通，LIMIT 代表建議少吃。\n若提供多張照片，請綜合所有照片一起判斷：不同照片中的不同食物要分別列出，但同一份食物在不同角度重複出現時只能計算一次，不要重複加總。\n請在 notes 用一句話說明你對主要食物所假設的份量（公克）與每 100g 熱量，方便使用者稽核。只輸出 JSON，不要 Markdown。必須使用這個格式：{"foods":[{"name":"食物名稱","estimatedAmount":"約 150g","calories":0,"protein":0,"fat":0,"carbs":0,"aiRating":"OK"}],"total":{"calories":0,"protein":0,"fat":0,"carbs":0},"confidence":0.8,"notes":"說明"}。所有營養數字必須是 number，蛋白質、脂肪、碳水使用公克，熱量使用 kcal。';

const defaultMealDescriptionAnalysisPrompt =
  '你是專業營養分析助手。請依下列步驟分析使用者用文字描述的餐點，每一種食物都必須獨立成 foods 陣列中的一個項目，不要合併成便當、套餐、餐盤或其他總稱：\n步驟1：辨識每一種食物。\n步驟2：判斷每項食物的份量並換算成公克或毫升，estimatedAmount 請寫成含數量的描述（例如「約 150g」）。若描述含糊，請以常見單份保守估算。\n步驟3：取該食物每 100g（或每 100ml）的標準熱量與三大營養素密度。\n步驟4：以「份量 ÷ 100 × 密度」計算該項的 calories、protein、fat、carbs。\n步驟5：為每項食物給 aiRating：GOOD 代表較推薦，OK 代表普通，LIMIT 代表建議少吃。\n請在 notes 用一句話說明你對主要食物所假設的份量（公克）與每 100g 熱量，含糊處一併說明。只輸出 JSON，不要 Markdown。必須使用這個格式：{"foods":[{"name":"食物名稱","estimatedAmount":"約 150g","calories":0,"protein":0,"fat":0,"carbs":0,"aiRating":"OK"}],"total":{"calories":0,"protein":0,"fat":0,"carbs":0},"confidence":0.7,"notes":"說明"}。所有營養數字必須是 number，蛋白質、脂肪、碳水使用公克，熱量使用 kcal。使用者描述：{{description}}';

const defaultManualFoodRatingPrompt =
  '你是營養分析助手。請根據使用者手動輸入的食物品項判斷每項食物的 aiRating：GOOD 代表較推薦，OK 代表普通，LIMIT 代表建議少吃。請保留使用者已提供的食物名稱、份量、熱量與三大營養素；只有當數字為 0 或明顯缺漏時，才依食物與份量做保守估算。每一種食物都必須獨立成 foods 陣列中的一個項目。只輸出 JSON，不要 Markdown。必須使用這個格式：{"foods":[{"name":"食物名稱","estimatedAmount":"份量","calories":0,"protein":0,"fat":0,"carbs":0,"aiRating":"OK"}],"total":{"calories":0,"protein":0,"fat":0,"carbs":0},"confidence":0.8,"notes":"說明"}。所有營養數字必須是 number，蛋白質、脂肪、碳水使用公克，熱量使用 kcal。使用者手動品項：{{items}}';

const defaultFoodReestimatePrompt =
  '你是專業營養分析助手。使用者已修正每項食物的名稱與份量。請「忽略」輸入中既有的熱量與三大營養素數字，完全依照修正後的名稱與份量，用以下步驟重新估算每項食物：步驟1：把份量換算成公克或毫升。步驟2：取該食物每 100g（或每 100ml）的標準熱量與三大營養素密度。步驟3：以「份量 ÷ 100 × 密度」計算 calories、protein、fat、carbs。步驟4：為每項給 aiRating：GOOD 代表較推薦，OK 代表普通，LIMIT 代表建議少吃。請保留使用者提供的食物名稱與份量，不要新增或刪除品項，每一筆輸入都要對應一筆輸出。請在 notes 用一句話說明主要食物所假設的每 100g 熱量。只輸出 JSON，不要 Markdown。必須使用這個格式：{"foods":[{"name":"食物名稱","estimatedAmount":"份量","calories":0,"protein":0,"fat":0,"carbs":0,"aiRating":"OK"}],"total":{"calories":0,"protein":0,"fat":0,"carbs":0},"confidence":0.8,"notes":"說明"}。所有營養數字必須是 number，蛋白質、脂肪、碳水使用公克，熱量使用 kcal。使用者修正後品項：{{items}}';

const defaultNutritionLabelAnalysisPrompt =
  '你是營養標示辨識助手。請讀取圖片中的營養標示。每一張不同商品的營養標示都要各自建立一個 foods 項目（例如提供三張標示就回傳三個項目）；若同一張標示分多張照片拍攝，則合併成一個項目。若看得到品名請填入 name，否則 name 填「營養標示食品」。estimatedAmount 必須填標示上的每份份量或每包裝份量，例如「每份 30g」或「每包 240ml」。calories 使用 kcal，protein/fat/carbs 使用公克。若標示只有每 100g/100ml，estimatedAmount 就填「每 100g」或「每 100ml」。請為此食品給 aiRating：GOOD 代表較推薦，OK 代表普通，LIMIT 代表建議少吃。只輸出 JSON，不要 Markdown。必須使用這個格式：{"foods":[{"name":"食物名稱","estimatedAmount":"每份份量","calories":0,"protein":0,"fat":0,"carbs":0,"aiRating":"OK"}],"total":{"calories":0,"protein":0,"fat":0,"carbs":0},"confidence":0.8,"notes":"說明辨識到的份量基準與任何假設"}。所有營養數字必須是 number。';

const defaultNextMealAdvicePrompt =
  "請用繁體中文提供下一餐建議。使用者目標: {{goal}}。每日熱量目標: {{calorieTarget}} kcal。目前今日攝取: {{todayCalories}} kcal, 蛋白質 {{todayProtein}}g, 脂肪 {{todayFat}}g, 碳水 {{todayCarbs}}g。健康同步資料: {{healthContext}}。請依活動量與體重資訊調整建議，包含建議餐點、避免事項與原因，避免醫療診斷。";

const defaultDailySummaryPrompt =
  "請用繁體中文產生 {{date}} 的飲食總結與今日建議。目標熱量 {{calorieTarget}} kcal。實際攝取 {{totalCalories}} kcal，蛋白質 {{totalProtein}}g，脂肪 {{totalFat}}g，碳水 {{totalCarbs}}g。健康同步資料: {{healthContext}}。請依活動量與體重資訊調整建議，避免醫療診斷。請只用 JSON 輸出，欄位為 summary 與 recommendation。";

// Per-request AI configuration, resolved from the calling user's saved settings
// (see resolveUserAiConfig in ai-config.ts). The key/base/models are no longer
// read from the environment so the service can be opened to multiple users.
export type AiConfig = {
  apiKey: string;
  baseUrl: string;
  visionModel: string;
  textModel: string;
};

// Sampling controls shared by every completion. A low temperature is the single
// biggest lever against run-to-run drift (providers default to ~1.0); a fixed
// seed makes identical inputs reproducible on providers that honour it (OpenAI).
// Both are env-overridable so operators can tune per provider.
const ANALYSIS_TEMPERATURE = numberEnv("AI_ANALYSIS_TEMPERATURE", 0.2);
const ANALYSIS_SEED = numberEnv("AI_ANALYSIS_SEED", 42);
// Precise mode (self-consistency) runs the same image several times and keeps the
// median; a slightly higher temperature gives the runs enough diversity for the
// median to be meaningful. Defaults to 3 samples; set to 1 to disable.
const PRECISE_SAMPLES = Math.max(1, Math.min(Math.round(numberEnv("AI_MEAL_ANALYSIS_SAMPLES", 3)), 5));
const PRECISE_TEMPERATURE = numberEnv("AI_MEAL_ANALYSIS_SAMPLE_TEMPERATURE", 0.5);

function numberEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

// Hard ceiling on how long a single provider call may run, plus how many times
// the SDK retries. Without these the OpenAI SDK waits up to its 600s default with
// 2 retries, so a slow/stuck model keeps the request hanging long past the
// reverse-proxy's own limit — the user sees the gateway's raw "504" HTML instead
// of our friendly error. Capping the timeout below the gateway means a slow call
// fails fast as a clean APIError (→ a translated 502 in aiErrorResponse) we can
// show. Set AI_REQUEST_TIMEOUT_MS *below* your deployment's gateway timeout
// (Zeabur/Cloudflare); raise the gateway timeout instead if your model is slow.
const AI_REQUEST_TIMEOUT_MS = Math.max(1000, numberEnv("AI_REQUEST_TIMEOUT_MS", 90_000));
const AI_REQUEST_MAX_RETRIES = Math.max(0, Math.round(numberEnv("AI_REQUEST_MAX_RETRIES", 1)));

// Builds the shared request knobs. `seed: null` opts out of the fixed seed (used
// when sampling, so the runs actually differ). `json` switches on JSON mode to
// cut down on free-text parsing failures — only safe for prompts that already ask
// for JSON, and skipped for the plain-text advice endpoints.
function completionOptions(opts: { json?: boolean; temperature?: number; seed?: number | null } = {}) {
  const { json = false, temperature = ANALYSIS_TEMPERATURE, seed = ANALYSIS_SEED } = opts;
  const options: Record<string, unknown> = { temperature };
  if (seed !== null && Number.isFinite(seed)) options.seed = seed;
  if (json) options.response_format = { type: "json_object" };
  return options;
}

function client(config: AiConfig) {
  if (!config.apiKey) {
    throw new Error("AI_NOT_CONFIGURED");
  }
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: normalizeBaseUrl(config.baseUrl),
    timeout: AI_REQUEST_TIMEOUT_MS,
    maxRetries: AI_REQUEST_MAX_RETRIES
  });
}

function isGemini(config: AiConfig) {
  return /generativelanguage\.googleapis\.com/i.test(config.baseUrl ?? "");
}

// Single chokepoint for chat-completion calls. Gemini's OpenAI-compatible
// endpoint rejects a handful of OpenAI-only request fields with a bare
// "400 status code (no body)" (the error body is gzipped and never surfaces):
// notably `seed`, and it is picky about the image_url `detail` hint. Strip those
// for Gemini so the identical request works across OpenAI, Gemini and generic
// compatible endpoints. Other providers are passed through untouched.
function createCompletion(config: AiConfig, params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming) {
  let finalParams = params;
  if (isGemini(config)) {
    const { seed: _seed, messages, ...rest } = params;
    finalParams = {
      ...rest,
      messages: messages.map((message) => {
        const content = (message as { content?: unknown }).content;
        if (!Array.isArray(content)) return message;
        return {
          ...message,
          content: content.map((part) => {
            if (part && typeof part === "object" && (part as { type?: string }).type === "image_url") {
              const imagePart = part as { image_url?: Record<string, unknown> };
              if (imagePart.image_url && "detail" in imagePart.image_url) {
                const { detail: _detail, ...imageRest } = imagePart.image_url;
                return { ...part, image_url: imageRest };
              }
            }
            return part;
          })
        };
      }) as OpenAI.Chat.Completions.ChatCompletionMessageParam[]
    };
  }
  return client(config).chat.completions.create(finalParams);
}

// Only trim trailing slashes — the base URL must already include the correct
// version path (e.g. ".../v1" for OpenAI, ".../v1beta/openai" for Gemini).
function normalizeBaseUrl(baseUrl?: string) {
  const value = baseUrl?.trim();
  if (!value) return undefined;
  return value.replace(/\/+$/, "");
}

// Wraps an AI operation in a Sentry `gen_ai.invoke_agent` span so each user
// action shows up as a single named agent in Sentry's AI Agents dashboard, with
// the auto-instrumented `openai` chat completion(s) nested underneath as
// `gen_ai.chat` child spans. We deliberately do NOT attach prompt/response
// content here — that policy lives in sentry.server.config.ts
// (dataCollection.genAI), so meal photos and AI replies never leave the server.
// `model` is the request model so the agent span groups by the model in use.
function withAgent<T>(name: string, model: string, run: () => Promise<T>): Promise<T> {
  return Sentry.startSpan(
    {
      op: "gen_ai.invoke_agent",
      name: `invoke_agent ${name}`,
      attributes: {
        "gen_ai.operation.name": "invoke_agent",
        "gen_ai.agent.name": name,
        "gen_ai.request.model": model,
      },
    },
    run
  );
}

function messageText(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "object" && part && "text" in part ? part.text : ""))
      .join("")
      .trim();
  }
  return "";
}

function completionText(response: unknown) {
  if (typeof response !== "object" || !response || !("choices" in response) || !Array.isArray(response.choices)) {
    throw new Error("OPENAI_RESPONSE_MISSING_CHOICES");
  }
  const text = messageText(response.choices[0]?.message?.content);
  if (!text) throw new Error("OPENAI_RESPONSE_EMPTY_CONTENT");
  return text;
}

function parseJsonResponse(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1];
  return JSON.parse(fenced ?? trimmed);
}

function parseFoodTextResponse(text: string): FoodAnalysis {
  const sections = [...text.matchAll(/【([^】]+)】([\s\S]*?)(?=\n?【|$)/g)];
  const foods = sections.map((section) => {
    const body = section[2];
    return {
      name: section[1].trim(),
      estimatedAmount: body.match(/預估份量[：:]\s*([^\n]+)/)?.[1]?.trim() ?? "未估算",
      calories: Math.round(numberValue(body.match(/熱量(?:\(千卡\))?[：:]\s*([\d.]+)/)?.[1])),
      protein: numberValue(body.match(/蛋白質(?:\(克\))?[：:]\s*([\d.]+)/)?.[1]),
      fat: numberValue(body.match(/脂肪(?:\(克\))?[：:]\s*([\d.]+)/)?.[1]),
      carbs: numberValue(body.match(/碳水(?:化合物)?(?:\(克\))?[：:]\s*([\d.]+)/)?.[1]),
      aiRating: ratingValue(body.match(/評分[：:]\s*(GOOD|OK|LIMIT|MANUAL|✅|⚠️|❌|✎)/)?.[1])
    };
  });
  if (foods.length === 0) throw new Error("OPENAI_RESPONSE_NOT_PARSEABLE");
  return foodAnalysisSchema.parse({
    foods,
    total: {
      calories: foods.reduce((sum, food) => sum + food.calories, 0),
      protein: foods.reduce((sum, food) => sum + food.protein, 0),
      fat: foods.reduce((sum, food) => sum + food.fat, 0),
      carbs: foods.reduce((sum, food) => sum + food.carbs, 0)
    },
    confidence: 0.7,
    notes: "AI 以文字格式回傳，系統已自動解析。"
  });
}

function parseMealAnalysisText(text: string) {
  try {
    return normalizeFoodAnalysis(parseJsonResponse(text));
  } catch {
    return parseFoodTextResponse(text);
  }
}

function textValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberValue(value: unknown) {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function ratingValue(value: unknown) {
  if (value === "GOOD" || value === "✅") return "GOOD";
  if (value === "LIMIT" || value === "❌") return "LIMIT";
  if (value === "MANUAL" || value === "✎") return "MANUAL";
  return "OK";
}

function pickValue(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (source[key] !== undefined) return source[key];
  }
  return undefined;
}

function normalizeFoodAnalysis(parsed: unknown): FoodAnalysis {
  const source = typeof parsed === "object" && parsed ? (parsed as Record<string, unknown>) : {};
  const rawFoods = pickValue(source, ["foods", "items", "foodItems", "餐點", "食物"]);
  const foods = (Array.isArray(rawFoods) ? rawFoods : []).map((rawFood) => {
    const food = typeof rawFood === "object" && rawFood ? (rawFood as Record<string, unknown>) : {};
    return {
      name: textValue(pickValue(food, ["name", "food", "item", "食物", "名稱"]), "未命名食物"),
      estimatedAmount: textValue(pickValue(food, ["estimatedAmount", "amount", "portion", "serving", "份量", "重量"]), "未估算"),
      calories: Math.round(numberValue(pickValue(food, ["calories", "kcal", "熱量"]))),
      protein: numberValue(pickValue(food, ["protein", "protein_g", "蛋白質"])),
      fat: numberValue(pickValue(food, ["fat", "fat_g", "脂肪"])),
      carbs: numberValue(pickValue(food, ["carbs", "carbohydrates", "carb_g", "碳水", "碳水化合物"])),
      aiRating: ratingValue(pickValue(food, ["aiRating", "rating", "score", "評分", "建議"]))
    };
  });
  const rawTotal = pickValue(source, ["total", "totals", "總計", "合計"]);
  const totalSource = typeof rawTotal === "object" && rawTotal ? (rawTotal as Record<string, unknown>) : {};
  const total = {
    calories: Math.round(numberValue(pickValue(totalSource, ["calories", "kcal", "熱量"])) || foods.reduce((sum, food) => sum + food.calories, 0)),
    protein: numberValue(pickValue(totalSource, ["protein", "protein_g", "蛋白質"])) || foods.reduce((sum, food) => sum + food.protein, 0),
    fat: numberValue(pickValue(totalSource, ["fat", "fat_g", "脂肪"])) || foods.reduce((sum, food) => sum + food.fat, 0),
    carbs: numberValue(pickValue(totalSource, ["carbs", "carbohydrates", "carb_g", "碳水", "碳水化合物"])) || foods.reduce((sum, food) => sum + food.carbs, 0)
  };

  return foodAnalysisSchema.parse({
    foods,
    total,
    confidence: Math.min(numberValue(pickValue(source, ["confidence", "信心", "可信度"])) || 0.7, 1),
    notes: textValue(pickValue(source, ["notes", "note", "說明", "備註"]), "AI 自動分析。")
  });
}

function promptFromEnv(name: string, fallback: string) {
  return process.env[name]?.trim() || fallback;
}

function renderPrompt(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (prompt, [key, value]) => prompt.replaceAll(`{{${key}}}`, String(value)),
    template
  );
}

async function requestMealImageAnalysis(
  config: AiConfig,
  imageDataUrls: string[],
  options: { temperature?: number; seed?: number | null } = {}
): Promise<FoodAnalysis> {
  const response = await createCompletion(config, {
    model: config.visionModel,
    ...completionOptions({ json: true, ...options }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: promptFromEnv("AI_MEAL_ANALYSIS_PROMPT", defaultMealAnalysisPrompt)
          },
          // "high" detail gives the model the resolution it needs to judge
          // portion size, which is the dominant source of calorie error. Several
          // images of the same meal are sent together so the model can combine them.
          ...imageDataUrls.map((url) => ({ type: "image_url" as const, image_url: { url, detail: "high" as const } }))
        ]
      }
    ]
  });

  return parseMealAnalysisText(completionText(response));
}

export async function analyzeMealImage(config: AiConfig, imageDataUrls: string[] = []): Promise<FoodAnalysis> {
  if (imageDataUrls.length === 0) {
    return {
      foods: [],
      total: { calories: 0, protein: 0, fat: 0, carbs: 0 },
      confidence: 0,
      notes: "未提供圖片，請手動新增食物項目。"
    };
  }

  return withAgent("meal-photo-analysis", config.visionModel, () =>
    requestMealImageAnalysis(config, imageDataUrls));
}

// Self-consistency for the photo flow: run the same image several times and keep
// the sample whose total calories is the median. Portion estimation is what
// drifts between runs, so the median run is a robust point estimate — and keeping
// a whole real sample (rather than averaging mismatched food lists) means the
// foods/macros stay internally consistent. Runs use a higher temperature and no
// fixed seed so they actually differ; falls back to a single deterministic run
// when sampling is disabled or no image is given.
export async function analyzeMealImageStable(
  config: AiConfig,
  imageDataUrls: string[] = [],
  samples = PRECISE_SAMPLES
): Promise<FoodAnalysis> {
  const count = Math.max(1, Math.min(Math.round(samples), 5));
  if (imageDataUrls.length === 0 || count === 1) return analyzeMealImage(config, imageDataUrls);

  // One agent span for the whole self-consistency run, so its N parallel chat
  // completions show up nested under a single "meal-photo-analysis" agent call.
  return withAgent("meal-photo-analysis", config.visionModel, async () => {
    const settled = await Promise.allSettled(
      Array.from({ length: count }, (_unused, index) =>
        requestMealImageAnalysis(config, imageDataUrls, { temperature: PRECISE_TEMPERATURE, seed: ANALYSIS_SEED + index })
      )
    );
    const analyses = settled
      .filter((result): result is PromiseFulfilledResult<FoodAnalysis> => result.status === "fulfilled")
      .map((result) => result.value)
      .filter((analysis) => analysis.foods.length > 0);

    if (analyses.length === 0) {
      const rejection = settled.find((result) => result.status === "rejected") as PromiseRejectedResult | undefined;
      throw rejection?.reason ?? new Error("OPENAI_RESPONSE_NOT_PARSEABLE");
    }
    if (analyses.length === 1) return analyses[0];

    const sorted = [...analyses].sort((a, b) => a.total.calories - b.total.calories);
    const median = sorted[Math.floor((sorted.length - 1) / 2)];
    return {
      ...median,
      notes: `${median.notes}（精準模式：取 ${analyses.length} 次辨識的中位數，總熱量範圍 ${sorted[0].total.calories}–${sorted[sorted.length - 1].total.calories} kcal）`
    };
  });
}

export async function analyzeNutritionLabelImage(config: AiConfig, imageDataUrls: string[]): Promise<FoodAnalysis> {
  const response = await withAgent("nutrition-label-analysis", config.visionModel, () =>
    createCompletion(config, {
      model: config.visionModel,
      ...completionOptions({ json: true }),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: promptFromEnv("AI_NUTRITION_LABEL_ANALYSIS_PROMPT", defaultNutritionLabelAnalysisPrompt)
            },
            ...imageDataUrls.map((url) => ({ type: "image_url" as const, image_url: { url, detail: "high" as const } }))
          ]
        }
      ]
    }));

  return parseMealAnalysisText(completionText(response));
}

export async function analyzeMealDescription(config: AiConfig, description: string): Promise<FoodAnalysis> {
  const prompt = renderPrompt(promptFromEnv("AI_MEAL_DESCRIPTION_ANALYSIS_PROMPT", defaultMealDescriptionAnalysisPrompt), {
    description
  });

  const response = await withAgent("meal-description-analysis", config.textModel, () =>
    createCompletion(config, {
      model: config.textModel,
      ...completionOptions({ json: true }),
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    }));

  return parseMealAnalysisText(completionText(response));
}

export async function analyzeManualFoodItems(config: AiConfig, items: FoodAnalysis["foods"]): Promise<FoodAnalysis> {
  const prompt = renderPrompt(promptFromEnv("AI_MANUAL_FOOD_RATING_PROMPT", defaultManualFoodRatingPrompt), {
    items: JSON.stringify(items)
  });

  const response = await withAgent("manual-food-rating", config.textModel, () =>
    createCompletion(config, {
      model: config.textModel,
      ...completionOptions({ json: true }),
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    }));

  return parseMealAnalysisText(completionText(response));
}

// Re-estimates nutrition for user-corrected items: unlike analyzeManualFoodItems
// (which keeps any non-zero numbers the user supplied), this recomputes calories
// and macros purely from the corrected name + amount, so fixing a food name
// ("便當" → "排骨便當") refreshes the whole estimate.
export async function reestimateFoodItems(
  config: AiConfig,
  items: Array<{ name: string; estimatedAmount: string }>
): Promise<FoodAnalysis> {
  const prompt = renderPrompt(promptFromEnv("AI_FOOD_REESTIMATE_PROMPT", defaultFoodReestimatePrompt), {
    items: JSON.stringify(items.map((item) => ({ name: item.name, estimatedAmount: item.estimatedAmount })))
  });

  const response = await withAgent("food-reestimate", config.textModel, () =>
    createCompletion(config, {
      model: config.textModel,
      ...completionOptions({ json: true }),
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    }));

  return parseMealAnalysisText(completionText(response));
}

export async function generateNextMealAdvice(config: AiConfig, input: {
  calorieTarget: number;
  today: { calories: number; protein: number; fat: number; carbs: number };
  goal: string;
  healthContext?: string;
}) {
  const prompt = renderPrompt(promptFromEnv("AI_NEXT_MEAL_ADVICE_PROMPT", defaultNextMealAdvicePrompt), {
    goal: input.goal,
    calorieTarget: input.calorieTarget,
    todayCalories: input.today.calories,
    todayProtein: input.today.protein,
    todayFat: input.today.fat,
    todayCarbs: input.today.carbs,
    healthContext: input.healthContext ?? "尚未同步"
  });

  // Plain-text advice — no JSON mode, but still temperature-bounded for stability.
  const response = await withAgent("next-meal-advice", config.textModel, () =>
    createCompletion(config, {
      model: config.textModel,
      ...completionOptions(),
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    }));

  return completionText(response).trim();
}

export async function generateDailySummary(config: AiConfig, input: {
  date: string;
  calorieTarget: number;
  totals: { calories: number; protein: number; fat: number; carbs: number };
  healthContext?: string;
}) {
  const prompt = renderPrompt(promptFromEnv("AI_DAILY_SUMMARY_PROMPT", defaultDailySummaryPrompt), {
    date: input.date,
    calorieTarget: input.calorieTarget,
    totalCalories: input.totals.calories,
    totalProtein: input.totals.protein,
    totalFat: input.totals.fat,
    totalCarbs: input.totals.carbs,
    healthContext: input.healthContext ?? "尚未同步"
  });

  const response = await withAgent("daily-summary", config.textModel, () =>
    createCompletion(config, {
      model: config.textModel,
      ...completionOptions({ json: true }),
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    }));

  const parsed = parseJsonResponse(completionText(response));
  return z.object({ summary: z.string(), recommendation: z.string() }).parse(parsed);
}
