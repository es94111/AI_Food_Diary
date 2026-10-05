import assert from "node:assert/strict";
import { test } from "node:test";
import { sentryDataCollection } from "../../src/lib/sentry-privacy";

test("Sentry does not collect URL query params containing signed image credentials", () => {
  assert.equal(sentryDataCollection.urlQueryParams, false);
});
