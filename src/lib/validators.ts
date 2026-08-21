import { z } from "zod";

// Cap password length: argon2 has no practical input limit, so an unbounded
// string turns every login/register into a CPU amplification vector. 128 is
// far above any real passphrase (zod rejects before any hashing happens).
const passwordSchema = z.string().min(8).max(128);

export const registerSchema = z.object({
  email: z.string().email(),
  password: passwordSchema,
  name: z.string().min(1).max(80).optional(),
  "cf-turnstile-response": z.string().optional()
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
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
  drankAt: boundedDatetime().optional()
});

// Timestamps must stay in a sane window: `z.string().datetime()` alone accepts
// year 9999, letting records land on days no query will ever hit (and skewing
// stats). Diary backfill is legitimate, so allow the past 2 years and a small
// future window for clock skew.
function boundedDatetime() {
  return z.string().datetime().refine((value) => {
    const time = Date.parse(value);
    const now = Date.now();
    return time >= now - 2 * 365 * 24 * 60 * 60 * 1000 && time <= now + 2 * 24 * 60 * 60 * 1000;
  }, "時間戳超出合理範圍");
}

// A 6 MB binary image is ~8 MB as base64. The upload path enforces 6 MB after
// decoding (storage.ts), but the AI-analyse paths feed the data URL straight to
// the provider — cap the encoded length here so a multi-hundred-MB body is
// rejected before JSON parsing hammers memory/CPU.
export const MAX_IMAGE_DATA_URL_LENGTH = 8_400_000;

function imageDataUrlSchema() {
  return z
    .string()
    .startsWith("data:image/")
    .refine((value) => value.length <= MAX_IMAGE_DATA_URL_LENGTH, "圖片超過 6 MB 上限");
}

// Reusable for route-local schemas (e.g. nutrition-label upload).
export { imageDataUrlSchema };

// Photo uploads may include several images of the same meal (different dishes or
// angles). The whole batch is analysed together. `imageDataUrl` (singular) is kept
// for backward compatibility; the route normalises both into one array.
export const MAX_MEAL_IMAGES = 5;

export const mealSchema = z.object({
  mealType: z.enum(["BREAKFAST", "LUNCH", "DINNER", "SNACK"]),
  imageDataUrl: imageDataUrlSchema().optional(),
  imageDataUrls: z.array(imageDataUrlSchema()).min(1).max(MAX_MEAL_IMAGES).optional(),
  description: z.string().min(2).max(1200).optional(),
  // Photo flow only: run AI several times and keep the median (self-consistency).
  precise: z.boolean().optional(),
  // Saved foods whose stored photo should be attached to this meal by reference
  // (the meal points at the same object key instead of re-uploading a copy).
  savedFoodImageIds: z.array(z.string().min(1)).max(MAX_MEAL_IMAGES).optional(),
  eatenAt: boundedDatetime().optional(),
  // Bounded: each item is fanned out into a MealItem row (and into AI prompts
  // on the manual/reestimate paths), so an unbounded array is a row-count and
  // token-cost amplification vector.
  manualItems: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        estimatedAmount: z.string().min(1).max(120),
        calories: z.coerce.number().min(0).max(10000),
        protein: z.coerce.number().min(0).max(1000),
        fat: z.coerce.number().min(0).max(1000),
        carbs: z.coerce.number().min(0).max(1000),
        aiRating: z.enum(["GOOD", "OK", "LIMIT", "MANUAL"]).optional()
      })
    )
    .max(50)
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
        calories: z.coerce.number().min(0).max(10000),
        protein: z.coerce.number().min(0).max(1000),
        fat: z.coerce.number().min(0).max(1000),
        carbs: z.coerce.number().min(0).max(1000),
        aiRating: z.enum(["GOOD", "OK", "LIMIT", "MANUAL"]).optional()
      })
    )
    .min(1)
    .max(50)
});

// Retroactively append photos to an existing meal (e.g. a meal logged via the
// describe/manual flow without a photo). The route enforces MAX_MEAL_IMAGES
// against the meal's current image count.
export const mealImageAppendSchema = z.object({
  imageDataUrls: z.array(imageDataUrlSchema()).min(1).max(MAX_MEAL_IMAGES)
});

export const savedFoodSchema = z.object({
  barcode: z.string().trim().min(4).max(80).optional(),
  name: z.string().min(1).max(120),
  estimatedAmount: z.string().min(1).max(120),
  brand: z.string().trim().min(1).max(80).optional(),
  calories: z.coerce.number().min(0).max(10000),
  protein: z.coerce.number().min(0).max(1000),
  fat: z.coerce.number().min(0).max(1000),
  carbs: z.coerce.number().min(0).max(1000),
  source: z.enum(["MANUAL", "NUTRITION_LABEL", "BARCODE", "MEAL_ITEM", "BRAND_SEARCH"]).optional(),
  isFavorite: z.coerce.boolean().optional(),
  // Optional food photo as a data URL (uploaded to object storage by the route).
  imageDataUrl: imageDataUrlSchema().optional(),
  // Set to clear an existing photo (on edit).
  removeImage: z.coerce.boolean().optional()
});

export const savedFoodCreateSchema = savedFoodSchema.extend({
  allowDuplicate: z.coerce.boolean().optional()
});

// PATCH is intentionally partial so archive restore can send only
// `{ archived: false }`; the route merges omitted fields with the stored food.
export const savedFoodPatchSchema = savedFoodSchema.partial().extend({
  // `null` explicitly clears an existing barcode; omission keeps it unchanged.
  barcode: z.string().trim().min(4).max(80).nullable().optional(),
  archived: z.coerce.boolean().optional()
});

// POST /api/foods/brand-search request body. Both fields are required — a
// brand-only or item-only query is rejected before any search runs (FR-001).
export const brandSearchSchema = z.object({
  brand: z.string().trim().min(1).max(80),
  itemName: z.string().trim().min(1).max(120)
});

export const savedFoodBatchArchiveSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100)
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
