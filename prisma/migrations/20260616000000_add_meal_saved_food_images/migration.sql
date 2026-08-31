-- Add image fields introduced in the 2026-06-16 schema update. These fields
-- were previously applied to existing databases via schema synchronization but
-- had no committed migration, so fresh databases created with
-- `prisma migrate deploy` would otherwise miss them.

ALTER TABLE "Meal"
  ADD COLUMN "imageStorageKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "SavedFood"
  ADD COLUMN "imageStorageKey" TEXT;
