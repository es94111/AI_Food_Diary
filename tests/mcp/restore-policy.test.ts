import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateAiCreateRestore } from "../../src/lib/ai-restore-policy";

const version = new Date("2026-09-07T12:00:00.000Z");

function decision(overrides: Record<string, unknown> = {}) {
  return evaluateAiCreateRestore({
    ownerAuthorized: true,
    action: "AI_CREATE_SUCCEEDED",
    status: "succeeded",
    alreadyRestored: false,
    resourceVersion: version,
    resource: {
      exists: true,
      updatedAt: version,
      provenanceMatches: true,
      safeToDelete: true,
    },
    ...overrides,
  });
}

test("allows only the untouched resource version created by the AI action", () => {
  assert.deepEqual(decision(), { eligible: true, conflictReason: null });
});

test("detects a later human/system/AI change and never silently restores it", () => {
  const result = decision({
    resource: {
      exists: true,
      updatedAt: new Date("2026-09-07T12:01:00.000Z"),
      provenanceMatches: true,
      safeToDelete: true,
    },
  });
  assert.equal(result.eligible, false);
  assert.match(result.conflictReason ?? "", /changed after/);
});

test("rejects provenance changes, added attachments, and repeated restore", () => {
  assert.equal(
    decision({
      resource: {
        exists: true,
        updatedAt: version,
        provenanceMatches: false,
        safeToDelete: true,
      },
    }).eligible,
    false,
  );
  assert.equal(
    decision({
      resource: {
        exists: true,
        updatedAt: version,
        provenanceMatches: true,
        safeToDelete: false,
      },
    }).eligible,
    false,
  );
  assert.equal(decision({ alreadyRestored: true }).eligible, false);
});

test("rejects non-create and failed AI events by default", () => {
  assert.equal(decision({ action: "AI_READ_SUCCEEDED" }).eligible, false);
  assert.equal(decision({ status: "failed" }).eligible, false);
  assert.equal(decision({ resourceVersion: null }).eligible, false);
});

test("server preview is never eligible for an admin who is not the owner", () => {
  const result = decision({ ownerAuthorized: false });
  assert.equal(result.eligible, false);
  assert.match(result.conflictReason ?? "", /resource owner/);
});
