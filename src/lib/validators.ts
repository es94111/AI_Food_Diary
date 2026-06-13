import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(80).optional(),
  "cf-turnstile-response": z.string().optional()
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  "cf-turnstile-response": z.string().optional()
});

export const profileSchema = z.object({
  gender: z.string().max(40).optional(),
  birthDate: z.string().date().optional(),
  heightCm: z.coerce.number().int().min(80).max(250).optional(),
  weightKg: z.coerce.number().min(20).max(350).optional(),
  activityLevel: z.string().max(80).optional(),
  goal: z.enum(["LOSE_FAT", "MAINTAIN", "BUILD_MUSCLE"]).optional(),
  calorieTarget: z.coerce.number().int().min(800).max(6000).optional(),
  waterGoalMl: z.coerce.number().int().min(100).max(10000).optional(),
  preferences: z.array(z.string().max(80)).optional(),
  allergies: z.array(z.string().max(80)).optional()
});

export const waterLogSchema = z.object({
  amountMl: z.coerce.number().int().min(1).max(5000),
  drankAt: z.string().datetime().optional()
});

// Photo uploads may include several images of the same meal (different dishes or
// angles). The whole batch is analysed together. `imageDataUrl` (singular) is kept
// for backward compatibility; the route normalises both into one array.
export const MAX_MEAL_IMAGES = 5;

export const mealSchema = z.object({
  mealType: z.enum(["BREAKFAST", "LUNCH", "DINNER", "SNACK"]),
  imageDataUrl: z.string().startsWith("data:image/").optional(),
  imageDataUrls: z.array(z.string().startsWith("data:image/")).min(1).max(MAX_MEAL_IMAGES).optional(),
  description: z.string().min(2).max(1200).optional(),
  // Photo flow only: run AI several times and keep the median (self-consistency).
  precise: z.boolean().optional(),
  eatenAt: z.string().datetime().optional(),
  manualItems: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        estimatedAmount: z.string().min(1).max(120),
        calories: z.coerce.number().int().min(0).max(10000),
        protein: z.coerce.number().min(0).max(1000),
        fat: z.coerce.number().min(0).max(1000),
        carbs: z.coerce.number().min(0).max(1000),
        aiRating: z.enum(["GOOD", "OK", "LIMIT", "MANUAL"]).optional()
      })
    )
    .optional()
});

export const mealUpdateSchema = z.object({
  mealType: z.enum(["BREAKFAST", "LUNCH", "DINNER", "SNACK"]),
  items: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().min(1).max(120),
        estimatedAmount: z.string().min(1).max(120),
        calories: z.coerce.number().int().min(0).max(10000),
        protein: z.coerce.number().min(0).max(1000),
        fat: z.coerce.number().min(0).max(1000),
        carbs: z.coerce.number().min(0).max(1000),
        aiRating: z.enum(["GOOD", "OK", "LIMIT", "MANUAL"]).optional()
      })
    )
    .min(1)
});

export const savedFoodSchema = z.object({
  barcode: z.string().trim().min(4).max(80).optional(),
  name: z.string().min(1).max(120),
  estimatedAmount: z.string().min(1).max(120),
  calories: z.coerce.number().int().min(0).max(10000),
  protein: z.coerce.number().min(0).max(1000),
  fat: z.coerce.number().min(0).max(1000),
  carbs: z.coerce.number().min(0).max(1000),
  source: z.enum(["MANUAL", "NUTRITION_LABEL", "BARCODE", "MEAL_ITEM"]).optional(),
  isFavorite: z.coerce.boolean().optional()
});

export const savedFoodPatchSchema = savedFoodSchema.extend({
  archived: z.coerce.boolean().optional()
});

export const aiSettingsSchema = z
  .object({
    provider: z.enum(["openai", "gemini", "compatible"]),
    // Omit/blank apiKey to keep the previously saved key unchanged.
    apiKey: z.string().max(400).optional(),
    baseUrl: z.string().max(300).optional(),
    visionModel: z.string().max(120).optional(),
    textModel: z.string().max(120).optional()
  })
  .refine((v) => v.provider !== "compatible" || !!v.baseUrl?.trim(), {
    message: "OpenAI 相容 API 需要填寫 Base URL",
    path: ["baseUrl"]
  })
  .refine((v) => v.provider !== "compatible" || !!v.visionModel?.trim(), {
    message: "OpenAI 相容 API 需要填寫模型名稱",
    path: ["visionModel"]
  });

// Request body for listing a provider's available models. The apiKey is optional
// so the user can fetch with their already-saved key without re-typing it; the
// route falls back to the stored key when it's omitted.
export const aiModelListSchema = z
  .object({
    provider: z.enum(["openai", "gemini", "compatible"]),
    apiKey: z.string().max(400).optional(),
    baseUrl: z.string().max(300).optional()
  })
  .refine((v) => v.provider !== "compatible" || !!v.baseUrl?.trim(), {
    message: "OpenAI 相容 API 需要填寫 Base URL",
    path: ["baseUrl"]
  });
