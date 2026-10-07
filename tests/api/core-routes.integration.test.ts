import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, mock, test } from "node:test";
import { isDisposableTestDatabaseUrl } from "../helpers/disposable-test-database";

const databaseUrl = process.env.FOOD_TEST_DATABASE_URL;
const usable = isDisposableTestDatabaseUrl(databaseUrl);
const skip = usable ? false : "set FOOD_TEST_DATABASE_URL to a local *_test database";
const TZ = "Asia/Taipei";

type TestUser = { id: string; profile: { timezone: string | null } | null };
let activeUser: TestUser | null = null;
let uploadCount = 0;

mock.module("../../src/lib/auth", {
  exports: {
    requireUser: async () => {
      if (!activeUser) throw new Error("Unauthorized");
      return activeUser;
    }
  }
});
mock.module("../../src/lib/storage", {
  exports: {
    uploadImage: async (_dataUrl: string, userId: string) => `meals/${userId}/integration-${++uploadCount}.jpg`,
    getDecryptedImage: async () => null,
    isStorageKey: (key: string) => key.startsWith("meals/")
  }
});
mock.module("../../src/lib/image-refs", {
  exports: { deleteImageIfUnreferenced: async () => undefined }
});

function request(path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`https://food.example.test${path}`, {
    method,
    headers: body === undefined ? headers : { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function localDate(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function setup() {
  if (!usable || !databaseUrl) throw new Error("Unsafe integration test database URL");
  process.env.DATABASE_URL = databaseUrl;
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.AUTH_SECRET = "core-api-integration-test-secret-0123456789";
  delete process.env.REDIS_URL;

  const { prisma } = await import("../../src/lib/db");
  const suffix = randomBytes(6).toString("hex");
  const createdUserIds: string[] = [];
  try {
    async function makeUser(label: string) {
      const user = await prisma.user.create({
        data: {
          email: `${label}-${suffix}@api-test.invalid`,
          passwordHash: "test-only",
          profile: { create: { timezone: TZ } }
        },
        include: { profile: true }
      });
      createdUserIds.push(user.id);
      return user;
    }

    const owner = await makeUser("owner");
    const otherUser = await makeUser("other");
    activeUser = owner;

    const meals = await import("../../src/app/api/meals/route");
    const mealById = await import("../../src/app/api/meals/[id]/route");
    const mealImages = await import("../../src/app/api/meals/[id]/image/route");
    const water = await import("../../src/app/api/water/route");
    const waterById = await import("../../src/app/api/water/[id]/route");
    const savedFoods = await import("../../src/app/api/saved-foods/route");
    const savedFoodBatch = await import("../../src/app/api/saved-foods/batch/route");
    const healthConnections = await import("../../src/app/api/health/connections/route");
    const healthConnectionById = await import("../../src/app/api/health/connections/[id]/route");
    const healthSync = await import("../../src/app/api/health/sync/route");
    const healthAuth = await import("../../src/lib/health-auth");

    return {
      prisma,
      owner,
      otherUser,
      createdUserIds,
      meals,
      mealById,
      mealImages,
      water,
      waterById,
      savedFoods,
      savedFoodBatch,
      healthConnections,
      healthConnectionById,
      healthSync,
      healthAuth
    };
  } catch (error) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
    throw error;
  }
}

let ctx!: Awaited<ReturnType<typeof setup>>;
before(async () => { if (usable) ctx = await setup(); });
after(async () => {
  if (!usable || !ctx) return;
  await ctx.prisma.user.deleteMany({ where: { id: { in: ctx.createdUserIds } } });
  activeUser = null;
  await ctx.prisma.$disconnect();
});

test("meals can be created, listed, updated, photographed, owner-scoped, and deleted", { skip }, async () => {
  const { meals, mealById, mealImages, owner, otherUser, prisma } = ctx;
  const now = new Date();
  const date = localDate(now, TZ);
  const created = await meals.POST(request("/api/meals", "POST", {
    mealType: "LUNCH",
    eatenAt: now.toISOString(),
    manualItems: [{ name: "雞胸肉", estimatedAmount: "100g", calories: 180, protein: 32, fat: 4, carbs: 0 }]
  }));
  assert.equal(created.status, 200);
  const createdBody = await created.json() as { meal: { id: string; userId: string; items: Array<{ name: string; calories: number }> } };
  const mealId = createdBody.meal.id;
  assert.equal(createdBody.meal.userId, owner.id);
  assert.equal(createdBody.meal.items[0].name, "雞胸肉");
  assert.equal(Number(createdBody.meal.items[0].calories), 180);

  const listed = await meals.GET(request(`/api/meals?date=${date}&tz=${encodeURIComponent(TZ)}`));
  assert.equal(listed.status, 200);
  const listedBody = await listed.json() as { meals: Array<{ id: string }> };
  assert.ok(listedBody.meals.some((meal) => meal.id === mealId));

  const updated = await mealById.PATCH(request(`/api/meals/${mealId}`, "PATCH", {
    mealType: "DINNER",
    items: [{ name: "鮭魚", estimatedAmount: "150g", calories: 220, protein: 34, fat: 8, carbs: 0 }]
  }), params(mealId));
  assert.equal(updated.status, 200);
  const updatedBody = await updated.json() as { meal: { mealType: string; totalCalories: number; items: Array<{ name: string }> } };
  assert.equal(updatedBody.meal.mealType, "DINNER");
  assert.equal(Number(updatedBody.meal.totalCalories), 220);
  assert.equal(updatedBody.meal.items[0].name, "鮭魚");

  const appended = await mealImages.POST(request(`/api/meals/${mealId}/image`, "POST", {
    imageDataUrls: ["data:image/jpeg;base64,dGVzdA=="]
  }), params(mealId));
  assert.equal(appended.status, 200);
  assert.deepEqual(await appended.json(), { imageCount: 1, skipped: 0 });
  const stored = await prisma.meal.findUnique({ where: { id: mealId } });
  assert.deepEqual(stored?.imageStorageKeys, [`meals/${owner.id}/integration-1.jpg`]);
  assert.equal(stored?.imageStorageKey, stored?.imageStorageKeys[0]);

  activeUser = otherUser;
  const foreignRead = await mealById.GET(request(`/api/meals/${mealId}`), params(mealId));
  assert.equal(foreignRead.status, 404);

  activeUser = owner;
  const deleted = await mealById.DELETE(request(`/api/meals/${mealId}`, "DELETE"), params(mealId));
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), { ok: true });
  assert.equal(await prisma.meal.findUnique({ where: { id: mealId } }), null);
});

test("water logs support create, per-day totals, and deletion", { skip }, async () => {
  const { water, waterById } = ctx;
  const now = new Date();
  const date = localDate(now, TZ);
  const first = await water.POST(request("/api/water", "POST", { amountMl: 500, drankAt: now.toISOString() }));
  const second = await water.POST(request("/api/water", "POST", { amountMl: 300, drankAt: new Date(now.getTime() + 1000).toISOString() }));
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  const firstBody = await first.json() as { log: { id: string } };
  const listed = await water.GET(request(`/api/water?date=${date}&tz=${encodeURIComponent(TZ)}`));
  assert.equal(listed.status, 200);
  const listedBody = await listed.json() as { logs: Array<{ id: string }>; totalMl: number };
  assert.equal(listedBody.totalMl, 800);
  assert.equal(listedBody.logs.length, 2);

  const deleted = await waterById.DELETE(request(`/api/water/${firstBody.log.id}`, "DELETE"), params(firstBody.log.id));
  assert.equal(deleted.status, 200);
  const afterDelete = await water.GET(request(`/api/water?date=${date}&tz=${encodeURIComponent(TZ)}`));
  assert.equal((await afterDelete.json() as { totalMl: number }).totalMl, 300);
});

test("saved foods enforce unique barcodes, return similar-food conflicts, and cap batch archives", { skip }, async () => {
  const { savedFoods, savedFoodBatch, owner, prisma } = ctx;
  const create = (body: Record<string, unknown>) => savedFoods.POST(request("/api/saved-foods", "POST", body));
  const base = { estimatedAmount: "100g", calories: 80, protein: 8, fat: 4, carbs: 3 };

  const barcodeCreated = await create({ ...base, name: "杏仁飲", barcode: "12-3456" });
  assert.equal(barcodeCreated.status, 200);
  const barcodeFood = await barcodeCreated.json() as { food: { id: string } };
  const barcodeDuplicate = await create({ ...base, name: "另一款杏仁飲", barcode: "123456", allowDuplicate: true });
  assert.equal(barcodeDuplicate.status, 409);
  const barcodeConflict = await barcodeDuplicate.json() as { code: string; exactBarcode: { reason: string } };
  assert.equal(barcodeConflict.code, "DUPLICATE_FOOD");
  assert.equal(barcodeConflict.exactBarcode.reason, "barcode");

  const similarCreated = await create({ ...base, name: "無糖豆漿" });
  assert.equal(similarCreated.status, 200);
  const similarDuplicate = await create({ ...base, name: "無糖豆漿" });
  assert.equal(similarDuplicate.status, 409);
  const similarConflict = await similarDuplicate.json() as { code: string; duplicates: Array<{ reason: string }> };
  assert.equal(similarConflict.code, "DUPLICATE_FOOD");
  assert.equal(similarConflict.duplicates[0].reason, "name");

  const firstBatchFood = await create({ ...base, name: "批次食物一", calories: 350, protein: 20, fat: 8, carbs: 55 });
  const secondBatchFood = await create({ ...base, name: "批次食物二", calories: 450, protein: 25, fat: 12, carbs: 65 });
  const firstBatch = await firstBatchFood.json() as { food: { id: string } };
  const secondBatch = await secondBatchFood.json() as { food: { id: string } };
  const before = await prisma.savedFood.count({ where: { userId: owner.id, archivedAt: null } });
  const overLimit = await savedFoodBatch.PATCH(request("/api/saved-foods/batch", "PATCH", {
    ids: Array.from({ length: 101 }, (_, index) => `missing-${index}`)
  }));
  assert.equal(overLimit.status, 400);
  assert.equal(await prisma.savedFood.count({ where: { userId: owner.id, archivedAt: null } }), before);

  const archived = await savedFoodBatch.PATCH(request("/api/saved-foods/batch", "PATCH", {
    ids: [firstBatch.food.id, secondBatch.food.id]
  }));
  assert.equal(archived.status, 200);
  assert.deepEqual(await archived.json(), { archivedCount: 2 });
  assert.equal(await prisma.savedFood.count({
    where: { id: { in: [firstBatch.food.id, secondBatch.food.id] }, archivedAt: { not: null } }
  }), 2);
  assert.ok(barcodeFood.food.id);
});

test("health tokens are hashed, sync batches upsert idempotently, limits reject, and revocation blocks access", { skip }, async () => {
  const { healthConnections, healthConnectionById, healthSync, healthAuth, owner, prisma } = ctx;
  const created = await healthConnections.POST(request("/api/health/connections", "POST", { deviceName: "CI test device" }));
  assert.equal(created.status, 200);
  const connectionBody = await created.json() as { connection: { id: string }; token: string };
  assert.match(connectionBody.token, /^hcs_[\w-]+$/u);
  const storedConnection = await prisma.healthConnection.findUnique({ where: { id: connectionBody.connection.id } });
  assert.equal(storedConnection?.tokenHash, healthAuth.hashHealthSyncToken(connectionBody.token));
  assert.notEqual(storedConnection?.tokenHash, connectionBody.token);

  const measuredAt = new Date(Date.now() - 60_000).toISOString();
  const metric = { type: "WEIGHT", value: 62.4, unit: "kg", measuredAt };
  const tokenHeaders = { authorization: `Bearer ${connectionBody.token}` };
  const firstSync = await healthSync.POST(request("/api/health/sync", "POST", { metrics: [metric] }, tokenHeaders));
  const secondSync = await healthSync.POST(request("/api/health/sync", "POST", {
    metrics: [{ ...metric, value: 63.2 }]
  }, tokenHeaders));
  assert.equal(firstSync.status, 200);
  assert.equal(secondSync.status, 200);
  assert.deepEqual(await secondSync.json(), { synced: 1 });

  const persisted = await prisma.healthMetric.findMany({ where: { userId: owner.id, source: "HEALTH_CONNECT", type: "WEIGHT" } });
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].value, null);
  assert.ok(persisted[0].encValue);
  const healthRead = await healthSync.GET(request("/api/health/sync", "GET", undefined, tokenHeaders));
  const healthBody = await healthRead.json() as { latestByType: Record<string, { value: number; encValue?: unknown }> };
  assert.equal(healthBody.latestByType.WEIGHT.value, 63.2);
  assert.ok(!("encValue" in healthBody.latestByType.WEIGHT));

  const tooManyMetrics = await healthSync.POST(request("/api/health/sync", "POST", {
    metrics: Array.from({ length: 501 }, (_, index) => ({ ...metric, measuredAt: new Date(Date.parse(measuredAt) + index).toISOString() }))
  }, tokenHeaders));
  assert.equal(tooManyMetrics.status, 400);
  const excessiveValue = await healthSync.POST(request("/api/health/sync", "POST", {
    metrics: [{ ...metric, value: 1_000_000_000_001 }]
  }, tokenHeaders));
  assert.equal(excessiveValue.status, 400);
  assert.equal(await prisma.healthMetric.count({ where: { userId: owner.id } }), 1);

  const revoked = await healthConnectionById.DELETE(request(`/api/health/connections/${connectionBody.connection.id}`, "DELETE"), params(connectionBody.connection.id));
  assert.equal(revoked.status, 200);
  const revokedRow = await prisma.healthConnection.findUnique({ where: { id: connectionBody.connection.id } });
  assert.ok(revokedRow?.revokedAt);
  activeUser = null;
  const rejectedSync = await healthSync.POST(request("/api/health/sync", "POST", { metrics: [metric] }, tokenHeaders));
  assert.equal(rejectedSync.status, 401);
});
