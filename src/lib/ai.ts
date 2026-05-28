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
      carbs: z.number().nonnegative()
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

function openai() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required");
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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

  const response = await openai().responses.create({
    model: process.env.OPENAI_VISION_MODEL ?? "gpt-4.1-mini",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              "你是營養分析助手。請根據餐點照片估算食物、份量、熱量與三大營養素。只輸出 JSON，不要 Markdown。欄位必須包含 foods, total, confidence, notes。營養數字使用公克，熱量使用 kcal。"
          },
          { type: "input_image", image_url: imageDataUrl, detail: "auto" }
        ]
      }
    ]
  });

  const text = response.output_text;
  const parsed = JSON.parse(text);
  return foodAnalysisSchema.parse(parsed);
}

export async function generateNextMealAdvice(input: {
  calorieTarget: number;
  today: { calories: number; protein: number; fat: number; carbs: number };
  goal: string;
}) {
  const response = await openai().responses.create({
    model: process.env.OPENAI_TEXT_MODEL ?? "gpt-4.1-mini",
    input: `請用繁體中文提供下一餐建議。使用者目標: ${input.goal}。每日熱量目標: ${input.calorieTarget} kcal。目前今日攝取: ${input.today.calories} kcal, 蛋白質 ${input.today.protein}g, 脂肪 ${input.today.fat}g, 碳水 ${input.today.carbs}g。請包含建議餐點、避免事項與原因，避免醫療診斷。`
  });

  return response.output_text.trim();
}

export async function generateDailySummary(input: {
  date: string;
  calorieTarget: number;
  totals: { calories: number; protein: number; fat: number; carbs: number };
}) {
  const response = await openai().responses.create({
    model: process.env.OPENAI_TEXT_MODEL ?? "gpt-4.1-mini",
    input: `請用繁體中文產生 ${input.date} 的飲食總結與今日建議。目標熱量 ${input.calorieTarget} kcal。實際攝取 ${input.totals.calories} kcal，蛋白質 ${input.totals.protein}g，脂肪 ${input.totals.fat}g，碳水 ${input.totals.carbs}g。請用 JSON 輸出，欄位為 summary 與 recommendation。`
  });

  const parsed = JSON.parse(response.output_text);
  return z.object({ summary: z.string(), recommendation: z.string() }).parse(parsed);
}
