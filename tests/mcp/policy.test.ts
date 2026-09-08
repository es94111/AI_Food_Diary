import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  assertMcpCreateOnlyOperation,
  MCP_ALLOWED_OPERATIONS,
  MCP_DENIED_OPERATIONS,
  MCP_SPEC_VERSION,
  MCP_WRITE_POLICY,
  McpPolicyError
} from "../../src/lib/mcp/policy";

test("MCP policy pins the requested protocol and create-only mode", () => {
  assert.equal(MCP_SPEC_VERSION, "2026-07-28");
  assert.equal(MCP_WRITE_POLICY, "CREATE_ONLY");
  for (const operation of MCP_ALLOWED_OPERATIONS) assert.doesNotThrow(() => assertMcpCreateOnlyOperation(operation));
});

test("MCP policy rejects every destructive or mutating operation", () => {
  for (const operation of MCP_DENIED_OPERATIONS) {
    assert.throws(
      () => assertMcpCreateOnlyOperation(operation),
      (error: unknown) => error instanceof McpPolicyError && error.code === `MCP_${operation.toUpperCase()}_NOT_ALLOWED`
    );
  }
  assert.throws(() => assertMcpCreateOnlyOperation("execute_command"), (error: unknown) => error instanceof McpPolicyError && error.code === "MCP_OPERATION_NOT_ALLOWED");
});

test("MCP tool registration contains no forbidden tool names", () => {
  const source = readFileSync(new URL("../../src/lib/mcp/server.ts", import.meta.url), "utf8");
  for (const name of ["update", "edit", "patch", "modify", "delete", "remove", "overwrite", "replace", "upsert", "restore"]) {
    assert.doesNotMatch(source, new RegExp(`registerTool\\(\\s*[\\"'](?:${name})_`, "i"));
  }
  for (const name of ["list_meals", "get_meal", "search_meals", "list_saved_foods", "search_saved_foods", "list_water_logs", "create_meal", "create_saved_food", "create_water_log"]) {
    assert.match(source, new RegExp(`registerTool\\(\\s*[\\"']${name}[\\"']`));
  }
});

test("database migration protects audit events with an append-only trigger", () => {
  const migration = readFileSync(new URL("../../prisma/migrations/20260907000000_add_ai_activity_mcp/migration.sql", import.meta.url), "utf8");
  assert.match(migration, /BEFORE UPDATE OR DELETE ON "AiAuditEvent"/);
  assert.match(migration, /BEFORE TRUNCATE ON "AiAuditEvent"/);
  assert.match(migration, /RAISE EXCEPTION 'AiAuditEvent is append-only'/);
  assert.match(migration, /ON DELETE RESTRICT/);
});
