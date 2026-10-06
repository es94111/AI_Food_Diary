import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, mock, test } from "node:test";

// Needs a real (disposable) PostgreSQL with this app's migrations applied, same
// opt-in as the other integration suites:
//   FOOD_TEST_DATABASE_URL=******127.0.0.1:5432/food_diary_test
const databaseUrl = process.env.FOOD_TEST_DATABASE_URL ?? "";
let usable = false;
try {
  const parsed = new URL(databaseUrl);
  usable = ["postgres:", "postgresql:"].includes(parsed.protocol) && ["127.0.0.1", "localhost"].includes(parsed.hostname) && /_test$/u.test(parsed.pathname);
} catch { /* not configured */ }
const skip = usable ? false : "set FOOD_TEST_DATABASE_URL to a local *_test database";

// The route is exercised end-to-end, so we mock only what a request cannot
// supply: the logged-in user and the AI call. Everything else — auth wiring,
// encryption, the WeeklySummary write and the response body — is the real code.
const USER_ID = "weekly-route-test-user";
const TZ = "Asia/Taipei";
let aiCalls = 0;

async function setup() {
  process.env.DATABASE_URL = databaseUrl;
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.AI_API_KEY = "test-env-key";
  delete process.env.REDIS_URL;

  const { prisma } = await import("../../src/lib/db");
  const { encryptJson } = await import("../../src/lib/encryption");

  await prisma.user.deleteMany({ where: { id: USER_ID } });
  const user = await prisma.user.create({
    data: {
      id: USER_ID,
      email: `weekly-route-${randomBytes(4).toString("hex")}@route.test`,
      passwordHash: "x",
      isAdmin: true,
      profile: { create: { timezone: TZ, aiProvider: "openai", encryptedAiApiKey: encryptJson("sk-test") } }
    },
    include: { profile: true }
  });

  // One meal in the week of Mon 2026-09-28 (Taipei), so the week is non-empty.
  await prisma.meal.create({
    data: {
      userId: USER_ID,
      mealType: "LUNCH",
      totalCalories: 600,
      totalProtein: 30,
      totalFat: 20,
      totalCarbs: 60,
      eatenAt: new Date("2026-09-28T04:00:00Z")
    }
  });

  mock.module("../../src/lib/auth", {
    exports: { requireUser: async () => user, requireAdmin: async () => user }
  });
  mock.module("../../src/lib/ai", {
    exports: {
      generateWeeklySummary: async () => {
        aiCalls += 1;
        return { summary: "本週週報摘要", recommendation: "下週建議" };
      }
    }
  });

  const route = await import("../../src/app/api/weekly-summary/route");
  const { decryptWeeklySummary } = await import("../../src/lib/b2-crypto");

  const get = (query: string) =>
    route.GET(new Request(`https://food.example.test/api/weekly-summary?${query}`));

  return { prisma, route, get, decryptWeeklySummary, userId: user.id };
}

let ctx!: Awaited<ReturnType<typeof setup>>;
before(async () => { if (usable) ctx = await setup(); });
after(async () => {
  if (!usable || !ctx) return;
  await ctx.prisma.user.deleteMany({ where: { id: ctx.userId } });
  await ctx.prisma.$disconnect();
});

test("generating a weekly recap returns decrypted text, not the raw ciphertext row", { skip }, async () => {
  const { get } = ctx;
  // Past week (contains 2026-09-28) → generation allowed.
  const generated = await get("date=2026-10-02&tz=Asia%2FTaipei&generate=1");
  assert.equal(generated.status, 200);
  const body = (await generated.json()) as { summary: Record<string, unknown> | null };
  assert.ok(body.summary, "a summary should have been produced");
  assert.equal(aiCalls, 1, "the AI was invoked exactly once");

  // The regression: the generate path used to return the raw row, where the AI
  // text sits in enc* and aiSummary/aiRecommendation are null.
  assert.equal(body.summary.aiSummary, "本週週報摘要");
  assert.equal(body.summary.aiRecommendation, "下週建議");
  assert.equal(body.summary.waterTotalMl, 0);
  for (const leaked of ["encAiSummary", "encAiRecommendation"]) {
    assert.ok(!(leaked in body.summary), `response must not expose ${leaked}`);
  }
});

test("the stored recap is served from storage without spending AI, and matches the generated one", { skip }, async () => {
  const { get, prisma } = ctx;
  const before = aiCalls;
  const peeked = await get("date=2026-09-28&tz=Asia%2FTaipei");
  assert.equal(peeked.status, 200);
  const body = (await peeked.json()) as { summary: Record<string, unknown> | null };
  assert.ok(body.summary);
  assert.equal(body.summary.aiSummary, "本週週報摘要");
  assert.equal(aiCalls, before, "peek must not spend AI quota");

  // Any day inside the same week resolves to the same stored row.
  const otherDay = await get("date=2026-09-30&tz=Asia%2FTaipei");
  const other = (await otherDay.json()) as { summary: Record<string, unknown> | null };
  assert.equal(other.summary?.id, body.summary.id);

  // And the row really is stored encrypted (so the decrypt boundary is load-bearing).
  const rows = await prisma.weeklySummary.findMany({ where: { userId: ctx.userId } });
  assert.equal(rows.length, 1, "no duplicate row was created");
  assert.equal(rows[0].aiSummary, null, "plaintext column stays null");
  assert.ok(rows[0].encAiSummary, "AI text lives in the encrypted column");
});

test("the in-progress week is refused, and an empty week yields no summary", { skip }, async () => {
  const { get } = ctx;
  // 2026-10-06 is inside the current week relative to the test's "today"? Use a
  // fixed far-future week to make the guard deterministic regardless of run date.
  const future = await get("date=2999-06-04&tz=Asia%2FTaipei&generate=1");
  assert.equal(future.status, 400);
  assert.match(((await future.json()) as { error: string }).error, /尚未結束/);

  // A past week with no meals: skipped (no AI spend, null summary).
  const before = aiCalls;
  const empty = await get("date=2026-08-05&tz=Asia%2FTaipei&generate=1");
  assert.equal(empty.status, 200);
  assert.equal(((await empty.json()) as { summary: unknown }).summary, null);
  assert.equal(aiCalls, before, "an empty week must not spend AI quota");
});
