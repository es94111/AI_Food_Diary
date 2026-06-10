ALTER TABLE "SavedFood" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "SavedFood" ADD COLUMN "isFavorite" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SavedFood" ADD COLUMN "useCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SavedFood" ADD COLUMN "lastUsedAt" TIMESTAMP(3);
ALTER TABLE "SavedFood" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "SavedFood_userId_archivedAt_isFavorite_lastUsedAt_idx" ON "SavedFood"("userId", "archivedAt", "isFavorite", "lastUsedAt");
