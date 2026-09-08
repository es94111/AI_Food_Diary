import { z } from "zod";

/**
 * Strict MCP boundary schemas.
 *
 * These schemas deliberately do not import route handlers, Prisma, auth, or
 * `server-only`. Identity and provenance are derived from the authenticated
 * server context and therefore never appear in create inputs.
 */

export const MCP_DEFAULT_PAGE_SIZE = 25;
export const MCP_MAX_PAGE_SIZE = 100;
export const MCP_MAX_SEARCH_WINDOW_DAYS = 31;

const resourceIdSchema = z.string().trim().min(1).max(128);
const cursorSchema = z.string().trim().min(1).max(512);
const pageSizeSchema = z.number().int().min(1).max(MCP_MAX_PAGE_SIZE).default(MCP_DEFAULT_PAGE_SIZE);
const isoDateTimeSchema = z.string().datetime({ offset: true });
const boundedDiaryDateTimeSchema = isoDateTimeSchema.refine((value) => {
  const time = Date.parse(value);
  const now = Date.now();
  const earliest = now - 2 * 365 * 24 * 60 * 60 * 1_000;
  const latest = now + 2 * 24 * 60 * 60 * 1_000;
  return time >= earliest && time <= latest;
}, "Timestamp is outside the supported diary window");

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

export const mcpCalendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a calendar date in YYYY-MM-DD format")
  .refine(isCalendarDate, "Expected a valid calendar date");

export const mcpIsoDateTimeSchema = isoDateTimeSchema;
export const mcpBoundedDiaryDateTimeSchema = boundedDiaryDateTimeSchema;
export const mcpResourceIdSchema = resourceIdSchema;
export const mcpCursorSchema = cursorSchema;

const mealTypeSchema = z.enum(["BREAKFAST", "LUNCH", "DINNER", "SNACK"]);
const aiRatingSchema = z.enum(["GOOD", "OK", "LIMIT", "MANUAL"]);
const caloriesSchema = z.number().finite().min(0).max(10_000);
const macroSchema = z.number().finite().min(0).max(1_000);

const MEAL_TOTAL_LIMITS = {
  calories: 10_000,
  protein: 1_000,
  fat: 1_000,
  carbs: 1_000,
} as const;

const mealItemInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    estimatedAmount: z.string().trim().min(1).max(120),
    calories: caloriesSchema,
    protein: macroSchema,
    fat: macroSchema,
    carbs: macroSchema,
    aiRating: aiRatingSchema.optional()
  })
  .strict();

function validateSearchDateWindow(
  value: { dateFrom?: string; dateTo?: string },
  context: z.RefinementCtx
): void {
  if (!value.dateFrom || !value.dateTo) return;

  const from = Date.parse(`${value.dateFrom}T00:00:00Z`);
  const to = Date.parse(`${value.dateTo}T00:00:00Z`);
  if (to < from) {
    context.addIssue({
      code: "custom",
      path: ["dateTo"],
      message: "dateTo must be on or after dateFrom"
    });
    return;
  }

  const days = Math.floor((to - from) / 86_400_000) + 1;
  if (days > MCP_MAX_SEARCH_WINDOW_DAYS) {
    context.addIssue({
      code: "custom",
      path: ["dateTo"],
      message: `The search window cannot exceed ${MCP_MAX_SEARCH_WINDOW_DAYS} days`
    });
  }
}

// ── Read/list/search inputs ─────────────────────────────────────────────────

export const listMealsInputSchema = z
  .object({
    date: mcpCalendarDateSchema.optional(),
    cursor: cursorSchema.optional(),
    limit: pageSizeSchema
  })
  .strict();

export const getMealInputSchema = z
  .object({
    id: resourceIdSchema
  })
  .strict();

export const searchMealsInputSchema = z
  .object({
    query: z.string().trim().min(1).max(120),
    dateFrom: mcpCalendarDateSchema.optional(),
    dateTo: mcpCalendarDateSchema.optional(),
    cursor: cursorSchema.optional(),
    limit: pageSizeSchema
  })
  .strict()
  .superRefine(validateSearchDateWindow);

export const listSavedFoodsInputSchema = z
  .object({
    includeArchived: z.boolean().default(false),
    cursor: cursorSchema.optional(),
    limit: pageSizeSchema
  })
  .strict();

export const searchSavedFoodsInputSchema = z
  .object({
    query: z.string().trim().min(1).max(120),
    includeArchived: z.boolean().default(false),
    cursor: cursorSchema.optional(),
    limit: pageSizeSchema
  })
  .strict();

export const listWaterLogsInputSchema = z
  .object({
    date: mcpCalendarDateSchema.optional(),
    cursor: cursorSchema.optional(),
    limit: pageSizeSchema
  })
  .strict();

// ── Create-only inputs ──────────────────────────────────────────────────────

export const createMealInputSchema = z
  .object({
    mealType: mealTypeSchema,
    items: z.array(mealItemInputSchema).min(1).max(50),
    eatenAt: boundedDiaryDateTimeSchema.optional()
  })
  .strict()
  .superRefine((value, context) => {
    const totals = value.items.reduce(
      (sum, item) => ({
        calories: sum.calories + item.calories,
        protein: sum.protein + item.protein,
        fat: sum.fat + item.fat,
        carbs: sum.carbs + item.carbs,
      }),
      { calories: 0, protein: 0, fat: 0, carbs: 0 },
    );

    for (const nutrient of Object.keys(MEAL_TOTAL_LIMITS) as Array<
      keyof typeof MEAL_TOTAL_LIMITS
    >) {
      if (totals[nutrient] > MEAL_TOTAL_LIMITS[nutrient]) {
        context.addIssue({
          code: "custom",
          path: ["items"],
          message: `Meal total ${nutrient} cannot exceed ${MEAL_TOTAL_LIMITS[nutrient]}`,
        });
      }
    }
  });

export const createSavedFoodInputSchema = z
  .object({
    barcode: z.string().trim().min(4).max(80).optional(),
    name: z.string().trim().min(1).max(120),
    estimatedAmount: z.string().trim().min(1).max(120),
    brand: z.string().trim().min(1).max(80).optional(),
    calories: caloriesSchema,
    protein: macroSchema,
    fat: macroSchema,
    carbs: macroSchema,
    isFavorite: z.boolean().optional()
  })
  .strict();

export const createWaterLogInputSchema = z
  .object({
    amountMl: z.number().int().min(1).max(5_000),
    drankAt: boundedDiaryDateTimeSchema.optional()
  })
  .strict();

/** Cookie-authenticated human restore body. Never register this as an MCP tool. */
export const restoreAiActivitySchema = z
  .object({
    confirm: z.literal(true),
    reason: z.string().trim().min(1).max(500),
    expectedVersion: isoDateTimeSchema.optional()
  })
  .strict();

// ── Explicit MCP structured-output schemas ─────────────────────────────────

export const mealItemOutputSchema = z
  .object({
    id: resourceIdSchema,
    name: z.string().max(120),
    estimatedAmount: z.string().max(120),
    calories: caloriesSchema,
    protein: macroSchema,
    fat: macroSchema,
    carbs: macroSchema,
    aiRating: aiRatingSchema
  })
  .strict();

export const mealOutputSchema = z
  .object({
    id: resourceIdSchema,
    mealType: mealTypeSchema,
    totalCalories: caloriesSchema,
    totalProtein: macroSchema,
    totalFat: macroSchema,
    totalCarbs: macroSchema,
    aiConfidence: z.number().finite().min(0).max(1).nullable(),
    aiNotes: z.string().max(4_000).nullable(),
    imageCount: z.number().int().min(0).max(5),
    eatenAt: isoDateTimeSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
    items: z.array(mealItemOutputSchema).max(50)
  })
  .strict();

export const savedFoodOutputSchema = z
  .object({
    id: resourceIdSchema,
    barcode: z.string().max(80).nullable(),
    name: z.string().max(120),
    estimatedAmount: z.string().max(120),
    brand: z.string().max(80).nullable(),
    calories: caloriesSchema,
    protein: macroSchema,
    fat: macroSchema,
    carbs: macroSchema,
    source: z.string().max(80),
    isFavorite: z.boolean(),
    useCount: z.number().int().nonnegative(),
    lastUsedAt: isoDateTimeSchema.nullable(),
    archivedAt: isoDateTimeSchema.nullable(),
    hasImage: z.boolean(),
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict();

export const waterLogOutputSchema = z
  .object({
    id: resourceIdSchema,
    amountMl: z.number().int().min(1).max(5_000),
    drankAt: isoDateTimeSchema,
    createdAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema
  })
  .strict();

const nextCursorOutputSchema = cursorSchema.nullable();
const createReceiptShape = {
  auditEventId: resourceIdSchema,
  requestId: z.string().trim().min(1).max(200),
  correlationId: z.string().trim().min(1).max(200)
} as const;

export const listMealsOutputSchema = z
  .object({ meals: z.array(mealOutputSchema).max(MCP_MAX_PAGE_SIZE), nextCursor: nextCursorOutputSchema })
  .strict();

export const getMealOutputSchema = z.object({ meal: mealOutputSchema }).strict();

export const searchMealsOutputSchema = z
  .object({ meals: z.array(mealOutputSchema).max(MCP_MAX_PAGE_SIZE), nextCursor: nextCursorOutputSchema })
  .strict();

export const listSavedFoodsOutputSchema = z
  .object({ foods: z.array(savedFoodOutputSchema).max(MCP_MAX_PAGE_SIZE), nextCursor: nextCursorOutputSchema })
  .strict();

export const searchSavedFoodsOutputSchema = z
  .object({ foods: z.array(savedFoodOutputSchema).max(MCP_MAX_PAGE_SIZE), nextCursor: nextCursorOutputSchema })
  .strict();

export const listWaterLogsOutputSchema = z
  .object({
    logs: z.array(waterLogOutputSchema).max(MCP_MAX_PAGE_SIZE),
    totalMl: z.number().int().nonnegative(),
    nextCursor: nextCursorOutputSchema
  })
  .strict();

export const createMealOutputSchema = z
  .object({ meal: mealOutputSchema, ...createReceiptShape })
  .strict();

export const createSavedFoodOutputSchema = z
  .object({ food: savedFoodOutputSchema, ...createReceiptShape })
  .strict();

export const createWaterLogOutputSchema = z
  .object({ log: waterLogOutputSchema, ...createReceiptShape })
  .strict();

export const restoreAiActivityOutputSchema = z
  .object({
    originalActionId: resourceIdSchema,
    restoreActionId: resourceIdSchema,
    resourceType: z.enum(["MEAL", "SAVED_FOOD", "WATER_LOG"]),
    resourceId: resourceIdSchema,
    status: z.literal("SUCCEEDED"),
    restoredAt: isoDateTimeSchema
  })
  .strict();

// Inferred public types keep tool/service signatures aligned with validation.
export type ListMealsInput = z.infer<typeof listMealsInputSchema>;
export type GetMealInput = z.infer<typeof getMealInputSchema>;
export type SearchMealsInput = z.infer<typeof searchMealsInputSchema>;
export type ListSavedFoodsInput = z.infer<typeof listSavedFoodsInputSchema>;
export type SearchSavedFoodsInput = z.infer<typeof searchSavedFoodsInputSchema>;
export type ListWaterLogsInput = z.infer<typeof listWaterLogsInputSchema>;
export type CreateMealInput = z.infer<typeof createMealInputSchema>;
export type CreateSavedFoodInput = z.infer<typeof createSavedFoodInputSchema>;
export type CreateWaterLogInput = z.infer<typeof createWaterLogInputSchema>;
export type RestoreAiActivityInput = z.infer<typeof restoreAiActivitySchema>;
export type MealOutput = z.infer<typeof mealOutputSchema>;
export type SavedFoodOutput = z.infer<typeof savedFoodOutputSchema>;
export type WaterLogOutput = z.infer<typeof waterLogOutputSchema>;
