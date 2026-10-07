import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { before, mock, test } from "node:test";

const STAMP = "2026-10-07T06:00:00.000Z";
const OWN_IMAGE_KEY = "meals/alice/lunch.jpg";
const FOREIGN_IMAGE_KEY = "meals/bob/private.jpg";
const MISSING_IMAGE_KEY = "meals/alice/missing.jpg";
const LEGACY_IMAGE = `data:image/png;base64,${Buffer.from("legacy photo").toString("base64")}`;
let currentUser: { id: string } | null = null;
let authCalls = 0;
let scopes: Array<{ userId: string; excludeSecrets?: boolean }> = [];
let readKeys: string[] = [];
let route: typeof import("../../src/app/api/me/data/export/route");
let packageBuilder: typeof import("../../src/lib/nouriledger-export");
let exportEnvelopeSchema: typeof import("../../src/lib/admin-export").exportEnvelopeSchema;

function makeEnvelope(userId: string) {
  const timestamp = STAMP;
  const data = {
    users: [{ id: userId, email: `${userId}@example.test`, name: "Alice", googleId: null, isAdmin: false, tokenVersion: 0, createdAt: timestamp, updatedAt: timestamp }],
    userProfiles: [{
      id: `profile-${userId}`, userId, gender: null, birthDate: null, heightCm: null, weightKg: null,
      activityLevel: null, goal: null, calorieTarget: null, waterGoalMl: null, timezone: "Asia/Taipei",
      preferences: null, allergies: ["花生"], aiProvider: "openai", aiBaseUrl: null, aiVisionModel: null,
      aiTextModel: null, aiApiKey: null, createdAt: timestamp, updatedAt: timestamp
    }],
    meals: [{
      id: `meal-${userId}`, userId, mealType: "LUNCH", imageStorageKey: OWN_IMAGE_KEY,
      imageStorageKeys: [OWN_IMAGE_KEY, FOREIGN_IMAGE_KEY, MISSING_IMAGE_KEY, LEGACY_IMAGE],
      totalCalories: 650, totalProtein: 25, totalFat: 20, totalCarbs: 80,
      aiConfidence: null, aiNotes: null, eatenAt: timestamp, createdAt: timestamp, updatedAt: timestamp
    }],
    mealItems: [],
    waterLogs: [],
    savedFoods: [{
      id: `food-${userId}`, userId, barcode: null, imageStorageKey: OWN_IMAGE_KEY, name: "雞胸肉",
      estimatedAmount: null, brand: null, calories: 165, protein: 31, fat: 3.6, carbs: 0,
      source: "MANUAL", isFavorite: false, useCount: 0, createdAt: timestamp, updatedAt: timestamp
    }],
    mealBundles: [{ id: `bundle-${userId}`, userId, name: "午餐組合", imageStorageKey: OWN_IMAGE_KEY, createdAt: timestamp, updatedAt: timestamp }],
    mealBundleItems: [],
    dailySummaries: [],
    weeklySummaries: [],
    dailyRecommendations: [],
    healthMetrics: [],
    appConfig: []
  };
  return {
    format: "ai-food-diary-export",
    version: 1,
    exportedAt: timestamp,
    keyId: "test-key",
    counts: Object.fromEntries(Object.entries(data).map(([key, rows]) => [key, rows.length])),
    decryptionAnomalies: {},
    data
  };
}

async function setup() {
  process.env.AUTH_SECRET = "route-test-secret-that-is-longer-than-thirty-two-bytes";
  delete process.env.REDIS_URL;
  const actualAdmin = await import("../../src/lib/admin-export");
  const actualStorage = await import("../../src/lib/storage");
  const { unauthorized } = await import("../../src/lib/http");
  exportEnvelopeSchema = actualAdmin.exportEnvelopeSchema;

  mock.module("../../src/lib/auth", {
    exports: {
      requireUser: async () => {
        authCalls += 1;
        if (!currentUser) throw unauthorized();
        return currentUser;
      }
    }
  });
  mock.module("../../src/lib/admin-export", {
    exports: {
      ...actualAdmin,
      buildExportEnvelope: async (scope: { userId: string; excludeSecrets?: boolean }) => {
        scopes.push(scope);
        return makeEnvelope(scope.userId);
      }
    }
  });
  mock.module("../../src/lib/storage", {
    exports: {
      ...actualStorage,
      getDecryptedImage: async (key: string) => {
        readKeys.push(key);
        if (key === OWN_IMAGE_KEY) return { body: Buffer.from("own photo bytes"), contentType: "image/jpeg" };
        return null;
      }
    }
  });

  route = await import("../../src/app/api/me/data/export/route");
  packageBuilder = await import("../../src/lib/nouriledger-export");
}

before(setup);

function request(headers?: HeadersInit): Request {
  return new Request("https://food.example.test/api/me/data/export", {
    headers: { "sec-fetch-site": "same-origin", ...Object.fromEntries(new Headers(headers).entries()) }
  });
}

function clearCalls() {
  authCalls = 0;
  scopes = [];
  readKeys = [];
}

test("download returns an importer-compatible personal envelope with only owned photos and no secrets", async () => {
  clearCalls();
  currentUser = { id: "alice" };
  const response = await route.GET(request());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, no-transform");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.match(response.headers.get("content-disposition") ?? "", /attachment; filename="ai-food-diary-my-data-2026-10-07\.json"/u);
  assert.match(response.headers.get("content-type") ?? "", /^application\/json; charset=utf-8/u);
  assert.deepEqual(scopes, [{ userId: "alice", excludeSecrets: true }]);

  const json = await response.text();
  const payload = JSON.parse(json) as ReturnType<typeof makeEnvelope>;
  const parsed = exportEnvelopeSchema.parse(payload);
  assert.deepEqual(Object.keys(payload).sort(), ["format", "version", "exportedAt", "keyId", "counts", "decryptionAnomalies", "data"].sort());
  assert.deepEqual(Object.keys(payload.data).sort(), [
    "users", "userProfiles", "meals", "mealItems", "waterLogs", "savedFoods", "mealBundles",
    "mealBundleItems", "dailySummaries", "weeklySummaries", "dailyRecommendations", "healthMetrics", "appConfig"
  ].sort());
  assert.deepEqual(parsed.data.users.map((user) => user.id), ["alice"]);
  assert.equal(parsed.data.users[0].googleId, null);
  assert.equal(parsed.data.users[0].isAdmin, false);
  assert.equal(parsed.data.users[0].tokenVersion, 0);
  assert.equal(parsed.data.userProfiles[0].aiApiKey, null);
  assert.ok(!json.includes(FOREIGN_IMAGE_KEY));
  assert.ok(!json.includes(MISSING_IMAGE_KEY));
  assert.ok(!json.includes("passwordHash"));
  assert.ok(!json.includes("accessToken"));
  assert.ok(!json.includes("refreshToken"));

  const meal = parsed.data.meals[0];
  const photo = `data:image/jpeg;base64,${Buffer.from("own photo bytes").toString("base64")}`;
  const legacyPhoto = `data:image/png;base64,${Buffer.from("legacy photo").toString("base64")}`;
  assert.deepEqual(meal.imageStorageKeys, [photo, legacyPhoto]);
  assert.equal(meal.imageStorageKey, photo);
  assert.equal(parsed.data.savedFoods[0].imageStorageKey, photo);
  assert.equal(parsed.data.mealBundles[0].imageStorageKey, photo);
  assert.ok(!readKeys.includes(FOREIGN_IMAGE_KEY), "foreign object keys are rejected before storage reads");
  assert.ok(response.headers.get("x-data-export-warnings"));
  const warnings = JSON.parse(Buffer.from(response.headers.get("x-data-export-warnings")!, "base64url").toString("utf8")) as string[];
  assert.match(warnings[0], /^1 張照片不屬於此帳號/u);
  assert.match(warnings[1], /^1 張照片在舊站已無法讀取/u);
});

test("the shared photo helper preserves NouriLedger's attachment manifest and warning behavior", async () => {
  const storageReads: string[] = [];
  const built = await packageBuilder.buildNouriLedgerPackage("alice", async (key) => {
    storageReads.push(key);
    if (key === OWN_IMAGE_KEY) return { body: Buffer.from("own photo bytes"), contentType: "image/jpeg" };
    return null;
  });
  const envelope = JSON.parse(await (built.form.get("file") as File).text()) as ReturnType<typeof makeEnvelope>;
  const manifest = JSON.parse(String(built.form.get("attachmentsManifest"))) as Array<{ objectKey: string; fileField: string; sha256: string }>;
  const legacyKey = `legacy-data-url:${createHash("sha256").update(Buffer.from("legacy photo")).digest("hex")}`;

  assert.equal(built.imageCount, 2);
  assert.deepEqual(manifest.map((entry) => entry.objectKey).sort(), [OWN_IMAGE_KEY, legacyKey].sort());
  assert.deepEqual(envelope.data.meals[0].imageStorageKeys, [OWN_IMAGE_KEY, legacyKey]);
  assert.equal(envelope.data.meals[0].imageStorageKey, OWN_IMAGE_KEY);
  assert.match(built.warnings[0], /^1 張照片不屬於此帳號/u);
  assert.match(built.warnings[1], /^1 張照片在舊站已無法讀取/u);
  assert.ok(!storageReads.includes(FOREIGN_IMAGE_KEY), "foreign image keys are never read");
  for (const entry of manifest) {
    const file = built.form.get(entry.fileField) as File;
    assert.equal(createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex"), entry.sha256);
  }
});

test("unauthenticated and cross-site navigation requests cannot start an export", async () => {
  clearCalls();
  currentUser = null;
  const unauthenticated = await route.GET(request());
  assert.equal(unauthenticated.status, 401);
  assert.equal(unauthenticated.headers.get("cache-control"), "no-store, no-transform");
  assert.deepEqual(scopes, []);

  clearCalls();
  currentUser = { id: "alice" };
  const crossSite = await route.GET(request({ "sec-fetch-site": "cross-site" }));
  assert.equal(crossSite.status, 403);
  assert.equal(crossSite.headers.get("cache-control"), "no-store, no-transform");
  assert.equal(authCalls, 0, "cross-site navigation is rejected before authentication or export work");
  assert.deepEqual(scopes, []);
});

test("exports are rate limited per authenticated user", async () => {
  clearCalls();
  const userId = `export-limit-${randomBytes(6).toString("hex")}`;
  currentUser = { id: userId };
  for (let index = 0; index < 3; index += 1) assert.equal((await route.GET(request())).status, 200);
  const limited = await route.GET(request());
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("cache-control"), "no-store, no-transform");
  assert.ok(limited.headers.get("retry-after"));
  assert.equal(scopes.length, 3, "rate-limited attempts do not build another export");

  currentUser = { id: `${userId}-other` };
  assert.equal((await route.GET(request()).then((response) => response.status)), 200, "another user has an independent budget");
});
