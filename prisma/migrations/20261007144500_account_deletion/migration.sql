ALTER TABLE "AiAuditEvent"
  DROP CONSTRAINT "AiAuditEvent_userId_fkey";

ALTER TABLE "AiAuditEvent"
  ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "AiAuditEvent"
  ADD CONSTRAINT "AiAuditEvent_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "AccountDeletionPhotoCleanup" (
  "id" TEXT NOT NULL,
  "storagePrefix" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccountDeletionPhotoCleanup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AccountDeletionPhotoCleanup_storagePrefix_key"
  ON "AccountDeletionPhotoCleanup"("storagePrefix");
CREATE INDEX "AccountDeletionPhotoCleanup_createdAt_idx"
  ON "AccountDeletionPhotoCleanup"("createdAt");

-- Audit events remain append-only except for detaching deleted user identities.
CREATE OR REPLACE FUNCTION "reject_ai_audit_event_mutation"()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND (to_jsonb(NEW) - ARRAY['userId', 'restoredByUserId'])
      IS NOT DISTINCT FROM
        (to_jsonb(OLD) - ARRAY['userId', 'restoredByUserId'])
    AND (
      NEW."userId" IS NOT DISTINCT FROM OLD."userId"
      OR (OLD."userId" IS NOT NULL AND NEW."userId" IS NULL)
    )
    AND (
      NEW."restoredByUserId" IS NOT DISTINCT FROM OLD."restoredByUserId"
      OR (OLD."restoredByUserId" IS NOT NULL AND NEW."restoredByUserId" IS NULL)
    )
    AND (
      (OLD."userId" IS NOT NULL AND NEW."userId" IS NULL)
      OR (OLD."restoredByUserId" IS NOT NULL AND NEW."restoredByUserId" IS NULL)
    )
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'AiAuditEvent is append-only';
END;
$$ LANGUAGE plpgsql;
