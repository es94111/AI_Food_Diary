import assert from "node:assert/strict";
import { before, mock, test } from "node:test";

type CleanupJob = { id: string; storagePrefix: string; createdAt: Date };
const jobs = new Map<string, CleanupJob>();
const objects = new Set<string>();
const transactionCalls: string[] = [];
const storageCalls: string[] = [];
let nextJobId = 0;
let transactionCommitted = false;
let failUserDelete = false;
let failNextObjectBatch = false;

const tx = {
  user: {
    async update(input: { where: { id: string }; data: { tokenVersion: { increment: number } } }) {
      transactionCalls.push(`user.update:${input.where.id}:${input.data.tokenVersion.increment}`);
    },
    async delete(input: { where: { id: string } }) {
      transactionCalls.push(`user.delete:${input.where.id}`);
      if (failUserDelete) throw new Error("simulated database failure");
    },
  },
  accountDeletionPhotoCleanup: {
    async create(input: { data: { storagePrefix: string } }) {
      transactionCalls.push(`cleanup.create:${input.data.storagePrefix}`);
      const job = {
        id: `cleanup-${++nextJobId}`,
        storagePrefix: input.data.storagePrefix,
        createdAt: new Date(),
      };
      jobs.set(job.id, job);
      return { id: job.id };
    },
  },
  aiAuditEvent: {
    async updateMany(input: { where: Record<string, string>; data: Record<string, null> }) {
      const field = "userId" in input.where ? "userId" : "restoredByUserId";
      transactionCalls.push(`audit.unlink:${field}:${input.where[field]}`);
      return { count: 1 };
    },
  },
};

const prisma = {
  async $transaction<T>(callback: (transaction: typeof tx) => Promise<T>): Promise<T> {
    const previousJobs = new Map(jobs);
    transactionCommitted = false;
    try {
      const result = await callback(tx);
      transactionCommitted = true;
      transactionCalls.push("transaction.commit");
      return result;
    } catch (error) {
      jobs.clear();
      for (const [id, job] of previousJobs) jobs.set(id, job);
      transactionCalls.push("transaction.rollback");
      throw error;
    }
  },
  accountDeletionPhotoCleanup: {
    async findUnique(input: { where: { id: string } }) {
      const job = jobs.get(input.where.id);
      return job ? { id: job.id, storagePrefix: job.storagePrefix } : null;
    },
    async findMany() {
      return [...jobs.values()];
    },
    async deleteMany(input: { where: { id: string } }) {
      return { count: jobs.delete(input.where.id) ? 1 : 0 };
    },
  },
};

mock.module("../../src/lib/db", { exports: { prisma } });
mock.module("../../src/lib/storage", {
  exports: {
    async listKeys(prefix: string) {
      assert.equal(transactionCommitted, true, "object storage must run after the DB commit");
      storageCalls.push(`list:${prefix}`);
      return [...objects].filter((key) => key.startsWith(prefix));
    },
    async deleteImages(keys: readonly string[]) {
      storageCalls.push(`delete:${keys.length}`);
      if (failNextObjectBatch) {
        failNextObjectBatch = false;
        if (keys[0]) objects.delete(keys[0]);
        throw new Error("simulated storage failure");
      }
      for (const key of keys) objects.delete(key);
    },
  },
});

let deleteAccount: (userId: string) => Promise<"complete" | "pending">;
let retryPendingAccountPhotoCleanup: () => Promise<{
  completed: number;
  failed: number;
}>;
before(async () => {
  ({ deleteAccount, retryPendingAccountPhotoCleanup } = await import(
    "../../src/lib/account-deletion"
  ));
});

function reset() {
  jobs.clear();
  objects.clear();
  transactionCalls.length = 0;
  storageCalls.length = 0;
  nextJobId = 0;
  transactionCommitted = false;
  failUserDelete = false;
  failNextObjectBatch = false;
}

test("deletion transaction revokes, unlinks retained audit events, and deletes photos after commit", async () => {
  reset();
  objects.add("meals/user-1/photo-a.jpg");
  objects.add("meals/user-1/photo-b.jpg");
  objects.add("meals/another-user/photo.jpg");

  const result = await deleteAccount("user-1");

  assert.equal(result, "complete");
  assert.deepEqual(transactionCalls, [
    "user.update:user-1:1",
    "cleanup.create:meals/user-1/",
    "audit.unlink:userId:user-1",
    "audit.unlink:restoredByUserId:user-1",
    "user.delete:user-1",
    "transaction.commit",
  ]);
  assert.deepEqual(storageCalls, ["list:meals/user-1/", "delete:2"]);
  assert.deepEqual([...objects], ["meals/another-user/photo.jpg"]);
  assert.equal(jobs.size, 0);
});

test("a partial object-store failure leaves a retryable job and reruns idempotently", async () => {
  reset();
  objects.add("meals/user-2/photo-a.jpg");
  objects.add("meals/user-2/photo-b.jpg");
  failNextObjectBatch = true;

  assert.equal(await deleteAccount("user-2"), "pending");
  assert.equal(jobs.size, 1);
  assert.equal(objects.size, 1, "a partial delete must not be reported as complete");

  assert.deepEqual(await retryPendingAccountPhotoCleanup(), { completed: 1, failed: 0 });
  assert.equal(jobs.size, 0);
  assert.equal(objects.size, 0);
  assert.deepEqual(await retryPendingAccountPhotoCleanup(), { completed: 0, failed: 0 });
});

test("database failure rolls back the cleanup job and never touches object storage", async () => {
  reset();
  failUserDelete = true;

  await assert.rejects(deleteAccount("user-3"), /simulated database failure/);

  assert.equal(jobs.size, 0);
  assert.deepEqual(storageCalls, []);
  assert.equal(transactionCalls.at(-1), "transaction.rollback");
});

test("invalid storage prefixes are rejected before any destructive DB work", async () => {
  reset();

  await assert.rejects(deleteAccount("bad/user-id"), /Unsupported account photo storage prefix/);

  assert.deepEqual(transactionCalls, []);
  assert.deepEqual(storageCalls, []);
});
