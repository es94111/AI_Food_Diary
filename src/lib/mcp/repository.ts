import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { encryptMealItemWrite, encryptMealNotesWrite, encryptSavedFoodWrite } from "@/lib/b2-crypto";
import { prisma } from "@/lib/db";
import { appendAiAuditEvent, AI_ACTOR_SOURCE } from "./audit";
import { mealToMcpOutput, savedFoodToMcpOutput, waterLogToMcpOutput } from "./dto";
import { McpApplicationError } from "./errors";
import type {
  CreateMealInput,
  CreateSavedFoodInput,
  CreateWaterLogInput,
} from "./schemas";

const mealSelect = {
  id: true,
  mealType: true,
  imageStorageKey: true,
  imageStorageKeys: true,
  totalCalories: true,
  totalProtein: true,
  totalFat: true,
  totalCarbs: true,
  aiConfidence: true,
  aiNotes: true,
  encAiNotes: true,
  eatenAt: true,
  createdAt: true,
  updatedAt: true,
  items: {
    select: {
      id: true,
      name: true,
      estimatedAmount: true,
      encName: true,
      encEstimatedAmount: true,
      calories: true,
      protein: true,
      fat: true,
      carbs: true,
      aiRating: true,
    },
  },
} satisfies Prisma.MealSelect;

const savedFoodSelect = {
  id: true,
  barcode: true,
  imageStorageKey: true,
  name: true,
  estimatedAmount: true,
  encName: true,
  encEstimatedAmount: true,
  encBrand: true,
  calories: true,
  protein: true,
  fat: true,
  carbs: true,
  source: true,
  isFavorite: true,
  useCount: true,
  lastUsedAt: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SavedFoodSelect;

const waterLogSelect = {
  id: true,
  amountMl: true,
  drankAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WaterLogSelect;

export type McpInvocation = {
  userId: string;
  toolName: string;
  requestId: string;
  correlationId: string;
  signal?: AbortSignal;
  deadlineAt?: number;
};

export function assertMcpInvocationActive(invocation: McpInvocation): number {
  if (invocation.signal?.aborted) {
    throw new McpApplicationError(
      "MCP_REQUEST_CANCELLED",
      "The MCP request was cancelled before the operation completed.",
      408,
    );
  }
  const remaining = invocation.deadlineAt
    ? invocation.deadlineAt - Date.now()
    : Number.POSITIVE_INFINITY;
  if (remaining <= 500) {
    throw new McpApplicationError(
      "MCP_TIMEOUT",
      "The MCP request deadline was reached before a safe write could begin.",
      504,
    );
  }
  return remaining;
}

function transactionOptions(invocation: McpInvocation) {
  const remaining = assertMcpInvocationActive(invocation);
  if (!Number.isFinite(remaining)) return undefined;
  const timeout = Math.max(1, Math.floor(remaining - 250));
  return {
    maxWait: Math.max(1, Math.min(2_000, Math.floor(timeout / 4))),
    timeout,
  };
}

async function assertOwnedCursor(
  model: "meal" | "savedFood" | "waterLog",
  userId: string,
  cursor: string | undefined,
): Promise<void> {
  if (!cursor) return;
  const found =
    model === "meal"
      ? await prisma.meal.findFirst({ where: { id: cursor, userId }, select: { id: true } })
      : model === "savedFood"
        ? await prisma.savedFood.findFirst({ where: { id: cursor, userId }, select: { id: true } })
        : await prisma.waterLog.findFirst({ where: { id: cursor, userId }, select: { id: true } });
  if (!found) {
    throw new McpApplicationError("INVALID_INPUT", "The pagination cursor is invalid.");
  }
}

export async function getUserTimezone(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { profile: { select: { timezone: true } } },
  });
  if (!user) throw new McpApplicationError("FORBIDDEN", "The authenticated user is unavailable.", 403);
  return user.profile?.timezone ?? null;
}

export async function findMeal(userId: string, id: string) {
  return prisma.meal.findFirst({ where: { id, userId }, select: mealSelect });
}

export async function findMeals(input: {
  userId: string;
  start?: Date;
  end?: Date;
  cursor?: string;
  take: number;
}) {
  await assertOwnedCursor("meal", input.userId, input.cursor);
  return prisma.meal.findMany({
    where: {
      userId: input.userId,
      ...(input.start || input.end
        ? {
            eatenAt: {
              ...(input.start ? { gte: input.start } : {}),
              ...(input.end ? { lt: input.end } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ eatenAt: "desc" }, { id: "desc" }],
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    take: input.take,
    select: mealSelect,
  });
}

export async function findSavedFoods(input: {
  userId: string;
  includeArchived: boolean;
  cursor?: string;
  take: number;
}) {
  await assertOwnedCursor("savedFood", input.userId, input.cursor);
  return prisma.savedFood.findMany({
    where: {
      userId: input.userId,
      ...(input.includeArchived ? {} : { archivedAt: null }),
    },
    orderBy: [{ isFavorite: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    take: input.take,
    select: savedFoodSelect,
  });
}

export async function findAllSavedFoodsForDuplicateCheck(userId: string) {
  return prisma.savedFood.findMany({
    where: { userId },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: savedFoodSelect,
  });
}

export async function findWaterLogs(input: {
  userId: string;
  start: Date;
  end: Date;
  cursor?: string;
  take: number;
}) {
  await assertOwnedCursor("waterLog", input.userId, input.cursor);
  return prisma.waterLog.findMany({
    where: {
      userId: input.userId,
      drankAt: { gte: input.start, lt: input.end },
    },
    orderBy: [{ drankAt: "desc" }, { id: "desc" }],
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    take: input.take,
    select: waterLogSelect,
  });
}

export async function sumWaterLogs(userId: string, start: Date, end: Date) {
  const result = await prisma.waterLog.aggregate({
    where: { userId, drankAt: { gte: start, lt: end } },
    _sum: { amountMl: true },
  });
  return result._sum.amountMl ?? 0;
}

export async function createMealAndAudit(
  invocation: McpInvocation,
  input: CreateMealInput,
) {
  assertMcpInvocationActive(invocation);
  const totals = input.items.reduce(
    (sum, item) => ({
      calories: sum.calories + item.calories,
      protein: sum.protein + item.protein,
      fat: sum.fat + item.fat,
      carbs: sum.carbs + item.carbs,
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0 },
  );

  return prisma.$transaction(async (tx) => {
    assertMcpInvocationActive(invocation);
    const row = await tx.meal.create({
      data: {
        userId: invocation.userId,
        mealType: input.mealType,
        eatenAt: input.eatenAt ? new Date(input.eatenAt) : new Date(),
        totalCalories: totals.calories,
        totalProtein: totals.protein,
        totalFat: totals.fat,
        totalCarbs: totals.carbs,
        aiConfidence: 1,
        ...encryptMealNotesWrite("Created through the authorized ChatGPT MCP connector."),
        items: { create: input.items.map(encryptMealItemWrite) },
        createdByType: "ai",
        createdByUserId: invocation.userId,
        createdByAiSource: AI_ACTOR_SOURCE,
        createdByRequestId: invocation.requestId,
      },
      select: mealSelect,
    });
    assertMcpInvocationActive(invocation);
    const meal = mealToMcpOutput(row);
    const event = await appendAiAuditEvent(
      {
        userId: invocation.userId,
        actorType: "ai",
        actorSource: AI_ACTOR_SOURCE,
        action: "AI_CREATE_SUCCEEDED",
        resourceType: "MEAL",
        resourceId: row.id,
        mcpToolName: invocation.toolName,
        beforeState: null,
        afterState: meal,
        requestId: invocation.requestId,
        correlationId: invocation.correlationId,
        status: "succeeded",
        resourceVersion: row.updatedAt,
      },
      tx,
    );
    assertMcpInvocationActive(invocation);
    return { meal, auditEventId: event.id };
  }, transactionOptions(invocation));
}

export async function createSavedFoodAndAudit(
  invocation: McpInvocation,
  input: CreateSavedFoodInput,
  fingerprint: string,
) {
  assertMcpInvocationActive(invocation);
  return prisma.$transaction(async (tx) => {
    assertMcpInvocationActive(invocation);
    const row = await tx.savedFood.create({
      data: {
        userId: invocation.userId,
        ...encryptSavedFoodWrite({
          ...input,
          barcode: input.barcode ?? null,
          brand: input.brand ?? null,
          source: "CHATGPT_MCP",
          isFavorite: input.isFavorite ?? false,
        }),
        createdByType: "ai",
        createdByUserId: invocation.userId,
        createdByAiSource: AI_ACTOR_SOURCE,
        createdByRequestId: invocation.requestId,
        mcpCreateFingerprint: fingerprint,
      },
      select: savedFoodSelect,
    });
    assertMcpInvocationActive(invocation);
    const food = savedFoodToMcpOutput(row);
    const event = await appendAiAuditEvent(
      {
        userId: invocation.userId,
        actorType: "ai",
        actorSource: AI_ACTOR_SOURCE,
        action: "AI_CREATE_SUCCEEDED",
        resourceType: "SAVED_FOOD",
        resourceId: row.id,
        mcpToolName: invocation.toolName,
        beforeState: null,
        afterState: food,
        requestId: invocation.requestId,
        correlationId: invocation.correlationId,
        status: "succeeded",
        resourceVersion: row.updatedAt,
      },
      tx,
    );
    assertMcpInvocationActive(invocation);
    return { food, auditEventId: event.id };
  }, transactionOptions(invocation));
}

export async function createWaterLogAndAudit(
  invocation: McpInvocation,
  input: CreateWaterLogInput,
) {
  assertMcpInvocationActive(invocation);
  return prisma.$transaction(async (tx) => {
    assertMcpInvocationActive(invocation);
    const row = await tx.waterLog.create({
      data: {
        userId: invocation.userId,
        amountMl: input.amountMl,
        drankAt: input.drankAt ? new Date(input.drankAt) : new Date(),
        createdByType: "ai",
        createdByUserId: invocation.userId,
        createdByAiSource: AI_ACTOR_SOURCE,
        createdByRequestId: invocation.requestId,
      },
      select: waterLogSelect,
    });
    assertMcpInvocationActive(invocation);
    const log = waterLogToMcpOutput(row);
    const event = await appendAiAuditEvent(
      {
        userId: invocation.userId,
        actorType: "ai",
        actorSource: AI_ACTOR_SOURCE,
        action: "AI_CREATE_SUCCEEDED",
        resourceType: "WATER_LOG",
        resourceId: row.id,
        mcpToolName: invocation.toolName,
        beforeState: null,
        afterState: log,
        requestId: invocation.requestId,
        correlationId: invocation.correlationId,
        status: "succeeded",
        resourceVersion: row.updatedAt,
      },
      tx,
    );
    assertMcpInvocationActive(invocation);
    return { log, auditEventId: event.id };
  }, transactionOptions(invocation));
}
