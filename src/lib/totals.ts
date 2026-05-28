import type { Meal } from "@prisma/client";

export function sumMeals(meals: Pick<Meal, "totalCalories" | "totalProtein" | "totalFat" | "totalCarbs">[]) {
  return meals.reduce(
    (acc, meal) => ({
      calories: acc.calories + meal.totalCalories,
      protein: acc.protein + Number(meal.totalProtein),
      fat: acc.fat + Number(meal.totalFat),
      carbs: acc.carbs + Number(meal.totalCarbs)
    }),
    { calories: 0, protein: 0, fat: 0, carbs: 0 }
  );
}
