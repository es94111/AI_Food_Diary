import "server-only";

import { createHmac } from "node:crypto";
import { addDaysStr, dayRangeUtc, dayStartUtc, todayStr, weekStartStr } from "@/lib/dates";
import { isPrismaErrorCode } from "@/lib/db";
import { getHealthContext } from "@/lib/health-context";
import { deleteImageIfUnreferenced } from "@/lib/image-refs";
import {
  canonicalBarcode,
  findSavedFoodMatches,
  normalizeFoodText,
} from "@/lib/saved-food-matching";
import { resolveUserTz } from "@/lib/timezone";
import { getHealthHistory, type HealthHistorySeries } from "@/lib/health-history";
import { collectWeeklySummaryStats, findStoredWeeklySummary } from "@/lib/weekly-summary";
import { appendAiAuditEvent, AI_ACTOR_SOURCE, type AiResourceType } from "./audit";
import { getMcpOAuthSecret } from "./config";
import { mealToMcpOutput, savedFoodToMcpOutput, waterLogToMcpOutput } from "./dto";
import { McpApplicationError } from "./errors";
import { resolveMealImageUrls } from "./meal-images";
import { assertMcpCreateOnlyOperation } from "./policy";
import {
  createMealAndAudit,
  createSavedFoodAndAudit,
  createWaterLogAndAudit,
  findAllSavedFoodsForDuplicateCheck,
  findMeal,
  findMeals,
  findSavedFoods,
  findWaterLogs,
  getUserTimezone,
  getWeeklySummaryUser,
  sumWaterLogs,
  type McpInvocation,
} from "./repository";
import { createMealInputSchema } from "./schemas";
import type {
  CreateMealInput,
  CreateSavedFoodInput,
  CreateWaterLogInput,
  GetHealthDataInput,
  GetMealInput,
  GetWeeklySummaryInput,
  ListMealsInput,
  ListSavedFoodsInput,
  ListWaterLogsInput,
  MealOutput,
  SavedFoodOutput,
  SearchMealsInput,
  SearchSavedFoodsInput,
  WaterLogOutput,
} from "./schemas";

async function userTimeZone(userId: string) {
  return resolveUserTz(undefined, await getUserTimezone(userId));
}

function page<T extends { id: string }>(
  rows: T[],
  limit: number,
): { values: T[]; nextCursor: string | null } {
  const values = rows.slice(0, limit);
  return {
    values,
    nextCursor: rows.length > limit ? values.at(-1)?.id ?? null : null,
  };
}

async function auditRead(
  invocation: McpInvocation,
  resourceType: AiResourceType,
  result: { ids: string[]; resourceId?: string; query?: string; date?: string },
) {
  await appendAiAuditEvent({
    userId: invocation.userId,
    actorType: "ai",
    actorSource: AI_ACTOR_SOURCE,
    action: "AI_READ_SUCCEEDED",
    resourceType,
    resourceId: result.resourceId ?? null,
    mcpToolName: invocation.toolName,
    beforeState: null,
    // Deliberately audit only a bounded summary. The user-facing activity
    // record remains useful without duplicating every sensitive result value.
    afterState: {
      resultIds: result.ids,
      resultCount: result.ids.length,
      ...(result.query ? { query: result.query } : {}),
      ...(result.date ? { date: result.date } : {}),
    },
    requestId: invocation.requestId,
    correlationId: invocation.correlationId,
    status: "succeeded",
  });
}

export async function listMealsService(
  invocation: McpInvocation,
  input: ListMealsInput,
): Promise<{ meals: MealOutput[]; nextCursor: string | null }> {
  assertMcpCreateOnlyOperation("list");
  const tz = await userTimeZone(invocation.userId);
  const date = input.date ?? todayStr(tz);
  const range = dayRangeUtc(date, tz);
  const rows = await findMeals({
    userId: invocation.userId,
    ...range,
    cursor: input.cursor,
    take: input.limit + 1,
  });
  const result = page(rows, input.limit);
  const meals = result.values.map(mealToMcpOutput);
  await auditRead(invocation, "MEAL", { ids: meals.map((meal) => meal.id), date });
  return { meals, nextCursor: result.nextCursor };
}

export async function getMealService(
  invocation: McpInvocation,
  input: GetMealInput,
): Promise<{ meal: MealOutput }> {
  assertMcpCreateOnlyOperation("get");
  const row = await findMeal(invocation.userId, input.id);
  if (!row) {
    throw new McpApplicationError("RESOURCE_NOT_FOUND", "Meal was not found.", 404);
  }
  const meal = mealToMcpOutput(row);
  await auditRead(invocation, "MEAL", {
    ids: [meal.id],
    resourceId: meal.id,
  });
  return { meal };
}

function mealMatches(meal: MealOutput, query: string): boolean {
  const normalized = normalizeFoodText(query);
  return meal.items.some(
    (item) =>
      normalizeFoodText(item.name).includes(normalized) ||
      normalizeFoodText(item.estimatedAmount).includes(normalized),
  );
}

export async function searchMealsService(
  invocation: McpInvocation,
  input: SearchMealsInput,
): Promise<{ meals: MealOutput[]; nextCursor: string | null }> {
  assertMcpCreateOnlyOperation("search");
  const tz = await userTimeZone(invocation.userId);
  const endDate =
    input.dateTo ??
    (input.dateFrom ? addDaysStr(input.dateFrom, 30) : todayStr(tz));
  const startDate = input.dateFrom ?? addDaysStr(endDate, -30);
  const scanTake = Math.min(input.limit * 4 + 1, 401);
  const rows = await findMeals({
    userId: invocation.userId,
    start: dayStartUtc(startDate, tz),
    end: dayStartUtc(addDaysStr(endDate, 1), tz),
    cursor: input.cursor,
    take: scanTake,
  });
  const matching = rows
    .map(mealToMcpOutput)
    .filter((meal) => mealMatches(meal, input.query));
  const meals = matching.slice(0, input.limit);
  const nextCursor =
    matching.length > input.limit
      ? meals.at(-1)?.id ?? null
      : rows.length === scanTake
        ? rows.at(-1)?.id ?? null
        : null;
  await auditRead(invocation, "MEAL", {
    ids: meals.map((meal) => meal.id),
    query: input.query,
  });
  return { meals, nextCursor };
}

export async function listSavedFoodsService(
  invocation: McpInvocation,
  input: ListSavedFoodsInput,
): Promise<{ foods: SavedFoodOutput[]; nextCursor: string | null }> {
  assertMcpCreateOnlyOperation("list");
  const rows = await findSavedFoods({
    userId: invocation.userId,
    includeArchived: input.includeArchived,
    cursor: input.cursor,
    take: input.limit + 1,
  });
  const result = page(rows, input.limit);
  const foods = result.values.map(savedFoodToMcpOutput);
  await auditRead(invocation, "SAVED_FOOD", { ids: foods.map((food) => food.id) });
  return { foods, nextCursor: result.nextCursor };
}

function foodMatches(food: SavedFoodOutput, query: string): boolean {
  const normalized = normalizeFoodText(query);
  return [food.name, food.estimatedAmount, food.brand ?? "", food.barcode ?? ""].some(
    (value) => normalizeFoodText(value).includes(normalized),
  );
}

export async function searchSavedFoodsService(
  invocation: McpInvocation,
  input: SearchSavedFoodsInput,
): Promise<{ foods: SavedFoodOutput[]; nextCursor: string | null }> {
  assertMcpCreateOnlyOperation("search");
  const scanTake = Math.min(input.limit * 4 + 1, 401);
  const rows = await findSavedFoods({
    userId: invocation.userId,
    includeArchived: input.includeArchived,
    cursor: input.cursor,
    take: scanTake,
  });
  const matching = rows
    .map(savedFoodToMcpOutput)
    .filter((food) => foodMatches(food, input.query));
  const foods = matching.slice(0, input.limit);
  const nextCursor =
    matching.length > input.limit
      ? foods.at(-1)?.id ?? null
      : rows.length === scanTake
        ? rows.at(-1)?.id ?? null
        : null;
  await auditRead(invocation, "SAVED_FOOD", {
    ids: foods.map((food) => food.id),
    query: input.query,
  });
  return { foods, nextCursor };
}

export async function listWaterLogsService(
  invocation: McpInvocation,
  input: ListWaterLogsInput,
): Promise<{ logs: WaterLogOutput[]; totalMl: number; nextCursor: string | null }> {
  assertMcpCreateOnlyOperation("list");
  const tz = await userTimeZone(invocation.userId);
  const date = input.date ?? todayStr(tz);
  const range = dayRangeUtc(date, tz);
  const [rows, totalMl] = await Promise.all([
    findWaterLogs({
      userId: invocation.userId,
      ...range,
      cursor: input.cursor,
      take: input.limit + 1,
    }),
    sumWaterLogs(invocation.userId, range.start, range.end),
  ]);
  const result = page(rows, input.limit);
  const logs = result.values.map(waterLogToMcpOutput);
  await auditRead(invocation, "WATER_LOG", { ids: logs.map((log) => log.id), date });
  return { logs, totalMl, nextCursor: result.nextCursor };
}

export async function getHealthDataService(
  invocation: McpInvocation,
  input: GetHealthDataInput,
): Promise<{ context: string; series: HealthHistorySeries[] }> {
  assertMcpCreateOnlyOperation("read");
  const tz = await userTimeZone(invocation.userId);
  const { start, end } = dayRangeUtc(todayStr(tz), tz);
  const [{ series, resultIds }, context] = await Promise.all([
    getHealthHistory(invocation.userId, input.types, input.limit),
    getHealthContext(invocation.userId, start, end),
  ]);
  await auditRead(invocation, "HEALTH_METRIC", {
    ids: resultIds,
    query: input.types.join(","),
  });
  return { context, series };
}

export async function getWeeklySummaryService(
  invocation: McpInvocation,
  input: GetWeeklySummaryInput,
) {
  assertMcpCreateOnlyOperation("read");
  const user = await getWeeklySummaryUser(invocation.userId);
  const tz = resolveUserTz(undefined, user.profile?.timezone);
  const currentWeekStart = weekStartStr(todayStr(tz));
  const date = input.date ?? addDaysStr(currentWeekStart, -7);
  const weekStartDate = weekStartStr(date);
  if (weekStartDate >= currentWeekStart) {
    throw new McpApplicationError(
      "INVALID_INPUT",
      "Only completed weeks can be queried.",
    );
  }

  const [stats, stored] = await Promise.all([
    collectWeeklySummaryStats(user, date, tz),
    findStoredWeeklySummary(user.id, date, tz),
  ]);
  const summary =
    stats.daysLogged === 0 && !stored
      ? null
      : {
          weekStartDate: stats.window.startDate,
          weekEndDate: stats.window.endDate,
          targetCalories: stats.targetCalories,
          totals: stats.totals,
          averages: stats.averages,
          daysLogged: stats.daysLogged,
          daysInWeek: stats.window.daysInWeek,
          waterTotalMl: stats.waterTotalMl,
          weightStartKg: stats.weightStartKg,
          weightEndKg: stats.weightEndKg,
          weightChangeKg: stats.weightChangeKg,
          aiSummary: stored?.aiSummary ?? null,
          aiRecommendation: stored?.aiRecommendation ?? null,
        };
  await auditRead(invocation, "WEEKLY_SUMMARY", {
    ids: stored ? [stored.id] : [],
    date: weekStartDate,
  });
  return { summary };
}

export async function createMealService(
  invocation: McpInvocation,
  input: CreateMealInput,
) {
  assertMcpCreateOnlyOperation("create");
  const validated = createMealInputSchema.safeParse(input);
  if (!validated.success) {
    throw new McpApplicationError(
      "INVALID_INPUT",
      "Meal input is invalid or its nutrition totals exceed the supported limits.",
    );
  }
  const imageStorageKeys = validated.data.imageUrls?.length
    ? await resolveMealImageUrls(invocation, validated.data.imageUrls)
    : [];
  try {
    const result = await createMealAndAudit(invocation, validated.data, imageStorageKeys);
    return { ...result, requestId: invocation.requestId, correlationId: invocation.correlationId };
  } catch (error) {
    await Promise.all(imageStorageKeys.map((key) => deleteImageIfUnreferenced(key).catch(() => undefined)));
    if (isPrismaErrorCode(error, "P2002")) {
      throw new McpApplicationError(
        "RESOURCE_ALREADY_EXISTS",
        "Create-only MCP operations cannot overwrite an existing resource.",
        409,
      );
    }
    throw error;
  }
}

function savedFoodFingerprint(input: CreateSavedFoodInput): string {
  const canonical = JSON.stringify({
    barcode: canonicalBarcode(input.barcode),
    name: normalizeFoodText(input.name),
    estimatedAmount: normalizeFoodText(input.estimatedAmount),
    brand: normalizeFoodText(input.brand ?? ""),
    calories: input.calories,
    protein: input.protein,
    fat: input.fat,
    carbs: input.carbs,
  });
  return createHmac("sha256", getMcpOAuthSecret()).update(canonical).digest("base64url");
}

export async function createSavedFoodService(
  invocation: McpInvocation,
  input: CreateSavedFoodInput,
) {
  assertMcpCreateOnlyOperation("create");
  const normalizedInput = {
    ...input,
    barcode: canonicalBarcode(input.barcode) ?? undefined,
  };
  const existing = (await findAllSavedFoodsForDuplicateCheck(invocation.userId)).map(
    savedFoodToMcpOutput,
  );
  const duplicate = findSavedFoodMatches(
    { id: "candidate", ...normalizedInput },
    existing,
  );
  if (duplicate.exactBarcode || duplicate.matches.length > 0) {
    throw new McpApplicationError(
      "RESOURCE_ALREADY_EXISTS",
      "Create-only MCP operations cannot overwrite or duplicate an existing saved food.",
      409,
    );
  }
  try {
    const result = await createSavedFoodAndAudit(
      invocation,
      normalizedInput,
      savedFoodFingerprint(normalizedInput),
    );
    return { ...result, requestId: invocation.requestId, correlationId: invocation.correlationId };
  } catch (error) {
    if (isPrismaErrorCode(error, "P2002")) {
      throw new McpApplicationError(
        "RESOURCE_ALREADY_EXISTS",
        "Create-only MCP operations cannot overwrite or duplicate an existing resource.",
        409,
      );
    }
    throw error;
  }
}

export async function createWaterLogService(
  invocation: McpInvocation,
  input: CreateWaterLogInput,
) {
  assertMcpCreateOnlyOperation("create");
  try {
    const result = await createWaterLogAndAudit(invocation, input);
    return { ...result, requestId: invocation.requestId, correlationId: invocation.correlationId };
  } catch (error) {
    if (isPrismaErrorCode(error, "P2002")) {
      throw new McpApplicationError(
        "RESOURCE_ALREADY_EXISTS",
        "Create-only MCP operations cannot overwrite an existing resource.",
        409,
      );
    }
    throw error;
  }
}
