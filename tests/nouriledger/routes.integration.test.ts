import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { after, before, test } from "node:test";

// Same opt-in as export.integration.test.ts: a disposable local *_test PostgreSQL with this app's migrations.
const databaseUrl = process.env.FOOD_TEST_DATABASE_URL ?? "";
let usable = false;
try {
  const parsed = new URL(databaseUrl);
  usable = ["postgres:", "postgresql:"].includes(parsed.protocol) && ["127.0.0.1", "localhost"].includes(parsed.hostname) && /_test$/u.test(parsed.pathname);
} catch { /* not configured */ }
const skip = usable ? false : "set FOOD_TEST_DATABASE_URL to a local *_test database";

const ORIGIN = "https://nouriledger.example.test";
const CALLBACK = `${ORIGIN}/migrate/callback`;
const challengeOf = (value: string) => createHash("sha256").update(value).digest("base64url");

async function setup() {
  process.env.DATABASE_URL = databaseUrl;
  process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.AUTH_SECRET = "route-test-secret-value-0123456789";
  process.env.NOURILEDGER_ORIGIN = ORIGIN;
  delete process.env.REDIS_URL;
  const { prisma } = await import("../../src/lib/db");
  const handoff = await import("../../src/lib/nouriledger-handoff");
  const userinfo = await import("../../src/app/api/migration/nouriledger/userinfo/route");
  const exportRoute = await import("../../src/app/api/migration/nouriledger/export/route");
  const suffix = randomBytes(4).toString("hex");
  const created: string[] = [];
  async function makeUser(name: string, extra: { isDisabled?: boolean; tokenVersion?: number } = {}) {
    const user = await prisma.user.create({ data: { email: `${name}-${suffix}@route.test`, passwordHash: "x", name, ...extra } });
    created.push(user.id);
    return user;
  }
  /** What the browser-facing step would hand NouriLedger: a code bound to a PKCE challenge, plus the verifier NouriLedger keeps. */
  function grantFor(user: { id: string; tokenVersion: number }, overrides: { audience?: string } = {}) {
    const verifier = randomBytes(32).toString("base64url");
    const code = handoff.issueAuthorizationCode({ userId: user.id, tokenVersion: user.tokenVersion, codeChallenge: challengeOf(verifier), audience: overrides.audience ?? ORIGIN });
    return { code, code_verifier: verifier, redirect_uri: CALLBACK };
  }
  const post = (route: { POST: (request: Request) => Promise<Response> }, body: unknown) => route.POST(new Request("https://food.example.test/api/migration/nouriledger/x", {
    method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body)
  }));
  return { prisma, handoff, userinfo, exportRoute, makeUser, grantFor, post, created };
}

let ctx!: Awaited<ReturnType<typeof setup>>;
before(async () => { if (usable) ctx = await setup(); });
after(async () => {
  if (!usable || !ctx) return;
  await ctx.prisma.user.deleteMany({ where: { id: { in: ctx.created } } });
  await ctx.prisma.$disconnect();
});

test("userinfo identifies the account without spending the code; export spends it exactly once", { skip }, async () => {
  const { makeUser, grantFor, post, userinfo, exportRoute, prisma } = ctx;
  const user = await makeUser("grace");
  await prisma.meal.create({ data: { userId: user.id, mealType: "LUNCH", totalCalories: 500, items: { create: [{ name: "沙拉", calories: 500 }] } } });
  const grant = grantFor(user);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await post(userinfo, grant);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.equal(body.sourceUserId, user.id);
    assert.equal(body.account.name, "grace");
    assert.equal(body.counts.meals, 1);
  }

  const exported = await post(exportRoute, grant);
  assert.equal(exported.status, 200);
  assert.equal(exported.headers.get("cache-control"), "no-store");
  assert.match(exported.headers.get("content-type") ?? "", /^multipart\/form-data; boundary=/u);
  assert.equal(exported.headers.get("x-nouriledger-export-warnings"), null);
  const form = await exported.formData();
  const payload = JSON.parse(await (form.get("file") as File).text());
  assert.deepEqual(payload.data.users.map((row: { id: string }) => row.id), [user.id]);
  assert.equal(payload.data.meals.length, 1);
  assert.equal(form.get("attachmentsManifest"), "[]");

  assert.equal((await post(exportRoute, grant)).status, 400, "a code cannot be redeemed twice");
  assert.equal((await post(userinfo, grant)).status, 400, "and is dead for userinfo as well");
  assert.deepEqual(await (await post(exportRoute, grant)).json(), { error: "invalid_grant" });
});

test("requests that are not proven genuine are refused before anything is read", { skip }, async () => {
  const { makeUser, grantFor, post, userinfo, exportRoute } = ctx;
  const user = await makeUser("heidi");
  const grant = grantFor(user);
  for (const route of [userinfo, exportRoute]) {
    assert.deepEqual(await (await post(route, { ...grant, code_verifier: randomBytes(32).toString("base64url") })).json(), { error: "invalid_grant" }, "wrong PKCE verifier");
    assert.deepEqual(await (await post(route, { ...grant, redirect_uri: "https://evil.example.test/migrate/callback" })).json(), { error: "invalid_grant" }, "wrong redirect_uri");
    assert.deepEqual(await (await post(route, { ...grantFor(user, { audience: "https://other.example.test" }) })).json(), { error: "invalid_grant" }, "code issued for another audience");
    assert.deepEqual(await (await post(route, { ...grant, code: `${grant.code.slice(0, -2)}xx` })).json(), { error: "invalid_grant" }, "tampered code");
    assert.deepEqual(await (await post(route, { code: grant.code })).json(), { error: "invalid_request" }, "missing fields");
    assert.deepEqual(await (await post(route, "not json")).json(), { error: "invalid_request" }, "malformed body");
    assert.deepEqual(await (await post(route, { ...grant, extra: true })).json(), { error: "invalid_request" }, "unknown fields");
  }
  assert.equal((await post(userinfo, grant)).status, 200, "none of the failed attempts burned the genuine code");
});

test("oversized request bodies are refused without being parsed, and the genuine code survives", { skip }, async () => {
  const { makeUser, grantFor, post, userinfo, exportRoute } = ctx;
  const user = await makeUser("nora");
  const grant = grantFor(user);
  for (const route of [userinfo, exportRoute]) {
    assert.deepEqual(await (await post(route, { ...grant, padding: "x".repeat(32 * 1024) })).json(), { error: "invalid_request" }, "streamed body beyond the cap");
    const declared = await route.POST(new Request("https://food.example.test/api/migration/nouriledger/x", {
      method: "POST", headers: { "content-type": "application/json", "content-length": String(1_000_000) }, body: JSON.stringify(grant)
    }));
    assert.equal(declared.status, 400);
    assert.deepEqual(await declared.json(), { error: "invalid_request" }, "declared length beyond the cap");
  }
  assert.equal((await post(userinfo, grant)).status, 200, "none of the refused attempts burned the genuine code");
});

test("a disabled account or a revoked session (tokenVersion) cannot redeem a code", { skip }, async () => {
  const { makeUser, grantFor, post, userinfo, exportRoute, prisma } = ctx;
  const disabled = await makeUser("ivan", { isDisabled: true });
  assert.deepEqual(await (await post(userinfo, grantFor(disabled))).json(), { error: "invalid_grant" });
  assert.deepEqual(await (await post(exportRoute, grantFor(disabled))).json(), { error: "invalid_grant" });

  const revoked = await makeUser("judy", { tokenVersion: 2 });
  const grant = grantFor(revoked);
  assert.equal((await post(userinfo, grant)).status, 200);
  await prisma.user.update({ where: { id: revoked.id }, data: { tokenVersion: { increment: 1 } } });
  assert.equal((await post(userinfo, grant)).status, 400, "signing out everywhere revokes outstanding codes");
  assert.equal((await post(exportRoute, grant)).status, 400);
  const missing = grantFor({ id: "no-such-user", tokenVersion: 0 });
  assert.equal((await post(exportRoute, missing)).status, 400);
});

test("photos that cannot be read do not fail the export; they are reported in a header", { skip }, async () => {
  const { makeUser, grantFor, post, exportRoute, prisma } = ctx;
  const user = await makeUser("karl");
  await prisma.meal.create({ data: { userId: user.id, mealType: "BREAKFAST", imageStorageKey: "meals/karl/gone.jpg", imageStorageKeys: ["meals/karl/gone.jpg"], totalCalories: 300 } });
  const response = await post(exportRoute, grantFor(user));
  assert.equal(response.status, 200, "object storage is not configured in this test, so every read fails");
  const header = response.headers.get("x-nouriledger-export-warnings");
  assert.ok(header);
  const warnings = JSON.parse(Buffer.from(header!, "base64url").toString()) as string[];
  assert.match(warnings[0], /^1 張照片在舊站已無法讀取/u);
  const form = await response.formData();
  const payload = JSON.parse(await (form.get("file") as File).text());
  assert.deepEqual(payload.data.meals[0].imageStorageKeys, []);
  assert.equal(payload.data.meals[0].imageStorageKey, null);
  assert.equal(payload.data.meals.length, 1, "the meal itself is still exported");
});

test("exports are rate limited per account and the feature disappears when it is not configured", { skip }, async () => {
  const { makeUser, grantFor, post, exportRoute, userinfo } = ctx;
  const user = await makeUser("lena");
  for (let index = 0; index < 5; index += 1) assert.equal((await post(exportRoute, grantFor(user))).status, 200, `export ${index + 1}`);
  const limited = await post(exportRoute, grantFor(user));
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get("retry-after"));

  const saved = process.env.NOURILEDGER_ORIGIN;
  delete process.env.NOURILEDGER_ORIGIN;
  try {
    const other = await makeUser("mike");
    for (const route of [userinfo, exportRoute]) {
      const response = await post(route, grantFor(other));
      assert.equal(response.status, 404);
      assert.deepEqual(await response.json(), { error: "not_found" });
    }
  } finally {
    process.env.NOURILEDGER_ORIGIN = saved;
  }
});
