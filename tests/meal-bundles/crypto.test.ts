import assert from "node:assert/strict";
import { test } from "node:test";
import { decryptMealBundle, encryptMealBundleItemWrite } from "../../src/lib/b2-crypto";
import { encryptJson, resetEncryptionKeyRingCache } from "../../src/lib/encryption";

process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
resetEncryptionKeyRingCache();

test("meal bundle names and item descriptions are encrypted and decrypted at the boundary", () => {
  const encryptedItem = encryptMealBundleItemWrite({
    savedFoodId: "food-1",
    name: "白飯",
    estimatedAmount: "1 碗",
    calories: 280,
    protein: 5,
    fat: 1,
    carbs: 62
  });
  assert.equal("name" in encryptedItem, false);
  assert.equal("estimatedAmount" in encryptedItem, false);
  assert.notEqual(encryptedItem.encName, "白飯");
  assert.notEqual(encryptedItem.encEstimatedAmount, "1 碗");

  const bundle = decryptMealBundle({
    id: "bundle-1",
    encName: encryptJson("午餐組合"),
    imageStorageKey: "private/object-key",
    items: [encryptedItem]
  });
  assert.equal(bundle.name, "午餐組合");
  assert.equal(bundle.items[0].name, "白飯");
  assert.equal(bundle.items[0].estimatedAmount, "1 碗");
  assert.equal(bundle.items[0].savedFoodId, "food-1");
  assert.equal(bundle.hasImage, true);
  assert.equal("imageStorageKey" in bundle, false);
});
