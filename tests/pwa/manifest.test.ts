import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8")) as {
  display: string;
  start_url: string;
  icons: Array<{ src: string; sizes: string; type: string }>;
};

test("PWA manifest declares installable standalone entry and correctly sized icons", () => {
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/dashboard");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192" && icon.type === "image/png"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.type === "image/png"));
  for (const icon of manifest.icons) {
    const image = readFileSync(`public${icon.src}`);
    assert.equal(image.subarray(1, 4).toString(), "PNG");
  }
});
