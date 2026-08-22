-- HealthMetric encryption fields were originally introduced with `prisma db push`.
-- Keep deployments that use `prisma migrate deploy` compatible with older databases.
ALTER TABLE "HealthMetric"
  ADD COLUMN IF NOT EXISTS "rawEncrypted" JSONB,
  ADD COLUMN IF NOT EXISTS "encValue" JSONB;

-- New sync writes store the number in encValue and clear the legacy column.
ALTER TABLE "HealthMetric"
  ALTER COLUMN "value" DROP NOT NULL;
