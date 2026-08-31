-- Initial baseline reconstructed from prisma/schema.prisma at commit
-- a6165f77a815206e257ac80836f23c3072c323df, immediately before the
-- first committed incremental migration (20260610000000_add_saved_food_barcode).
--
-- This migration makes `prisma migrate deploy` capable of provisioning a
-- completely empty PostgreSQL database without relying on historical
-- `prisma db push` state.

-- CreateEnum
CREATE TYPE "Goal" AS ENUM ('LOSE_FAT', 'MAINTAIN', 'BUILD_MUSCLE');

-- CreateEnum
CREATE TYPE "MealType" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "googleId" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "registrationOpen" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gender" TEXT,
    "birthDate" TIMESTAMP(3),
    "heightCm" INTEGER,
    "weightKg" DECIMAL(5,2),
    "encGender" JSONB,
    "encBirthDate" JSONB,
    "encHeightCm" JSONB,
    "encWeightKg" JSONB,
    "activityLevel" TEXT,
    "goal" "Goal" NOT NULL DEFAULT 'MAINTAIN',
    "calorieTarget" INTEGER NOT NULL DEFAULT 2000,
    "waterGoalMl" INTEGER NOT NULL DEFAULT 2000,
    "timezone" TEXT,
    "encryptedPreferences" JSONB,
    "encryptedAllergies" JSONB,
    "aiProvider" TEXT,
    "aiBaseUrl" TEXT,
    "aiVisionModel" TEXT,
    "aiTextModel" TEXT,
    "encryptedAiApiKey" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Meal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mealType" "MealType" NOT NULL,
    "imageStorageKey" TEXT,
    "totalCalories" INTEGER NOT NULL DEFAULT 0,
    "totalProtein" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "totalFat" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "totalCarbs" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "aiConfidence" DECIMAL(4,3),
    "aiNotes" TEXT,
    "encAiNotes" JSONB,
    "aiRawEncrypted" JSONB,
    "eatenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MealItem" (
    "id" TEXT NOT NULL,
    "mealId" TEXT NOT NULL,
    "name" TEXT,
    "estimatedAmount" TEXT,
    "encName" JSONB,
    "encEstimatedAmount" JSONB,
    "calories" INTEGER NOT NULL,
    "protein" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "fat" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "carbs" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "aiRating" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MealItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaterLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountMl" INTEGER NOT NULL,
    "drankAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaterLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedFood" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "estimatedAmount" TEXT,
    "encName" JSONB,
    "encEstimatedAmount" JSONB,
    "calories" INTEGER NOT NULL,
    "protein" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "fat" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "carbs" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedFood_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailySummary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "summaryDate" TIMESTAMP(3) NOT NULL,
    "totalCalories" INTEGER NOT NULL,
    "totalProtein" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "totalFat" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "totalCarbs" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "aiSummary" TEXT,
    "aiRecommendation" TEXT,
    "encAiSummary" JSONB,
    "encAiRecommendation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailySummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyRecommendation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recommendationDate" TIMESTAMP(3) NOT NULL,
    "advice" TEXT NOT NULL,
    "totalCalories" INTEGER NOT NULL,
    "totalProtein" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "totalFat" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "totalCarbs" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthMetric" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "unit" TEXT NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL,
    "rawEncrypted" JSONB,
    "encValue" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'HEALTH_CONNECT',
    "deviceName" TEXT,
    "tokenHash" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE INDEX "Meal_userId_eatenAt_idx" ON "Meal"("userId", "eatenAt");

-- CreateIndex
CREATE INDEX "WaterLog_userId_drankAt_idx" ON "WaterLog"("userId", "drankAt");

-- CreateIndex
CREATE INDEX "SavedFood_userId_name_idx" ON "SavedFood"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "DailySummary_userId_summaryDate_key" ON "DailySummary"("userId", "summaryDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyRecommendation_userId_recommendationDate_key" ON "DailyRecommendation"("userId", "recommendationDate");

-- CreateIndex
CREATE UNIQUE INDEX "HealthMetric_userId_source_type_measuredAt_key" ON "HealthMetric"("userId", "source", "type", "measuredAt");

-- CreateIndex
CREATE INDEX "HealthMetric_userId_measuredAt_idx" ON "HealthMetric"("userId", "measuredAt");

-- CreateIndex
CREATE INDEX "HealthMetric_userId_type_measuredAt_idx" ON "HealthMetric"("userId", "type", "measuredAt");

-- CreateIndex
CREATE UNIQUE INDEX "HealthConnection_tokenHash_key" ON "HealthConnection"("tokenHash");

-- CreateIndex
CREATE INDEX "HealthConnection_userId_revokedAt_idx" ON "HealthConnection"("userId", "revokedAt");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meal" ADD CONSTRAINT "Meal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealItem" ADD CONSTRAINT "MealItem_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "Meal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaterLog" ADD CONSTRAINT "WaterLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedFood" ADD CONSTRAINT "SavedFood_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailySummary" ADD CONSTRAINT "DailySummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyRecommendation" ADD CONSTRAINT "DailyRecommendation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthMetric" ADD CONSTRAINT "HealthMetric_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthConnection" ADD CONSTRAINT "HealthConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
