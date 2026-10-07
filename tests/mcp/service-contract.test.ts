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
  healthMetrics: Row[];
  weeklySummaries: Row[];
  auditEvents: AuditRow[];
  serial: number;
} = {
  meals: [],
  savedFoods: [],
  waterLogs: [],
  healthMetrics: [],
  weeklySummaries: [],
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
        : {
            id: where.id,
            isAdmin: false,
            profile: {
              timezone: "UTC",
              gender: null,
              birthDate: null,
              heightCm: null,
              weightKg: null,
              activityLevel: null,
              goal: "MAINTAIN",
              calorieTarget: 2_000,
            },
          };
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
  healthMetric: {
    findMany: async (argsValue: unknown) => {
      const args = record(argsValue);
      const where = record(args.where);
      const range = where.measuredAt ? record(where.measuredAt) : {};
      const order = args.orderBy ? record(args.orderBy) : {};
      let rows = store.healthMetrics.filter((row) =>
        row.userId === where.userId &&
        (!where.type || row.type === where.type) &&
        (!(range.gte instanceof Date) || (row.measuredAt as Date) >= range.gte) &&
        (!(range.lt instanceof Date) || (row.measuredAt as Date) < range.lt),
      );
      rows = [...rows].sort((left, right) => {
        const direction = order.measuredAt === "desc" ? -1 : 1;
        return direction * ((left.measuredAt as Date).getTime() - (right.measuredAt as Date).getTime());
      });
      return typeof args.take === "number" ? rows.slice(0, args.take) : rows;
    },
    findFirst: async (argsValue: unknown) => {
      const args = record(argsValue);
      const where = record(args.where);
      const range = where.measuredAt ? record(where.measuredAt) : {};
      const unit = where.unit ? record(where.unit) : null;
      return (
        [...store.healthMetrics]
          .filter((row) =>
            row.userId === where.userId &&
            row.type === where.type &&
            (!(range.lt instanceof Date) || (row.measuredAt as Date) < range.lt) &&
            (!unit || String(row.unit).toLowerCase() === String(unit.equals).toLowerCase()),
          )
          .sort((left, right) => (right.measuredAt as Date).getTime() - (left.measuredAt as Date).getTime())[0] ?? null
      );
    },
  },
  weeklySummary: {
    findUnique: async (argsValue: unknown) => {
      const where = record(record(argsValue).where);
      const key = record(where.userId_weekStart);
      const weekStart = key.weekStart as Date;
      return store.weeklySummaries.find(
        (row) =>
          row.userId === key.userId &&
          row.weekStart instanceof Date &&
          row.weekStart.getTime() === weekStart.getTime(),
      ) ?? null;
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
  store.healthMetrics = [];
  store.weeklySummaries = [];
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

test("health history returns only the authenticated user's bounded plaintext metrics", async () => {
  const services = await servicesPromise;
  store.healthMetrics = [
    {
      id: "weight-user-a",
      userId: "user-a",
      type: "WEIGHT",
      unit: "kg",
      measuredAt: new Date("2026-09-08T08:00:00.000Z"),
      value: 64.5,
      encValue: null,
    },
    {
      id: "weight-user-b",
      userId: "user-b",
      type: "WEIGHT",
      unit: "kg",
      measuredAt: new Date("2026-09-08T08:00:00.000Z"),
      value: 91,
      encValue: null,
    },
    {
      id: "sleep-user-a",
      userId: "user-a",
      type: "SLEEP",
      unit: "minutes",
      measuredAt: new Date("2026-09-08T09:00:00.000Z"),
      value: 420,
      encValue: null,
    },
    {
      id: "steps-user-a",
      userId: "user-a",
      type: "STEPS",
      unit: "steps",
      measuredAt: new Date(Date.now() - 60_000),
      value: 123,
      encValue: null,
    },
    {
      id: "steps-user-b",
      userId: "user-b",
      type: "STEPS",
      unit: "steps",
      measuredAt: new Date(Date.now() - 60_000),
      value: 9_999,
      encValue: null,
    },
  ];

  const result = await services.getHealthDataService(
    invocation("user-a", "get_health_data", "health-read"),
    { types: ["WEIGHT", "SLEEP"], limit: 7 },
  );

  assert.match(result.context, /今日步數 123 步/);
  assert.doesNotMatch(result.context, /9999/);
  assert.deepEqual(result.series, [
    {
      type: "WEIGHT",
      unit: "kg",
      points: [{ at: "2026-09-08T08:00:00.000Z", value: 64.5 }],
    },
    {
      type: "SLEEP",
      unit: "minutes",
      points: [{ at: "2026-09-08T09:00:00.000Z", value: 420 }],
    },
  ]);
  assert.deepEqual(Object.keys(result.series[0]), ["type", "unit", "points"]);
  assert.deepEqual(Object.keys(result.series[0].points[0]), ["at", "value"]);
  assert.equal(store.auditEvents.at(-1)?.userId, "user-a");
  assert.equal(store.auditEvents.at(-1)?.resourceType, "HEALTH_METRIC");
});

test("weekly recap is read-only and scopes stats and stored AI text to its user", async () => {
  const services = await servicesPromise;
  const weekStart = new Date("2026-09-07T00:00:00.000Z");
  store.meals = [
    {
      id: "meal-user-a",
      userId: "user-a",
      eatenAt: new Date("2026-09-08T12:00:00.000Z"),
      totalCalories: 500,
      totalProtein: 30,
      totalFat: 15,
      totalCarbs: 60,
    },
    {
      id: "meal-user-b",
      userId: "user-b",
      eatenAt: new Date("2026-09-08T12:00:00.000Z"),
      totalCalories: 2_000,
      totalProtein: 100,
      totalFat: 80,
      totalCarbs: 200,
    },
  ];
  store.waterLogs = [
    {
      id: "water-user-a",
      userId: "user-a",
      drankAt: new Date("2026-09-08T08:00:00.000Z"),
      amountMl: 600,
    },
    {
      id: "water-user-b",
      userId: "user-b",
      drankAt: new Date("2026-09-08T08:00:00.000Z"),
      amountMl: 4_000,
    },
  ];
  store.healthMetrics = [
    {
      id: "weight-start-user-a",
      userId: "user-a",
      type: "WEIGHT",
      unit: "kg",
      measuredAt: new Date("2026-09-08T08:00:00.000Z"),
      value: 65,
      encValue: null,
    },
    {
      id: "weight-end-user-a",
      userId: "user-a",
      type: "WEIGHT",
      unit: "kg",
      measuredAt: new Date("2026-09-12T08:00:00.000Z"),
      value: 64.5,
      encValue: null,
    },
    {
      id: "weight-user-b",
      userId: "user-b",
      type: "WEIGHT",
      unit: "kg",
      measuredAt: new Date("2026-09-08T08:00:00.000Z"),
      value: 90,
      encValue: null,
    },
  ];
  store.weeklySummaries = [
    {
      id: "summary-user-a",
      userId: "user-a",
      weekStart,
      totalCalories: 500,
      totalProtein: 30,
      totalFat: 15,
      totalCarbs: 60,
      waterTotalMl: 600,
      aiSummary: "User A weekly recap",
      aiRecommendation: "User A recommendation",
      encAiSummary: null,
      encAiRecommendation: null,
    },
    {
      id: "summary-user-b",
      userId: "user-b",
      weekStart,
      totalCalories: 2_000,
      totalProtein: 100,
      totalFat: 80,
      totalCarbs: 200,
      waterTotalMl: 4_000,
      aiSummary: "User B private recap",
      aiRecommendation: "User B private recommendation",
      encAiSummary: null,
      encAiRecommendation: null,
    },
  ];

  const result = await services.getWeeklySummaryService(
    invocation("user-a", "get_weekly_summary", "weekly-read"),
    { date: "2026-09-09" },
  );

  assert.ok(result.summary);
  assert.equal(result.summary.weekStartDate, "2026-09-07");
  assert.equal(result.summary.weekEndDate, "2026-09-13");
  assert.equal(result.summary.totals.calories, 500);
  assert.equal(result.summary.waterTotalMl, 600);
  assert.equal(result.summary.weightStartKg, 65);
  assert.equal(result.summary.weightEndKg, 64.5);
  assert.equal(result.summary.weightChangeKg, -0.5);
  assert.equal(result.summary.aiSummary, "User A weekly recap");
  assert.equal(result.summary.aiRecommendation, "User A recommendation");
  assert.equal("userId" in result.summary, false);
  assert.equal(store.weeklySummaries.length, 2);
  assert.equal(store.auditEvents.at(-1)?.userId, "user-a");
  assert.equal(store.auditEvents.at(-1)?.resourceType, "WEEKLY_SUMMARY");
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
