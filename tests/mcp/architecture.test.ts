import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("MCP business repository has no mutation primitive except create", () => {
  const repository = source("../../src/lib/mcp/repository.ts");
  for (const primitive of [
    "update",
    "updateMany",
    "delete",
    "deleteMany",
    "upsert",
    "$executeRaw",
    "$executeRawUnsafe",
    "$queryRaw",
    "$queryRawUnsafe",
  ]) {
    assert.doesNotMatch(repository, new RegExp(`\\.${primitive}\\s*\\(`));
  }
  assert.match(repository, /tx\.meal\.create\s*\(/);
  assert.match(repository, /tx\.savedFood\.create\s*\(/);
  assert.match(repository, /tx\.waterLog\.create\s*\(/);
});

test("MCP transport is POST-only and explicitly rejects the legacy era", () => {
  const route = source("../../src/app/mcp/route.ts");
  const server = source("../../src/lib/mcp/server.ts");
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function GET[\s\S]*methodNotAllowed/);
  assert.match(route, /export async function DELETE[\s\S]*methodNotAllowed/);
  assert.match(server, /legacy:\s*"reject"/);
  assert.match(server, /context\.era !== "modern"/);
});

test("restore stays outside the MCP registry and requires a human API", () => {
  const server = source("../../src/lib/mcp/server.ts");
  const restoreRoute = source(
    "../../src/app/api/ai-activity/[id]/restore/route.ts",
  );
  assert.doesNotMatch(server, /registerTool\(\s*["'][^"']*restore/i);
  assert.match(restoreRoute, /requireUser\s*\(/);
  assert.match(restoreRoute, /restoreAiActivitySchema\.parse/);
  assert.match(restoreRoute, /assertHumanMutationOrigin/);
});

test("create provenance and request id uniqueness are database-enforced", () => {
  const schema = source("../../prisma/schema.prisma");
  const migration = source(
    "../../prisma/migrations/20260907000000_add_ai_activity_mcp/migration.sql",
  );
  for (const field of [
    "createdByType",
    "createdByUserId",
    "createdByAiSource",
    "createdByRequestId",
  ]) {
    assert.match(schema, new RegExp(field));
  }
  assert.match(migration, /Meal_userId_createdByAiSource_createdByRequestId_key/);
  assert.match(migration, /SavedFood_userId_createdByAiSource_createdByRequestId_key/);
  assert.match(migration, /WaterLog_userId_createdByAiSource_createdByRequestId_key/);
});

