import assert from "node:assert/strict";
import { test } from "node:test";

process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.AUTH_SECRET = "test-only-secret-that-is-longer-than-thirty-two-bytes";
process.env.MCP_OAUTH_SECRET =
  "test-only-mcp-secret-that-is-longer-than-thirty-two-bytes";

import { assertSafeImageUrl } from "../../src/lib/mcp/meal-images";
import { McpApplicationError } from "../../src/lib/mcp/errors";
import { fetchWithPinnedPublicAddress } from "../../src/lib/url-guard";

function rejects(url: string) {
  assert.throws(() => assertSafeImageUrl(url), McpApplicationError);
}

test("assertSafeImageUrl accepts a well-formed public https URL", () => {
  const url = assertSafeImageUrl("https://example.com/meal.jpg");
  assert.equal(url.hostname, "example.com");
});

test("assertSafeImageUrl rejects non-https schemes", () => {
  rejects("http://example.com/meal.jpg");
  rejects("ftp://example.com/meal.jpg");
  rejects("not a url at all");
});

test("assertSafeImageUrl rejects internal/reserved literal hosts", () => {
  rejects("https://127.0.0.1/meal.jpg");
  rejects("https://localhost/meal.jpg");
  rejects("https://169.254.169.254/latest/meta-data");
  rejects("https://10.0.0.5/meal.jpg");
  rejects("https://192.168.1.1/meal.jpg");
  rejects("https://[::1]/meal.jpg");
  rejects("https://[::ffff:7f00:1]/meal.jpg");
  rejects("https://[2001:db8::1]/meal.jpg");
  rejects("https://metadata.google.internal/meal.jpg");
  rejects("https://foo.internal/meal.jpg");
});

test("pinned outbound fetch rejects blocked targets before opening a connection", async () => {
  await assert.rejects(
    fetchWithPinnedPublicAddress("http://127.0.0.1/metadata"),
    /Unsafe outbound URL/
  );
  await assert.rejects(
    fetchWithPinnedPublicAddress("https://localhost/metadata"),
    /Unsafe outbound URL/
  );
});
