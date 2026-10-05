import { redirect } from "next/navigation";
import { MealBundlesManager } from "@/components/meal-bundles-manager";
import { decryptMealBundle, decryptSavedFood } from "@/lib/b2-crypto";
import { getCurrentUser } from "@/lib/auth";
import { mealBundleImagePath } from "@/lib/image-links";
import { prisma } from "@/lib/db";

export default async function MealBundlesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const [rows, foodRows] = await Promise.all([
    prisma.mealBundle.findMany({ where: { userId: user.id }, include: { items: true }, orderBy: { updatedAt: "desc" } }),
    prisma.savedFood.findMany({ where: { userId: user.id, archivedAt: null }, orderBy: [{ isFavorite: "desc" }, { lastUsedAt: "desc" }, { updatedAt: "desc" }] })
  ]);
  const bundles = rows.map((row) => {
    const bundle = decryptMealBundle(row);
    return {
      id: bundle.id,
      name: bundle.name,
      hasImage: bundle.hasImage,
      imageUrl: mealBundleImagePath(row),
      items: bundle.items.map((item) => ({
        savedFoodId: item.savedFoodId ?? null,
        name: item.name,
        estimatedAmount: item.estimatedAmount,
        calories: item.calories,
        protein: item.protein,
        fat: item.fat,
        carbs: item.carbs,
        aiRating: item.aiRating
      }))
    };
  });
  const foods = foodRows.map((row) => {
    const food = decryptSavedFood(row);
    return {
      id: food.id,
      name: food.name,
      estimatedAmount: food.estimatedAmount,
      calories: food.calories,
      protein: food.protein,
      fat: food.fat,
      carbs: food.carbs
    };
  });

  return <>
    <header className="mt-6">
      <h1 className="text-4xl font-black tracking-tight">我的餐組</h1>
      <p className="mt-1 text-sm text-stone-500">管理常吃組合、食譜，並在記錄餐點時一次帶入。</p>
    </header>
    <div className="mt-6"><MealBundlesManager initialBundles={bundles} foods={foods} /></div>
  </>;
}
