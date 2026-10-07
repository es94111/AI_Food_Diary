import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, mock, test } from "node:test";
import { isDisposableTestDatabaseUrl } from "../helpers/disposable-test-database";

const databaseUrl = process.env.FOOD_TEST_DATABASE_URL;
const usable = isDisposableTestDatabaseUrl(databaseUrl);
const skip = usable ? false : "set FOOD_TEST_DATABASE_URL to a local *_test database";
const cookieName = "food_diary_session";
let sessionToken: string | null = null;

const cookieStore = {
  get(name: string) {
    return name === cookieName && sessionToken ? { value: sessionToken } : undefined;
  },
  set(name: string, value: string) {
    if (name === cookieName) sessionToken = value;
  },
  delete(name: string) {
    if (name === cookieName) sessionToken = null;
  }
};

mock.module("next/headers", { exports: { cookies: async () => cookieStore } });

async function setup() {
  if (!usable || !databaseUrl) throw new Error("Unsafe integration test database URL");
  process.env.DATABASE_URL = databaseUrl;
  process.env.AUTH_SECRET = "auth-integration-test-secret-0123456789";
  const { prisma } = await import("../../src/lib/db");
  const user = await prisma.user.create({
    data: {
      email: `auth-${randomBytes(6).toString("hex")}@api-test.invalid`,
      passwordHash: "test-only"
    }
  });

  try {
    const auth = await import("../../src/lib/auth");
    const meals = await import("../../src/app/api/meals/route");
    return { prisma, user, auth, meals };
  } catch (error) {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
    throw error;
  }
}

let ctx!: Awaited<ReturnType<typeof setup>>;
before(async () => { if (usable) ctx = await setup(); });
after(async () => {
  sessionToken = null;
  if (!usable || !ctx) return;
  await ctx.prisma.user.delete({ where: { id: ctx.user.id } });
  await ctx.prisma.$disconnect();
});

test("API requests require a valid session and tokenVersion revokes existing sessions", { skip }, async () => {
  const { auth, meals, prisma, user } = ctx;
  const getMeals = () => meals.GET(new Request("https://food.example.test/api/meals"));

  const unauthenticated = await getMeals();
  assert.equal(unauthenticated.status, 401);

  await auth.createSession(user.id, user.tokenVersion);
  const currentUser = await auth.getCurrentUser();
  assert.ok(currentUser);
  assert.ok(!("tokenVersion" in currentUser));
  const authenticated = await getMeals();
  assert.equal(authenticated.status, 200);
  assert.deepEqual(await authenticated.json(), { meals: [] });

  await prisma.user.update({ where: { id: user.id }, data: { tokenVersion: { increment: 1 } } });
  assert.equal(await auth.getCurrentUser(), null);
  const revoked = await getMeals();
  assert.equal(revoked.status, 401);
});
