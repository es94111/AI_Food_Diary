ALTER TABLE "SavedFood" ADD COLUMN "barcode" TEXT;

CREATE UNIQUE INDEX "SavedFood_userId_barcode_key" ON "SavedFood"("userId", "barcode");
