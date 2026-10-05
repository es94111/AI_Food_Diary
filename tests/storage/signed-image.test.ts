import assert from "node:assert/strict";
import { test } from "node:test";

process.env.AUTH_SECRET = "test-only-secret-that-is-longer-than-thirty-two-bytes";

import {
  defaultImageTtlMs,
  ownsStorageKey,
  parseSignedImageQuery,
  signImageKey,
  signedImageAbsoluteUrl,
  signedImagePath,
  verifyImageSignature,
} from "../../src/lib/storage";

test("a freshly signed key verifies for its own scope", () => {
  const ref = signImageKey("user", "meals/u1/photo.jpg");
  assert.equal(verifyImageSignature("user", ref), true);
});

test("scope is part of the signature: a user link never verifies as an ai link", () => {
  const userRef = signImageKey("user", "meals/u1/photo.jpg");
  const aiRef = signImageKey("ai", "meals/u1/photo.jpg");
  assert.equal(verifyImageSignature("user", userRef), true);
  assert.equal(verifyImageSignature("ai", userRef), false);
  assert.equal(verifyImageSignature("ai", aiRef), true);
  assert.equal(verifyImageSignature("user", aiRef), false);
});

test("tampered key, signature, or expiry is rejected", () => {
  const ref = signImageKey("user", "meals/u1/photo.jpg");
  assert.equal(verifyImageSignature("user", { ...ref, key: "meals/u1/other.jpg" }), false);
  assert.equal(verifyImageSignature("user", { ...ref, signature: "deadbeef" }), false);
  assert.equal(verifyImageSignature("user", { ...ref, expiresAt: ref.expiresAt + 60_000 }), false);
});

test("an expired link is rejected", () => {
  const ref = signImageKey("user", "meals/u1/photo.jpg", -1_000);
  assert.equal(verifyImageSignature("user", ref), false);
});

test("signature is keyed by AUTH_SECRET (a different secret cannot forge one)", () => {
  const ref = signImageKey("user", "meals/u1/photo.jpg");
  process.env.AUTH_SECRET = "another-secret-that-is-also-longer-than-thirty-two-bytes";
  try {
    assert.equal(verifyImageSignature("user", ref), false);
  } finally {
    process.env.AUTH_SECRET = "test-only-secret-that-is-longer-than-thirty-two-bytes";
  }
});

test("ai links are shorter lived than user links", () => {
  assert.ok(defaultImageTtlMs("ai") < defaultImageTtlMs("user"));
});

test("ownership requires the caller's own key prefix", () => {
  assert.equal(ownsStorageKey("meals/u1/photo.jpg", "u1"), true);
  assert.equal(ownsStorageKey("meals/u2/photo.jpg", "u1"), false);
  // Path-traversal-shaped keys must not pass the prefix check.
  assert.equal(ownsStorageKey("meals/u1/../u2/photo.jpg", "u1"), false);
  assert.equal(ownsStorageKey("/meals/u1/photo.jpg", "u1"), false);
  // Legacy inline data URLs are not object keys at all.
  assert.equal(ownsStorageKey("data:image/png;base64,AAAA", "u1"), false);
});

test("query round-trips through the streaming path and back", () => {
  const path = signedImagePath("user", "meals/u1/photo.jpg");
  assert.match(path, /^\/api\/images\?/);
  const ref = parseSignedImageQuery(new URL(path, "https://example.com"));
  assert.ok(ref);
  assert.equal(ref.key, "meals/u1/photo.jpg");
  assert.equal(verifyImageSignature("user", ref), true);

  const aiPath = signedImagePath("ai", "meals/u1/photo.jpg");
  assert.match(aiPath, /^\/api\/images\/ai\?/);

  const absolute = signedImageAbsoluteUrl("https://aifood.example.com/", "ai", "meals/u1/photo.jpg");
  assert.match(absolute, /^https:\/\/aifood\.example\.com\/api\/images\/ai\?/);
});

test("a malformed query yields null rather than a partial ref", () => {
  assert.equal(parseSignedImageQuery(new URL("https://example.com/api/images")), null);
  assert.equal(parseSignedImageQuery(new URL("https://example.com/api/images?k=meals/u1/a.jpg&s=x")), null);
  assert.equal(parseSignedImageQuery(new URL("https://example.com/api/images?k=meals/u1/a.jpg&e=abc&s=x")), null);
});
