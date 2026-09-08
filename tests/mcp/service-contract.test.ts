import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.AUTH_SECRET = "test-only-secret-that-is-longer-than-thirty-two-bytes";
process.env.MCP_OAUTH_SECRET =
  "test-only-mcp-secret-that-is-longer-than-thirty-two-bytes";

type Row = Record<string, unknown> & { id: string; userId: string };
type AuditRow = Record<string, unknown> & { id: string };

const store: {
  meals: Row[];
  savedFoods: Row[];
  waterLogs: Row[];
  auditEvents: AuditRow[];
  serial: number;
} = {
  meals: [],
  savedFoods: [],
  waterLogs: [],
  auditEvents: [],
  serial: 0,
};

function id(prefix: string): string {
  store.serial += 1;
  return `${prefix}-${store.serial}`;
}

function record(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  return value as Record<string, unknown>;
}

function matchesDate(row: Row, where: Record<string, unknown>, field: string): boolean {
  const rangeValue = where[field];
  if (!rangeValue) return true;
  const range = record(rangeValue);
  const value = row[field] as Date;
  return (
    (!(range.gte instanceof Date) || value >= range.gte) &&
    (!(range.lt instanceof Date) || value < range.lt)
  );
}

function matchingRows(
  rows: Row[],
  argsValue: unknown,
  dateField?: string,
): Row[] {
  const args = record(argsValue);
  const where = record(args.where);
  let result = rows.filter(
    (row) =>
      (!where.id || row.id === where.id) &&
      (!where.userId || row.userId === where.userId) &&
      (!dateField || matchesDate(row, where, dateField)) &&
      (!("archivedAt" in where) || row.archivedAt === where.archivedAt),
  );
  result = [...result].reverse();
  const cursor = args.cursor ? record(args.cursor) : null;
  if (cursor?.id) {
    const cursorIndex = result.findIndex((row) => row.id === cursor.id);
    result = cursorIndex < 0 ? [] : result.slice(cursorIndex + Number(args.skip ?? 0));
  }
  if (typeof args.take === "number") result = result.slice(0, args.take);
  return result;
}

function uniqueRequest(rows: Row[], data: Record<string, unknown>): void {
  if (
    rows.some(
      (row) =>
        row.userId === data.userId &&
        row.createdByAiSource === data.createdByAiSource &&
        row.createdByRequestId === data.createdByRequestId,
    )
  ) {
    throw Object.assign(new Error("unique constraint"), { code: "P2002" });
  }
}

function baseRow(data: Record<string, unknown>, prefix: string): Row {
  const now = new Date("2026-09-08T12:00:00.000Z");
  return {
    ...data,
    id: id(prefix),
    userId: String(data.userId),
    createdAt: now,
    updatedAt: now,
  };
}

type FakeDatabase = Record<string, unknown>;

let fakePrisma: FakeDatabase;
fakePrisma = {
  user: {
    findUnique: async (argsValue: unknown) => {
      const args = record(argsValue);
      const where = record(args.where);
      return where.id === "missing-user"
        ? null
        : { id: where.id, profile: { timezone: "UTC" } };
    },
  },
  meal: {
    findFirst: async (argsValue: unknown) => matchingRows(store.meals, argsValue)[0] ?? null,
    findMany: async (argsValue: unknown) => matchingRows(store.meals, argsValue, "eatenAt"),
    deleteMany: async (argsValue: unknown) => {
      const where = record(record(argsValue).where);
      const index = store.meals.findIndex(
        (row) =>
          row.id === where.id &&
          row.userId === where.userId &&
          row.updatedAt instanceof Date &&
          where.updatedAt instanceof Date &&
          row.updatedAt.getTime() === where.updatedAt.getTime() &&
          row.createdByType === where.createdByType &&
          row.createdByAiSource === where.createdByAiSource &&
          row.createdByRequestId === where.createdByRequestId &&
          row.imageStorageKey === null &&
          Array.isArray(row.imageStorageKeys) &&
          row.imageStorageKeys.length === 0,
      );
      if (index < 0) return { count: 0 };
      store.meals.splice(index, 1);
      return { count: 1 };
    },
    create: async (argsValue: unknown) => {
      const data = record(record(argsValue).data);
      uniqueRequest(store.meals, data);
      const nestedItems = record(data.items).create;
      assert.ok(Array.isArray(nestedItems));
      const row = baseRow(
        {
          ...data,
          imageStorageKey: null,
          imageStorageKeys: [],
          items: nestedItems.map((item) => ({
            ...record(item),
            id: id("item"),
          })),
        },
        "meal",
      );
      store.meals.push(row);
      return row;
    },
  },
  savedFood: {
    findFirst: async (argsValue: unknown) => matchingRows(store.savedFoods, argsValue)[0] ?? null,
    findMany: async (argsValue: unknown) => matchingRows(store.savedFoods, argsValue),
    create: async (argsValue: unknown) => {
      const data = record(record(argsValue).data);
      uniqueRequest(store.savedFoods, data);
      if (
        data.mcpCreateFingerprint &&
        store.savedFoods.some(
          (row) =>
            row.userId === data.userId &&
            row.mcpCreateFingerprint === data.mcpCreateFingerprint,
        )
      ) {
        throw Object.assign(new Error("unique constraint"), { code: "P2002" });
      }
      const row = baseRow(
        {
          ...data,
          imageStorageKey: null,
          useCount: 0,
          lastUsedAt: null,
          archivedAt: null,
        },
        "food",
      );
      store.savedFoods.push(row);
      return row;
    },
  },
  waterLog: {
    findFirst: async (argsValue: unknown) => matchingRows(store.waterLogs, argsValue)[0] ?? null,
    findMany: async (argsValue: unknown) => matchingRows(store.waterLogs, argsValue, "drankAt"),
    aggregate: async (argsValue: unknown) => {
      const rows = matchingRows(store.waterLogs, argsValue, "drankAt");
      return {
        _sum: {
          amountMl: rows.reduce((sum, row) => sum + Number(row.amountMl), 0),
        },
      };
    },
    create: async (argsValue: unknown) => {
      const data = record(record(argsValue).data);
      uniqueRequest(store.waterLogs, data);
      const row = baseRow(data, "water");
      store.waterLogs.push(row);
      return row;
    },
  },
  aiAuditEvent: {
    create: async (argsValue: unknown) => {
      const data = record(record(argsValue).data);
      const now = new Date("2026-09-08T12:00:01.000Z");
      const row = {
        ...data,
        id: id("audit"),
        occurredAt: now,
        createdAt: now,
      };
      store.auditEvents.push(row);
      return row;
    },
    findFirst: async (argsValue: unknown) => {
      const where = record(record(argsValue).where);
      const row = store.auditEvents.find(
        (candidate) =>
          (!where.id || candidate.id === where.id) &&
          (!where.userId || candidate.userId === where.userId),
      );
      if (!row) return null;
      return {
        ...row,
        user: {
          id: row.userId,
          name: "Test user",
          email: `${String(row.userId)}@example.test`,
        },
        restoreEvents: store.auditEvents
          .filter(
            (candidate) =>
              candidate.originalAiActionId === row.id &&
              candidate.action === "USER_RESTORE_SUCCEEDED" &&
              candidate.status === "succeeded",
          )
          .map((candidate) => ({
            id: candidate.id,
            occurredAt: candidate.occurredAt,
            restoredAt: candidate.restoredAt,
            restoredByUserId: candidate.restoredByUserId,
          })),
      };
    },
  },
  $transaction: async (work: (transaction: FakeDatabase) => Promise<unknown>) =>
    work(fakePrisma),
};

(globalThis as unknown as { prisma: unknown }).prisma = fakePrisma;

const servicesPromise = import("../../src/lib/mcp/service");
const activityPromise = import("../../src/lib/ai-activity");

beforeEach(() => {
  store.meals = [];
  store.savedFoods = [];
  store.waterLogs = [];
  store.auditEvents = [];
  store.serial = 0;
});

function invocation(userId: string, toolName: string, requestId: string) {
  return { userId, toolName, requestId, correlationId: `correlation-${requestId}` };
}

function hasErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

test("production services create, list, get, and search only owned meals", async () => {
  const services = await servicesPromise;
  const created = await services.createMealService(
    invocation("user-a", "create_meal", "request-meal-1"),
    {
      mealType: "LUNCH",
      eatenAt: "2026-09-08T12:00:00.000Z",
      items: [
        {
          name: "Tofu bowl",
          estimatedAmount: "1 bowl",
          calories: 420,
          protein: 24,
          fat: 12,
          carbs: 54,
        },
      ],
    },
  );
  assert.equal(created.meal.items[0].name, "Tofu bowl");
  assert.ok(created.auditEventId);

  const listed = await services.listMealsService(
    invocation("user-a", "list_meals", "request-list-1"),
    { date: "2026-09-08", limit: 25 },
  );
  assert.deepEqual(listed.meals.map((meal) => meal.id), [created.meal.id]);

  const fetched = await services.getMealService(
    invocation("user-a", "get_meal", "request-get-1"),
    { id: created.meal.id },
  );
  assert.equal(fetched.meal.id, created.meal.id);

  const searched = await services.searchMealsService(
    invocation("user-a", "search_meals", "request-search-1"),
    {
      query: "tofu",
      dateFrom: "2026-09-08",
      dateTo: "2026-09-08",
      limit: 25,
    },
  );
  assert.equal(searched.meals.length, 1);

  await assert.rejects(
    services.getMealService(
      invocation("user-b", "get_meal", "request-get-other"),
      { id: created.meal.id },
    ),
    (error: unknown) => hasErrorCode(error, "RESOURCE_NOT_FOUND"),
  );
  assert.equal(
    store.auditEvents.filter((event) => event.action === "AI_CREATE_SUCCEEDED").length,
    1,
  );
  assert.equal(
    store.auditEvents.filter((event) => event.action === "AI_READ_SUCCEEDED").length,
    3,
  );
});

test("create-only service rejects replay instead of overwriting a meal", async () => {
  const services = await servicesPromise;
  const call = () =>
    services.createMealService(
      invocation("user-a", "create_meal", "same-request"),
      {
        mealType: "SNACK" as const,
        items: [
          {
            name: "Apple",
            estimatedAmount: "1",
            calories: 80,
            protein: 0,
            fat: 0,
            carbs: 21,
          },
        ],
      },
    );
  const first = await call();
  await assert.rejects(
    call(),
    (error: unknown) => hasErrorCode(error, "RESOURCE_ALREADY_EXISTS"),
  );
  assert.equal(store.meals.length, 1);
  assert.equal(store.meals[0].id, first.meal.id);
});

test("meal totals are rejected before any record or success audit is written", async () => {
  const services = await servicesPromise;
  await assert.rejects(
    services.createMealService(
      invocation("user-a", "create_meal", "oversized-meal"),
      {
        mealType: "DINNER",
        items: [
          {
            name: "Item one",
            estimatedAmount: "1",
            calories: 6_000,
            protein: 600,
            fat: 1,
            carbs: 1,
          },
          {
            name: "Item two",
            estimatedAmount: "1",
            calories: 6_000,
            protein: 600,
            fat: 1,
            carbs: 1,
          },
        ],
      },
    ),
    (error: unknown) => hasErrorCode(error, "INVALID_INPUT"),
  );
  assert.equal(store.meals.length, 0);
  assert.equal(
    store.auditEvents.filter((event) => event.action === "AI_CREATE_SUCCEEDED").length,
    0,
  );
});

test("saved-food duplicate checks reject a second create and preserve the first", async () => {
  const services = await servicesPromise;
  const input = {
    name: "Greek yogurt",
    estimatedAmount: "150 g",
    brand: "Example",
    calories: 120,
    protein: 12,
    fat: 3,
    carbs: 11,
  };
  const first = await services.createSavedFoodService(
    invocation("user-a", "create_saved_food", "food-request-1"),
    input,
  );
  await assert.rejects(
    services.createSavedFoodService(
      invocation("user-a", "create_saved_food", "food-request-2"),
      input,
    ),
    (error: unknown) => hasErrorCode(error, "RESOURCE_ALREADY_EXISTS"),
  );
  const listed = await services.listSavedFoodsService(
    invocation("user-a", "list_saved_foods", "food-list"),
    { includeArchived: false, limit: 25 },
  );
  const searched = await services.searchSavedFoodsService(
    invocation("user-a", "search_saved_foods", "food-search"),
    { query: "yogurt", includeArchived: false, limit: 25 },
  );
  assert.deepEqual(listed.foods.map((food) => food.id), [first.food.id]);
  assert.deepEqual(searched.foods.map((food) => food.id), [first.food.id]);
  assert.equal(store.savedFoods.length, 1);
});

test("water-log create and list append one immutable audit event", async () => {
  const services = await servicesPromise;
  const created = await services.createWaterLogService(
    invocation("user-a", "create_water_log", "water-create"),
    { amountMl: 350, drankAt: "2026-09-08T08:00:00.000Z" },
  );
  const listed = await services.listWaterLogsService(
    invocation("user-a", "list_water_logs", "water-list"),
    { date: "2026-09-08", limit: 25 },
  );
  assert.equal(listed.logs[0].id, created.log.id);
  assert.equal(listed.totalMl, 350);
  assert.equal(
    store.auditEvents.filter((event) => event.action === "AI_CREATE_SUCCEEDED").length,
    1,
  );
});

test("authorized human restore compensates the create and preserves immutable history", async () => {
  const services = await servicesPromise;
  const activity = await activityPromise;
  const created = await services.createMealService(
    invocation("user-a", "create_meal", "restore-create"),
    {
      mealType: "DINNER",
      items: [
        {
          name: "Noodles",
          estimatedAmount: "1 bowl",
          calories: 450,
          protein: 18,
          fat: 10,
          carbs: 70,
        },
      ],
    },
  );
  const before = await activity.getAiActivity(
    { id: "user-a", isAdmin: false },
    created.auditEventId,
  );
  assert.equal(before.restorePreview.eligible, true);

  const restored = await activity.restoreAiActivity(
    { id: "user-a", isAdmin: false },
    created.auditEventId,
    {
      confirm: true,
      reason: "User confirmed this AI-created meal was accidental.",
      expectedVersion: before.restorePreview.expectedVersion ?? undefined,
    },
    { requestId: "human-restore", correlationId: "human-restore-correlation" },
  );
  assert.equal(restored.status, "SUCCEEDED");
  assert.equal(store.meals.length, 0);
  assert.ok(store.auditEvents.some((event) => event.id === created.auditEventId));
  assert.ok(
    store.auditEvents.some(
      (event) =>
        event.action === "USER_RESTORE_STARTED" &&
        event.originalAiActionId === created.auditEventId,
    ),
  );
  assert.ok(
    store.auditEvents.some(
      (event) =>
        event.action === "USER_RESTORE_SUCCEEDED" &&
        event.originalAiActionId === created.auditEventId,
    ),
  );
});

test("restore refuses a later human version and appends a failed event", async () => {
  const services = await servicesPromise;
  const activity = await activityPromise;
  const created = await services.createMealService(
    invocation("user-a", "create_meal", "conflict-create"),
    {
      mealType: "LUNCH",
      items: [
        {
          name: "Rice",
          estimatedAmount: "1 bowl",
          calories: 300,
          protein: 6,
          fat: 1,
          carbs: 65,
        },
      ],
    },
  );
  store.meals[0].updatedAt = new Date("2026-09-08T12:05:00.000Z");

  await assert.rejects(
    activity.restoreAiActivity(
      { id: "user-a", isAdmin: false },
      created.auditEventId,
      { confirm: true, reason: "Attempt after a human edit." },
      { requestId: "conflict-restore", correlationId: "conflict-restore" },
    ),
    (error: unknown) => hasErrorCode(error, "RESTORE_CONFLICT"),
  );
  assert.equal(store.meals.length, 1);
  assert.ok(
    store.auditEvents.some(
      (event) =>
        event.action === "USER_RESTORE_FAILED" &&
        event.errorCode === "RESTORE_CONFLICT",
    ),
  );
});
