import assert from "node:assert/strict";
import { test } from "node:test";

process.env.AUTH_SECRET = "test-only-secret-that-is-longer-than-thirty-two-bytes";

import { publicImageOrigin, resolvePreviewVisionImages, resolveVisionImageInputs } from "../../src/lib/vision-images";

test("with a public origin, object keys resolve to short-lived ai-scope URLs", async () => {
  process.env.APP_PUBLIC_URL = "https://aifood.example.com/";
  try {
    assert.equal(publicImageOrigin(), "https://aifood.example.com");
    const inputs = await resolveVisionImageInputs(["meals/u1/a.jpg", "meals/u1/b.png"]);
    assert.equal(inputs.length, 2);
    assert.ok(inputs.every((i) => i.kind === "url"));
    assert.ok(inputs.every((i) => i.value.startsWith("https://aifood.example.com/api/images/ai?")));
    // The bucket key must never be exposed as a raw public object URL.
    assert.ok(inputs.every((i) => !i.value.includes("minio")));
  } finally {
    delete process.env.APP_PUBLIC_URL;
  }
});

test("without a public origin, legacy inline data URLs pass through untouched", async () => {
  delete process.env.APP_PUBLIC_URL;
  assert.equal(publicImageOrigin(), null);
  const legacy = "data:image/png;base64,AAAA";
  const inputs = await resolveVisionImageInputs([legacy]);
  assert.deepEqual(inputs, [{ kind: "dataUrl", value: legacy }]);
});

test("preview resolution stores nothing when no public origin is configured", async () => {
  delete process.env.APP_PUBLIC_URL;
  const dataUrls = ["data:image/png;base64,AAAA", "data:image/jpeg;base64,BBBB"];
  const preview = await resolvePreviewVisionImages(dataUrls, "u1");
  assert.deepEqual(preview.uploadedKeys, []);
  assert.deepEqual(preview.inputs, dataUrls.map((value) => ({ kind: "dataUrl", value })));
});
