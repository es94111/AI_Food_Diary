import "server-only";
import { prisma } from "./db";
import { deleteImage, isStorageKey } from "./storage";

// A single object-storage key can be shared by several rows: a meal photo picked
// from a saved food references that food's image key directly (instead of being
// re-uploaded), and a saved food's photo can be reused across many meals. So a
// key must only be deleted from storage once nothing references it anymore.
//
// Call this AFTER the owning row has been updated/deleted, so the lingering
// references it counts are the *other* holders of the key.
export async function deleteImageIfUnreferenced(key: string): Promise<void> {
  // Legacy data-URL "keys" aren't stored as S3 objects; nothing to delete.
  if (!isStorageKey(key)) return;

  const [savedCount, mealCount] = await Promise.all([
    prisma.savedFood.count({ where: { imageStorageKey: key } }),
    prisma.meal.count({
      where: { OR: [{ imageStorageKey: key }, { imageStorageKeys: { has: key } }] }
    })
  ]);

  if (savedCount + mealCount > 0) return; // still referenced — keep the object

  await deleteImage(key).catch((err) => console.error("Failed to delete image from storage", err));
}
