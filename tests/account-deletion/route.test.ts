import assert from "node:assert/strict";
import { before, mock, test } from "node:test";
import { unauthorized } from "../../src/lib/http";

let userId = "account-route-user";
let authFails = false;
let cleanupResult: "complete" | "pending" = "complete";
let clearSessionCalls = 0;
const deletionCalls: string[] = [];

mock.module("../../src/lib/auth", {
  exports: {
    async requireUser() {
      if (authFails) throw unauthorized();
      return { id: userId };
    },
    async clearSession() {
      clearSessionCalls += 1;
    },
  },
});
mock.module("../../src/lib/account-deletion", {
  exports: {
    async deleteAccount(id: string) {
      deletionCalls.push(id);
      return cleanupResult;
    },
  },
});

let DELETE: (request: Request) => Promise<Response>;
before(async () => {
  ({ DELETE } = await import("../../src/app/api/account/route"));
});

function reset() {
  userId = "account-route-user";
  authFails = false;
  cleanupResult = "complete";
  clearSessionCalls = 0;
  deletionCalls.length = 0;
}

test("requires the exact explicit confirmation before deleting", async () => {
  reset();
  const response = await DELETE(
    new Request("https://food.example.test/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "delete" }),
    }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(deletionCalls, []);
  assert.equal(clearSessionCalls, 0);
});

test("requires an authenticated user and returns success after clearing the session", async () => {
  reset();
  authFails = true;
  const unauthenticated = await DELETE(
    new Request("https://food.example.test/api/account", { method: "DELETE" }),
  );
  assert.equal(unauthenticated.status, 401);
  assert.deepEqual(deletionCalls, []);

  authFails = false;
  userId = "user-to-delete";
  const response = await DELETE(
    new Request("https://food.example.test/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE" }),
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await response.json(), { ok: true, photoCleanup: "complete" });
  assert.deepEqual(deletionCalls, ["user-to-delete"]);
  assert.equal(clearSessionCalls, 1);
});

test("reports pending photo cleanup without undoing account deletion", async () => {
  reset();
  cleanupResult = "pending";
  const response = await DELETE(
    new Request("https://food.example.test/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE" }),
    }),
  );

  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { ok: true, photoCleanup: "pending" });
  assert.equal(clearSessionCalls, 1);
});
