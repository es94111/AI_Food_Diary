CREATE TABLE "WeeklySummary" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "weekStart" TIMESTAMP(3) NOT NULL,
  "totalCalories" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "totalProtein" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "totalFat" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "totalCarbs" DECIMAL(8,2) NOT NULL DEFAULT 0,
  "waterTotalMl" INTEGER NOT NULL DEFAULT 0,
  "aiSummary" TEXT,
  "aiRecommendation" TEXT,
  "encAiSummary" JSONB,
  "encAiRecommendation" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WeeklySummary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WeeklySummary_userId_weekStart_key" ON "WeeklySummary"("userId", "weekStart");

ALTER TABLE "WeeklySummary"
  ADD CONSTRAINT "WeeklySummary_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
