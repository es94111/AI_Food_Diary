-- AI/MCP provenance is additive. Existing records are classified as human
-- creations and backfilled to their owning user.
ALTER TABLE "Meal"
  ADD COLUMN "createdByType" TEXT NOT NULL DEFAULT 'human',
  ADD COLUMN "createdByUserId" TEXT,
  ADD COLUMN "createdByAiSource" TEXT,
  ADD COLUMN "createdByRequestId" TEXT;

ALTER TABLE "WaterLog"
  ADD COLUMN "createdByType" TEXT NOT NULL DEFAULT 'human',
  ADD COLUMN "createdByUserId" TEXT,
  ADD COLUMN "createdByAiSource" TEXT,
  ADD COLUMN "createdByRequestId" TEXT;

ALTER TABLE "SavedFood"
  ADD COLUMN "createdByType" TEXT NOT NULL DEFAULT 'human',
  ADD COLUMN "createdByUserId" TEXT,
  ADD COLUMN "createdByAiSource" TEXT,
  ADD COLUMN "createdByRequestId" TEXT,
  ADD COLUMN "mcpCreateFingerprint" TEXT;

UPDATE "Meal" SET "createdByUserId" = "userId" WHERE "createdByUserId" IS NULL;
UPDATE "WaterLog" SET "createdByUserId" = "userId" WHERE "createdByUserId" IS NULL;
UPDATE "SavedFood" SET "createdByUserId" = "userId" WHERE "createdByUserId" IS NULL;

ALTER TABLE "Meal"
  ADD CONSTRAINT "Meal_createdByType_check"
  CHECK ("createdByType" IN ('human', 'ai', 'system'));

ALTER TABLE "WaterLog"
  ADD CONSTRAINT "WaterLog_createdByType_check"
  CHECK ("createdByType" IN ('human', 'ai', 'system'));

ALTER TABLE "SavedFood"
  ADD CONSTRAINT "SavedFood_createdByType_check"
  CHECK ("createdByType" IN ('human', 'ai', 'system'));

CREATE TABLE "AiAuditEvent" (
  "id" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" TEXT NOT NULL,
  "actorType" TEXT NOT NULL,
  "actorSource" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT,
  "mcpToolName" TEXT,
  "beforeState" JSONB,
  "afterState" JSONB,
  "requestId" TEXT NOT NULL,
  "correlationId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "originalAiActionId" TEXT,
  "resourceVersion" TIMESTAMP(3),
  "restoredAt" TIMESTAMP(3),
  "restoredByUserId" TEXT,
  "restoreReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AiAuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiAuditEvent_actorType_check" CHECK ("actorType" IN ('human', 'ai', 'system')),
  CONSTRAINT "AiAuditEvent_status_check" CHECK ("status" IN ('started', 'succeeded', 'failed'))
);

CREATE TABLE "McpOAuthAuthorizationCode" (
  "id" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "redirectUri" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "codeChallenge" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "redeemedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "McpOAuthAuthorizationCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "McpOAuthAuthorizationCode_codeHash_key"
  ON "McpOAuthAuthorizationCode"("codeHash");
CREATE INDEX "McpOAuthAuthorizationCode_userId_expiresAt_idx"
  ON "McpOAuthAuthorizationCode"("userId", "expiresAt");
CREATE INDEX "McpOAuthAuthorizationCode_expiresAt_redeemedAt_idx"
  ON "McpOAuthAuthorizationCode"("expiresAt", "redeemedAt");

CREATE UNIQUE INDEX "Meal_userId_createdByAiSource_createdByRequestId_key"
  ON "Meal"("userId", "createdByAiSource", "createdByRequestId");
CREATE UNIQUE INDEX "WaterLog_userId_createdByAiSource_createdByRequestId_key"
  ON "WaterLog"("userId", "createdByAiSource", "createdByRequestId");
CREATE UNIQUE INDEX "SavedFood_userId_createdByAiSource_createdByRequestId_key"
  ON "SavedFood"("userId", "createdByAiSource", "createdByRequestId");
CREATE UNIQUE INDEX "SavedFood_userId_mcpCreateFingerprint_key"
  ON "SavedFood"("userId", "mcpCreateFingerprint");

CREATE INDEX "AiAuditEvent_userId_occurredAt_idx"
  ON "AiAuditEvent"("userId", "occurredAt");
CREATE INDEX "AiAuditEvent_resourceType_resourceId_occurredAt_idx"
  ON "AiAuditEvent"("resourceType", "resourceId", "occurredAt");
CREATE INDEX "AiAuditEvent_requestId_idx" ON "AiAuditEvent"("requestId");
CREATE INDEX "AiAuditEvent_correlationId_idx" ON "AiAuditEvent"("correlationId");
CREATE INDEX "AiAuditEvent_originalAiActionId_occurredAt_idx"
  ON "AiAuditEvent"("originalAiActionId", "occurredAt");

ALTER TABLE "AiAuditEvent"
  ADD CONSTRAINT "AiAuditEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AiAuditEvent"
  ADD CONSTRAINT "AiAuditEvent_originalAiActionId_fkey"
  FOREIGN KEY ("originalAiActionId") REFERENCES "AiAuditEvent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "McpOAuthAuthorizationCode"
  ADD CONSTRAINT "McpOAuthAuthorizationCode_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Defense in depth: even accidental ORM calls and privileged application code
-- cannot rewrite or delete audit history. Restores append new events instead.
CREATE OR REPLACE FUNCTION "reject_ai_audit_event_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'AiAuditEvent is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AiAuditEvent_append_only"
BEFORE UPDATE OR DELETE ON "AiAuditEvent"
FOR EACH ROW EXECUTE FUNCTION "reject_ai_audit_event_mutation"();

-- TRUNCATE does not fire row-level DELETE triggers. Block it separately so a
-- cascading database wipe cannot silently erase the AI audit history.
CREATE TRIGGER "AiAuditEvent_no_truncate"
BEFORE TRUNCATE ON "AiAuditEvent"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_ai_audit_event_mutation"();
