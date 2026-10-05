CREATE TABLE "MealBundle" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "encName" JSONB NOT NULL,
  "imageStorageKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MealBundle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MealBundleItem" (
  "id" TEXT NOT NULL,
  "mealBundleId" TEXT NOT NULL,
  "savedFoodId" TEXT,
  "encName" JSONB NOT NULL,
  "encEstimatedAmount" JSONB NOT NULL,
  "calories" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "protein" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "fat" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "carbs" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "aiRating" TEXT NOT NULL DEFAULT 'MANUAL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MealBundleItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MealBundle_userId_updatedAt_idx" ON "MealBundle"("userId", "updatedAt");
CREATE INDEX "MealBundleItem_mealBundleId_idx" ON "MealBundleItem"("mealBundleId");
CREATE INDEX "MealBundleItem_savedFoodId_idx" ON "MealBundleItem"("savedFoodId");

ALTER TABLE "MealBundle"
  ADD CONSTRAINT "MealBundle_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MealBundleItem"
  ADD CONSTRAINT "MealBundleItem_mealBundleId_fkey"
  FOREIGN KEY ("mealBundleId") REFERENCES "MealBundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MealBundleItem"
  ADD CONSTRAINT "MealBundleItem_savedFoodId_fkey"
  FOREIGN KEY ("savedFoodId") REFERENCES "SavedFood"("id") ON DELETE SET NULL ON UPDATE CASCADE;
