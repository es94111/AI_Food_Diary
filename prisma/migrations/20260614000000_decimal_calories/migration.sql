-- Allow fractional calories from nutrition-label entry (match protein/fat/carbs Decimal).
ALTER TABLE "Meal" ALTER COLUMN "totalCalories" SET DATA TYPE DECIMAL(8,2);
ALTER TABLE "MealItem" ALTER COLUMN "calories" SET DATA TYPE DECIMAL(8,2), ALTER COLUMN "calories" SET DEFAULT 0;
ALTER TABLE "SavedFood" ALTER COLUMN "calories" SET DATA TYPE DECIMAL(8,2), ALTER COLUMN "calories" SET DEFAULT 0;
ALTER TABLE "DailySummary" ALTER COLUMN "totalCalories" SET DATA TYPE DECIMAL(8,2), ALTER COLUMN "totalCalories" SET DEFAULT 0;
ALTER TABLE "DailyRecommendation" ALTER COLUMN "totalCalories" SET DATA TYPE DECIMAL(8,2), ALTER COLUMN "totalCalories" SET DEFAULT 0;
