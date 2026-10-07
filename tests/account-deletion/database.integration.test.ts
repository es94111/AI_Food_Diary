import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, before, mock, test } from "node:test";
import { isDisposableTestDatabaseUrl } from "../helpers/disposable-test-database";

type PrismaClient = (typeof import("../../src/lib/db"))["prisma"];
type DeleteAccount = (typeof import("../../src/lib/account-deletion"))["deleteAccount"];
type VerifyMcpAccessToken = (typeof import("../../src/lib/mcp/oauth"))["verifyMcpAccessToken"];
type McpRuntimeConfig = import("../../src/lib/mcp/config").McpRuntimeConfig;

const databaseUrl = process.env.FOOD_TEST_DATABASE_URL;
const usable = isDisposableTestDatabaseUrl(databaseUrl);
const skip = usable ? false : "set FOOD_TEST_DATABASE_URL to a local *_test database";

let prisma: PrismaClient | null = null;
let deleteAccount: DeleteAccount | null = null;
let verifyMcpAccessToken: VerifyMcpAccessToken | null = null;
let mcpConfig: McpRuntimeConfig | null = null;
let accessToken = "";
let userId = "";
let otherUserId = "";
let auditEventId = "";
let otherAuditEventId = "";

before(async () => {
  if (!usable || !databaseUrl) return;
  process.env.DATABASE_URL = databaseUrl;
  process.env.MCP_OAUTH_SECRET = Buffer.alloc(32, 7).toString("base64");
  mock.module("../../src/lib/storage", {
    exports: {
      async listKeys() {
        return [];
      },
      async deleteImages() {},
    },
  });

  ({ prisma } = await import("../../src/lib/db"));
  ({ deleteAccount } = await import("../../src/lib/account-deletion"));
  const oauth = await import("../../src/lib/mcp/oauth");
  verifyMcpAccessToken = oauth.verifyMcpAccessToken;
  const user = await prisma.user.create({
    data: {
      email: `account-deletion-${randomBytes(6).toString("hex")}@route.test`,
      passwordHash: "unused-test-hash",
      name: "Account deletion test",
    },
  });
  userId = user.id;
  const otherUser = await prisma.user.create({
    data: {
      email: `account-deletion-other-${randomBytes(6).toString("hex")}@route.test`,
      passwordHash: "unused-test-hash",
      name: "Other account deletion test",
    },
  });
  otherUserId = otherUser.id;
  const config: McpRuntimeConfig = {
    publicUrl: new URL("https://food.example.test/mcp"),
    issuer: new URL("https://food.example.test"),
    allowedHosts: ["food.example.test"],
    allowedOrigins: [],
    allowedClientIds: ["test-client"],
    allowedRedirectUris: [],
  };
  mcpConfig = config;
  const { SignJWT } = await import("jose");
  const { getMcpOAuthSecret } = await import("../../src/lib/mcp/config");
  accessToken = await new SignJWT({
    client_id: "test-client",
    scope: "meals:read",
    tv: user.tokenVersion,
    actor_source: "chatgpt_mcp",
  })
    .setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
    .setIssuer(config.issuer.origin)
    .setAudience(config.publicUrl.toString())
    .setSubject(user.id)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(getMcpOAuthSecret());
  await oauth.verifyMcpAccessToken(accessToken, config);

  await prisma.userProfile.create({ data: { userId } });
  await prisma.meal.create({
    data: {
      userId,
      mealType: "LUNCH",
      items: {
        create: { calories: 100, protein: 5, fat: 3, carbs: 12 },
      },
    },
  });
  await prisma.waterLog.create({ data: { userId, amountMl: 250 } });
  const savedFood = await prisma.savedFood.create({
    data: { userId, name: "test food" },
  });
  await prisma.mealBundle.create({
    data: {
      userId,
      encName: { value: "test bundle" },
      items: {
        create: {
          savedFoodId: savedFood.id,
          encName: { value: "test item" },
          encEstimatedAmount: { value: "1 serving" },
        },
      },
    },
  });
  await prisma.dailySummary.create({
    data: { userId, summaryDate: new Date("2026-10-06T00:00:00.000Z") },
  });
  await prisma.weeklySummary.create({
    data: { userId, weekStart: new Date("2026-10-05T00:00:00.000Z") },
  });
  await prisma.dailyRecommendation.create({
    data: {
      userId,
      recommendationDate: new Date("2026-10-06T00:00:00.000Z"),
      advice: "test recommendation",
    },
  });
  await prisma.healthMetric.create({
    data: {
      userId,
      source: "test",
      type: "WEIGHT",
      unit: "kg",
      measuredAt: new Date("2026-10-06T12:00:00.000Z"),
    },
  });
  await prisma.healthConnection.create({
    data: { userId, tokenHash: randomUUID() },
  });
  await prisma.mcpOAuthAuthorizationCode.create({
    data: {
      userId,
      codeHash: randomBytes(32).toString("hex"),
      clientId: "test-client",
      redirectUri: "https://client.example.test/callback",
      resource: "https://food.example.test",
      codeChallenge: randomBytes(32).toString("base64url"),
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  const event = await prisma.aiAuditEvent.create({
    data: {
      userId,
      actorType: "human",
      actorSource: "test",
      action: "AI_READ_SUCCEEDED",
      resourceType: "MEAL",
      requestId: randomUUID(),
      correlationId: randomUUID(),
      status: "succeeded",
      restoredByUserId: userId,
    },
  });
  auditEventId = event.id;
  const otherEvent = await prisma.aiAuditEvent.create({
    data: {
      userId: otherUserId,
      actorType: "human",
      actorSource: "test",
      action: "AI_READ_SUCCEEDED",
      resourceType: "MEAL",
      requestId: randomUUID(),
      correlationId: randomUUID(),
      status: "succeeded",
    },
  });
  otherAuditEventId = otherEvent.id;
});

after(async () => {
  if (!usable || !prisma) return;
  if (otherUserId) await prisma.user.deleteMany({ where: { id: otherUserId } });
  await prisma.$disconnect();
});

test("PostgreSQL cascades account data, revokes MCP tokens, and retains audit history unlinked", { skip }, async () => {
  assert.ok(prisma && deleteAccount && verifyMcpAccessToken && mcpConfig);
  const db = prisma;
  const removeAccount = deleteAccount;
  const verifyToken = verifyMcpAccessToken;
  const config = mcpConfig;
  const result = await removeAccount(userId);

  assert.equal(result, "complete");
  assert.equal(await db.user.findUnique({ where: { id: userId } }), null);
  await assert.rejects(verifyToken(accessToken, config));
  assert.equal(await db.meal.count({ where: { userId } }), 0);
  assert.equal(
    await db.mealItem.count({ where: { meal: { userId } } }),
    0,
  );
  assert.deepEqual(
    await Promise.all([
      db.userProfile.count({ where: { userId } }),
      db.waterLog.count({ where: { userId } }),
      db.savedFood.count({ where: { userId } }),
      db.mealBundle.count({ where: { userId } }),
      db.mealBundleItem.count({ where: { mealBundle: { userId } } }),
      db.dailySummary.count({ where: { userId } }),
      db.weeklySummary.count({ where: { userId } }),
      db.dailyRecommendation.count({ where: { userId } }),
      db.healthConnection.count({ where: { userId } }),
      db.healthMetric.count({ where: { userId } }),
      db.mcpOAuthAuthorizationCode.count({ where: { userId } }),
    ]),
    Array(11).fill(0),
  );

  const event = await db.aiAuditEvent.findUnique({
    where: { id: auditEventId },
  });
  assert.ok(event);
  assert.equal(event.userId, null);
  assert.equal(event.restoredByUserId, null);
  await assert.rejects(
    db.aiAuditEvent.update({
      where: { id: auditEventId },
      data: { action: "REWRITTEN" },
    }),
  );
  await assert.rejects(
    db.aiAuditEvent.delete({ where: { id: auditEventId } }),
  );

  await assert.rejects(
    db.aiAuditEvent.update({
      where: { id: otherAuditEventId },
      data: { userId: null, restoredByUserId: otherUserId },
    }),
    /AiAuditEvent is append-only/,
  );
  const unchangedOtherEvent = await db.aiAuditEvent.findUnique({
    where: { id: otherAuditEventId },
  });
  assert.equal(unchangedOtherEvent?.userId, otherUserId);
  assert.equal(unchangedOtherEvent?.restoredByUserId, null);
});
