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

const defaultMealAnalysisPrompt =
  '你是營養分析助手。請根據餐點照片估算食物、份量、熱量與三大營養素。每一種可辨識食物都必須獨立成 foods 陣列中的一個項目，不要合併成便當、套餐、餐盤或其他總稱。例如炸素排與玉米濃湯必須分成兩筆。請為每項食物給 aiRating：GOOD 代表較推薦，OK 代表普通，LIMIT 代表建議少吃。只輸出 JSON，不要 Markdown。必須使用這個格式：{"foods":[{"name":"食物名稱","estimatedAmount":"份量","calories":0,"protein":0,"fat":0,"carbs":0,"aiRating":"OK"}],"total":{"calories":0,"protein":0,"fat":0,"carbs":0},"confidence":0.8,"notes":"說明"}。所有營養數字必須是 number，蛋白質、脂肪、碳水使用公克，熱量使用 kcal。';

const defaultMealDescriptionAnalysisPrompt =
  '你是營養分析助手。請根據使用者用文字描述的餐點估算食物、份量、熱量與三大營養素。每一種食物都必須獨立成 foods 陣列中的一個項目，不要合併成便當、套餐、餐盤或其他總稱。若描述含糊，請使用常見份量保守估算，並在 notes 說明假設。請為每項食物給 aiRating：GOOD 代表較推薦，OK 代表普通，LIMIT 代表建議少吃。只輸出 JSON，不要 Markdown。必須使用這個格式：{"foods":[{"name":"食物名稱","estimatedAmount":"份量","calories":0,"protein":0,"fat":0,"carbs":0,"aiRating":"OK"}],"total":{"calories":0,"protein":0,"fat":0,"carbs":0},"confidence":0.7,"notes":"說明"}。所有營養數字必須是 number，蛋白質、脂肪、碳水使用公克，熱量使用 kcal。使用者描述：{{description}}';

const defaultManualFoodRatingPrompt =
  '你是營養分析助手。請根據使用者手動輸入的食物品項判斷每項食物的 aiRating：GOOD 代表較推薦，OK 代表普通，LIMIT 代表建議少吃。請保留使用者已提供的食物名稱、份量、熱量與三大營養素；只有當數字為 0 或明顯缺漏時，才依食物與份量做保守估算。每一種食物都必須獨立成 foods 陣列中的一個項目。只輸出 JSON，不要 Markdown。必須使用這個格式：{"foods":[{"name":"食物名稱","estimatedAmount":"份量","calories":0,"protein":0,"fat":0,"carbs":0,"aiRating":"OK"}],"total":{"calories":0,"protein":0,"fat":0,"carbs":0},"confidence":0.8,"notes":"說明"}。所有營養數字必須是 number，蛋白質、脂肪、碳水使用公克，熱量使用 kcal。使用者手動品項：{{items}}';

const defaultNextMealAdvicePrompt =
  "請用繁體中文提供下一餐建議。使用者目標: {{goal}}。每日熱量目標: {{calorieTarget}} kcal。目前今日攝取: {{todayCalories}} kcal, 蛋白質 {{todayProtein}}g, 脂肪 {{todayFat}}g, 碳水 {{todayCarbs}}g。請包含建議餐點、避免事項與原因，避免醫療診斷。";

const defaultDailySummaryPrompt =
  "請用繁體中文產生 {{date}} 的飲食總結與今日建議。目標熱量 {{calorieTarget}} kcal。實際攝取 {{totalCalories}} kcal，蛋白質 {{totalProtein}}g，脂肪 {{totalFat}}g，碳水 {{totalCarbs}}g。請只用 JSON 輸出，欄位為 summary 與 recommendation。";

function openai() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required");
  }
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: normalizeOpenAiBaseUrl(process.env.OPENAI_BASE_URL || process.env.OPENAI_API_BASE_URL)
  });
}

function normalizeOpenAiBaseUrl(baseUrl?: string) {
  const value = baseUrl?.trim();
  if (!value) return undefined;
  const withoutTrailingSlash = value.replace(/\/+$/, "");
  return withoutTrailingSlash.endsWith("/v1") ? withoutTrailingSlash : `${withoutTrailingSlash}/v1`;
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

export async function analyzeMealImage(imageDataUrl?: string): Promise<FoodAnalysis> {
  if (!imageDataUrl) {
    return {
      foods: [],
      total: { calories: 0, protein: 0, fat: 0, carbs: 0 },
      confidence: 0,
      notes: "未提供圖片，請手動新增食物項目。"
    };
  }

  const response = await openai().chat.completions.create({
    model: process.env.OPENAI_VISION_MODEL ?? "gpt-4.1-mini",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: promptFromEnv("AI_MEAL_ANALYSIS_PROMPT", defaultMealAnalysisPrompt)
          },
          { type: "image_url", image_url: { url: imageDataUrl, detail: "auto" } }
        ]
      }
    ]
  });

  return parseMealAnalysisText(completionText(response));
}

export async function analyzeMealDescription(description: string): Promise<FoodAnalysis> {
  const prompt = renderPrompt(promptFromEnv("AI_MEAL_DESCRIPTION_ANALYSIS_PROMPT", defaultMealDescriptionAnalysisPrompt), {
    description
  });

  const response = await openai().chat.completions.create({
    model: process.env.OPENAI_TEXT_MODEL ?? "gpt-4.1-mini",
    messages: [
      {
        role: "user",
        content: prompt
      }
    ]
  });

  return parseMealAnalysisText(completionText(response));
}

export async function analyzeManualFoodItems(items: FoodAnalysis["foods"]): Promise<FoodAnalysis> {
  const prompt = renderPrompt(promptFromEnv("AI_MANUAL_FOOD_RATING_PROMPT", defaultManualFoodRatingPrompt), {
    items: JSON.stringify(items)
  });

  const response = await openai().chat.completions.create({
    model: process.env.OPENAI_TEXT_MODEL ?? "gpt-4.1-mini",
    messages: [
      {
        role: "user",
        content: prompt
      }
    ]
  });

  return parseMealAnalysisText(completionText(response));
}

export async function generateNextMealAdvice(input: {
  calorieTarget: number;
  today: { calories: number; protein: number; fat: number; carbs: number };
  goal: string;
}) {
  const prompt = renderPrompt(promptFromEnv("AI_NEXT_MEAL_ADVICE_PROMPT", defaultNextMealAdvicePrompt), {
    goal: input.goal,
    calorieTarget: input.calorieTarget,
    todayCalories: input.today.calories,
    todayProtein: input.today.protein,
    todayFat: input.today.fat,
    todayCarbs: input.today.carbs
  });

  const response = await openai().chat.completions.create({
    model: process.env.OPENAI_TEXT_MODEL ?? "gpt-4.1-mini",
    messages: [
      {
        role: "user",
        content: prompt
      }
    ]
  });

  return completionText(response).trim();
}

export async function generateDailySummary(input: {
  date: string;
  calorieTarget: number;
  totals: { calories: number; protein: number; fat: number; carbs: number };
}) {
  const prompt = renderPrompt(promptFromEnv("AI_DAILY_SUMMARY_PROMPT", defaultDailySummaryPrompt), {
    date: input.date,
    calorieTarget: input.calorieTarget,
    totalCalories: input.totals.calories,
    totalProtein: input.totals.protein,
    totalFat: input.totals.fat,
    totalCarbs: input.totals.carbs
  });

  const response = await openai().chat.completions.create({
    model: process.env.OPENAI_TEXT_MODEL ?? "gpt-4.1-mini",
    messages: [
      {
        role: "user",
        content: prompt
      }
    ]
  });

  const parsed = parseJsonResponse(completionText(response));
  return z.object({ summary: z.string(), recommendation: z.string() }).parse(parsed);
}
