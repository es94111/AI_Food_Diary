import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { after, before, test } from "node:test";

// Needs a real (disposable) PostgreSQL with this app's migrations applied. Opt in explicitly:
//   FOOD_TEST_DATABASE_URL=postgresql://user:pw@127.0.0.1:5432/food_diary_test
// The tests create and delete their own rows; the guard refuses anything that is not a local *_test database.
const databaseUrl = process.env.FOOD_TEST_DATABASE_URL ?? "";
let usable = false;
try {
  const parsed = new URL(databaseUrl);
  usable = ["postgres:", "postgresql:"].includes(parsed.protocol) && ["127.0.0.1", "localhost"].includes(parsed.hostname) && /_test$/u.test(parsed.pathname);
} catch { /* not configured */ }
const skip = usable ? false : "set FOOD_TEST_DATABASE_URL to a local *_test database";

const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const jpeg = (marker: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(32, marker)]);

async function setup() {
  process.env.DATABASE_URL = databaseUrl;
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  const { prisma } = await import("../../src/lib/db");
  const { encryptJson } = await import("../../src/lib/encryption");
  const exporter = await import("../../src/lib/admin-export");
  const packager = await import("../../src/lib/nouriledger-export");
  const suffix = randomBytes(4).toString("hex");
  const photos = new Map<string, { body: Buffer; contentType: string }>([
    ["meals/alice/lunch.jpg", { body: jpeg(1), contentType: "image/jpeg" }],
    ["foods/alice/chicken.png", { body: jpeg(2), contentType: "image/png" }],
    ["meals/alice/huge.jpg", { body: Buffer.alloc(packager.MAX_IMAGE_BYTES + 1, 3), contentType: "image/jpeg" }]
  ]);
  const dataUrlBytes = Buffer.from("legacy-inline-photo");
  const dataUrl = `data:image/png;base64,${dataUrlBytes.toString("base64")}`;
  const reader = async (key: string) => {
    if (key === "meals/alice/broken.jpg") throw new Error("S3 exploded");
    return photos.get(key) ?? null;
  };

  const alice = await prisma.user.create({ data: { email: `alice-${suffix}@export.test`, passwordHash: "x", name: "Alice", googleId: `google-alice-${suffix}`, isAdmin: true, tokenVersion: 5 } });
  const bob = await prisma.user.create({ data: { email: `bob-${suffix}@export.test`, passwordHash: "x", name: "Bob", googleId: `google-bob-${suffix}` } });
  const aliceKeys = ["meals/alice/lunch.jpg", "meals/alice/missing.jpg", "foods/alice/chicken.png", "meals/alice/huge.jpg", "meals/alice/broken.jpg", dataUrl];
  await prisma.userProfile.create({ data: { userId: alice.id, goal: "MAINTAIN", calorieTarget: 2100, waterGoalMl: 2500, timezone: "Asia/Taipei", aiProvider: "openai", encryptedAiApiKey: encryptJson("sk-alice-secret"), encryptedAllergies: encryptJson(["花生"]) } });
  await prisma.userProfile.create({ data: { userId: bob.id, calorieTarget: 1800, encryptedAiApiKey: encryptJson("sk-bob-secret") } });
  const aliceMeal = await prisma.meal.create({
    data: {
      userId: alice.id, mealType: "LUNCH", imageStorageKey: aliceKeys[0], imageStorageKeys: aliceKeys, totalCalories: "650.25", totalProtein: 25, totalFat: 20, totalCarbs: 80,
      items: { create: [{ name: "便當", estimatedAmount: "一份", calories: "650.25", protein: 25, fat: 20, carbs: 80 }, { name: "味噌湯", calories: 35, protein: 2, fat: 1, carbs: 3 }] }
    }
  });
  const bobMeal = await prisma.meal.create({ data: { userId: bob.id, mealType: "DINNER", totalCalories: 900, items: { create: [{ name: "Bob 的秘密晚餐", calories: 900 }] } } });
  await prisma.savedFood.create({ data: { userId: alice.id, name: "雞胸肉", calories: 165, protein: 31, fat: 3.6, carbs: 0, imageStorageKey: "foods/alice/chicken.png" } });
  await prisma.savedFood.create({ data: { userId: bob.id, name: "Bob 的食物", calories: 1 } });
  await prisma.waterLog.create({ data: { userId: alice.id, amountMl: 500 } });
  await prisma.waterLog.create({ data: { userId: bob.id, amountMl: 250 } });
  await prisma.dailySummary.create({ data: { userId: alice.id, summaryDate: new Date("2026-10-01T00:00:00Z"), totalCalories: 700, aiSummary: "Alice 的摘要" } });
  await prisma.healthMetric.create({ data: { userId: alice.id, source: "HEALTH_CONNECT", type: "WEIGHT", value: 61.5, unit: "kg", measuredAt: new Date("2026-10-02T00:00:00Z") } });
  await prisma.healthMetric.create({ data: { userId: bob.id, source: "HEALTH_CONNECT", type: "WEIGHT", value: 99, unit: "kg", measuredAt: new Date("2026-10-02T00:00:00Z") } });
  await prisma.appConfig.upsert({ where: { id: "singleton" }, update: {}, create: { id: "singleton", registrationOpen: true } });
  return { prisma, suffix, alice, bob, aliceMeal, bobMeal, aliceKeys, photos, dataUrlBytes, reader, exporter, packager };
}

let ctx!: Awaited<ReturnType<typeof setup>>;
before(async () => { if (usable) ctx = await setup(); });
after(async () => {
  if (!usable || !ctx) return;
  await ctx.prisma.user.deleteMany({ where: { id: { in: [ctx.alice.id, ctx.bob.id] } } });
  await ctx.prisma.$disconnect();
});

test("a scoped export contains only that account and none of its secrets", { skip }, async () => {
  const { alice, bob, bobMeal, aliceMeal, suffix, exporter } = ctx;
  const envelope = await exporter.buildExportEnvelope({ userId: alice.id, excludeSecrets: true });
  const text = JSON.stringify(envelope);
  assert.equal(envelope.format, "ai-food-diary-export");
  assert.equal(envelope.version, 1);
  assert.deepEqual(envelope.data.users.map((user) => user.id), [alice.id]);
  assert.ok(envelope.data.meals.every((meal) => meal.userId === alice.id));
  assert.deepEqual(envelope.data.meals.map((meal) => meal.id), [aliceMeal.id]);
  assert.equal(envelope.data.mealItems.length, 2, "only the items of this account's meals");
  assert.ok(envelope.data.mealItems.every((item) => item.mealId === aliceMeal.id));
  for (const rows of [envelope.data.waterLogs, envelope.data.savedFoods, envelope.data.healthMetrics, envelope.data.dailySummaries, envelope.data.userProfiles]) {
    assert.ok(rows.length > 0 && rows.every((row) => row.userId === alice.id));
  }
  assert.equal(envelope.data.userProfiles.length, 1);
  assert.deepEqual(envelope.data.appConfig, [], "the global settings row is never part of a personal export");
  for (const foreign of [bob.id, bobMeal.id, "Bob 的秘密晚餐", "Bob 的食物", `bob-${suffix}`, `google-bob-${suffix}`, "sk-bob-secret"]) assert.ok(!text.includes(foreign), `leaked: ${foreign}`);
  // Secrets of the account itself.
  assert.equal(envelope.data.userProfiles[0].aiApiKey, null);
  assert.ok(!text.includes("sk-alice-secret"));
  assert.equal(envelope.data.users[0].googleId, null);
  assert.equal(envelope.data.users[0].isAdmin, false, "admin status never travels");
  assert.equal(envelope.data.users[0].tokenVersion, 0);
  assert.ok(!text.includes(`google-alice-${suffix}`));
  // Non-secret content is intact and decrypted.
  assert.deepEqual(envelope.data.userProfiles[0].allergies, ["花生"]);
  assert.equal(envelope.data.meals[0].totalCalories, 650.25);
  assert.deepEqual(envelope.decryptionAnomalies, {});
  assert.equal(envelope.counts.meals, 1);
  assert.equal(envelope.counts.users, 1);
});

test("the administrator export is unchanged: every account, secrets included, global settings present", { skip }, async () => {
  const { alice, bob, suffix, exporter } = ctx;
  const envelope = await exporter.buildExportEnvelope();
  const ids = envelope.data.users.map((user) => user.id);
  assert.ok(ids.includes(alice.id) && ids.includes(bob.id));
  assert.equal(envelope.data.userProfiles.find((row) => row.userId === alice.id)?.aiApiKey, "sk-alice-secret");
  assert.equal(envelope.data.userProfiles.find((row) => row.userId === bob.id)?.aiApiKey, "sk-bob-secret");
  assert.equal(envelope.data.users.find((user) => user.id === alice.id)?.googleId, `google-alice-${suffix}`);
  assert.equal(envelope.data.users.find((user) => user.id === alice.id)?.isAdmin, true);
  assert.equal(envelope.data.users.find((user) => user.id === alice.id)?.tokenVersion, 5);
  assert.ok(envelope.data.appConfig.length >= 1);
  assert.ok(envelope.data.meals.some((meal) => meal.userId === bob.id));
  // A scope without excludeSecrets narrows the rows but keeps the account's own fields (it is not used by the hand-off).
  const scoped = await exporter.buildExportEnvelope({ userId: alice.id });
  assert.equal(scoped.data.userProfiles[0].aiApiKey, "sk-alice-secret");
  assert.deepEqual(scoped.data.users.map((user) => user.id), [alice.id]);
});

test("the package carries decrypted photos, drops unreadable ones from the JSON and reports them", { skip }, async () => {
  const { alice, reader, packager, photos, dataUrlBytes } = ctx;
  const result = await packager.buildNouriLedgerPackage(alice.id, reader);
  const envelope = JSON.parse(await (result.form.get("file") as File).text()) as Awaited<ReturnType<typeof ctx.exporter.buildExportEnvelope>>;
  const manifest = JSON.parse(String(result.form.get("attachmentsManifest"))) as Array<{ objectKey: string; fileField: string; filename: string; mimeType: string; sha256: string }>;
  const legacyKey = `legacy-data-url:${sha(dataUrlBytes)}`;

  assert.deepEqual(manifest.map((entry) => entry.objectKey).sort(), ["foods/alice/chicken.png", legacyKey, "meals/alice/lunch.jpg"].sort());
  assert.equal(result.imageCount, 3);
  assert.deepEqual(envelope.data.meals[0].imageStorageKeys, ["meals/alice/lunch.jpg", "foods/alice/chicken.png", legacyKey], "missing, failing and oversized photos are removed; order is kept");
  assert.equal(envelope.data.meals[0].imageStorageKey, "meals/alice/lunch.jpg", "the mirror of the first key holds");
  assert.equal(envelope.data.savedFoods[0].imageStorageKey, "foods/alice/chicken.png", "a photo shared by a meal and a saved food is shipped once");
  assert.ok(!JSON.stringify(envelope).includes("data:image"), "the inline data URL is not repeated as a key");
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0], /^2 張照片在舊站已無法讀取/u, "the missing object and the failing read");
  assert.match(result.warnings[1], /^1 張照片超過 20 MB/u);

  for (const entry of manifest) {
    const part = result.form.get(entry.fileField) as File;
    assert.ok(part instanceof File, entry.objectKey);
    const bytes = Buffer.from(await part.arrayBuffer());
    assert.equal(sha(bytes), entry.sha256);
    assert.deepEqual(bytes, entry.objectKey === legacyKey ? dataUrlBytes : photos.get(entry.objectKey)!.body);
  }
  assert.match(manifest.find((entry) => entry.objectKey === "foods/alice/chicken.png")!.filename, /\.png$/u);
});

test("the package satisfies the importer's contract (one owner, referential integrity, no dangling photo key)", { skip }, async () => {
  const { alice, reader, packager } = ctx;
  const result = await packager.buildNouriLedgerPackage(alice.id, reader);
  const payload = JSON.parse(await (result.form.get("file") as File).text()) as { format: string; version: number; counts: Record<string, number>; data: Record<string, Array<Record<string, unknown>>> };
  assert.equal(payload.format, "ai-food-diary-export");
  assert.equal(payload.version, 1);
  for (const key of ["users", "userProfiles", "meals", "mealItems", "waterLogs", "savedFoods", "dailySummaries", "dailyRecommendations", "healthMetrics", "appConfig"]) assert.ok(Array.isArray(payload.data[key]), key);
  for (const [key, declared] of Object.entries(payload.counts)) assert.equal(payload.data[key].length, declared, `declared count for ${key}`);
  assert.equal(payload.data.users.length, 1);
  const owner = String(payload.data.users[0].id);
  const mealIds = new Set<string>();
  for (const meal of payload.data.meals) { assert.equal(meal.userId, owner); mealIds.add(String(meal.id)); }
  for (const item of payload.data.mealItems) assert.ok(mealIds.has(String(item.mealId)));
  for (const key of ["userProfiles", "waterLogs", "savedFoods", "dailySummaries", "healthMetrics"]) for (const row of payload.data[key]) assert.equal(row.userId, owner, key);
  const manifest = JSON.parse(String(result.form.get("attachmentsManifest"))) as Array<{ objectKey: string; fileField: string; sha256: string }>;
  assert.equal(new Set(manifest.map((entry) => entry.objectKey)).size, manifest.length, "manifest keys are unique");
  assert.equal(new Set(manifest.map((entry) => entry.fileField)).size, manifest.length);
  assert.ok(manifest.every((entry) => /^file_[0-9]{1,5}$/u.test(entry.fileField)));
  const referenced = new Set<string>();
  for (const meal of payload.data.meals) for (const key of (meal.imageStorageKeys as string[]) ?? []) referenced.add(key);
  for (const food of payload.data.savedFoods) if (food.imageStorageKey) referenced.add(String(food.imageStorageKey));
  for (const key of referenced) assert.ok(manifest.some((entry) => entry.objectKey === key), `no manifest entry for ${key}`);
  const fileParts = [...result.form.keys()].filter((name) => name.startsWith("file_"));
  assert.equal(fileParts.length, manifest.length, "no orphan file parts");
});

test("an account without photos still exports cleanly, and an oversized total is refused", { skip }, async () => {
  const { bob, prisma, packager, suffix } = ctx;
  const result = await packager.buildNouriLedgerPackage(bob.id, async () => { throw new Error("must not be called"); });
  assert.equal(result.imageCount, 0);
  assert.deepEqual(result.warnings, []);
  assert.equal(String(result.form.get("attachmentsManifest")), "[]");

  const crowded = await prisma.user.create({ data: { email: `crowded-${suffix}@export.test`, passwordHash: "x" } });
  try {
    const keys = Array.from({ length: 14 }, (_, index) => `meals/crowded/${index}.jpg`);
    await prisma.meal.create({ data: { userId: crowded.id, mealType: "SNACK", imageStorageKey: keys[0], imageStorageKeys: keys, totalCalories: 1 } });
    const big = Buffer.alloc(packager.MAX_IMAGE_BYTES - 1024, 5);
    await assert.rejects(() => packager.buildNouriLedgerPackage(crowded.id, async () => ({ body: big, contentType: "image/jpeg" })), (error: unknown) => error instanceof packager.ExportTooLargeError);
  } finally {
    await prisma.user.delete({ where: { id: crowded.id } });
  }
});

test("photos are fetched a few at a time and still land in their original order", { skip }, async () => {
  const { prisma, packager, suffix } = ctx;
  const user = await prisma.user.create({ data: { email: `parallel-${suffix}@export.test`, passwordHash: "x" } });
  try {
    const keys = Array.from({ length: 10 }, (_, index) => `meals/parallel/${index}.jpg`);
    await prisma.meal.create({ data: { userId: user.id, mealType: "SNACK", imageStorageKey: keys[0], imageStorageKeys: keys, totalCalories: 1 } });
    let active = 0;
    let peak = 0;
    const reader = async (key: string) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 15));
      active -= 1;
      return { body: jpeg(Number(/(\d+)\.jpg$/u.exec(key)![1]) + 10), contentType: "image/jpeg" };
    };
    const result = await packager.buildNouriLedgerPackage(user.id, reader);
    assert.ok(peak > 1, "reads overlap");
    assert.ok(peak <= packager.READ_CONCURRENCY, "but only a bounded number at a time");
    const manifest = JSON.parse(String(result.form.get("attachmentsManifest"))) as Array<{ objectKey: string; fileField: string }>;
    assert.deepEqual(manifest.map((entry) => entry.objectKey), keys, "the manifest follows the meal's photo order");
    assert.deepEqual(manifest.map((entry) => entry.fileField), keys.map((_, index) => `file_${index}`));
    assert.equal(result.imageCount, 10);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});

test("the summary shown on the confirmation page counts only the account's own records", { skip }, async () => {
  const { alice, bob, suffix, aliceKeys, packager } = ctx;
  const summary = await packager.summarizeUser(alice.id);
  assert.deepEqual(summary, {
    sourceUserId: alice.id,
    account: { email: `alice-${suffix}@export.test`, name: "Alice" },
    counts: { meals: 1, meal_items: 2, saved_foods: 1, water_logs: 1, health_metrics: 1, daily_summaries: 1, images: new Set([...aliceKeys, "foods/alice/chicken.png"]).size }
  });
  assert.equal(await packager.summarizeUser("does-not-exist"), null);
  assert.equal((await packager.summarizeUser(bob.id))?.counts.meals, 1);
});
