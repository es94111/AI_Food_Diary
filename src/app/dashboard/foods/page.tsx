import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptSavedFood } from "@/lib/b2-crypto";
import { SavedFoodsManager, type SavedFoodSource } from "@/components/saved-foods-manager";

export default async function SavedFoodsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const savedFoods = await prisma.savedFood.findMany({
    where: { userId: user.id, archivedAt: null },
    orderBy: [{ isFavorite: "desc" }, { lastUsedAt: "desc" }, { useCount: "desc" }, { updatedAt: "desc" }]
  });

  return (
    <>
      <header className="mt-6">
        <h1 className="text-4xl font-black tracking-tight">我的食物</h1>
        <p className="mt-1 text-sm text-stone-500">集中管理收藏、條碼、封存與需要整理的食物。</p>
      </header>
      <div className="mt-6">
        <SavedFoodsManager initialFoods={savedFoods.map((row) => {
          const food = decryptSavedFood(row);
          return {
            id: food.id,
            barcode: food.barcode,
            name: food.name,
            estimatedAmount: food.estimatedAmount,
            calories: food.calories,
            protein: food.protein,
            fat: food.fat,
            carbs: food.carbs,
            source: food.source as SavedFoodSource,
            isFavorite: food.isFavorite,
            useCount: food.useCount,
            lastUsedAt: food.lastUsedAt?.toISOString() ?? null,
            createdAt: food.createdAt?.toISOString() ?? null,
            updatedAt: food.updatedAt?.toISOString() ?? null,
            archivedAt: food.archivedAt?.toISOString() ?? null,
            hasImage: food.hasImage
          };
        })} />
      </div>
    </>
  );
}
