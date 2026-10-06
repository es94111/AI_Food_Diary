import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { parseBrandSearchAnalysis } from "../../src/lib/ai";
import { enforceBrandSearchRateLimit } from "../../src/lib/rate-limit";
import { findSavedFoodMatches, type SavedFoodMatchCandidate } from "../../src/lib/saved-food-matching";
import { brandSearchSchema } from "../../src/lib/validators";
import { WebSearchNotConfiguredError, WebSearchRequestError, webSearch } from "../../src/lib/web-search";

// Automated coverage for the brand-search (specs/001-brand-nutrition-search)
// acceptance rules that do not need a live provider, a database, or Redis.
// The parts that genuinely require live infrastructure are covered separately
// by quickstart.md (browser + Android) and scripts/brand-search-hit-rate.ts
// (SC-002 hit-rate measurement).

function runHitRateCli(args: string[]) {
  const env = { ...process.env };
  delete env.TAVILY_API_KEY;
  delete env.OPENAI_API_KEY;
  return spawnSync(
    process.execPath,
    ["--conditions=react-server", "--import", "tsx", "scripts/brand-search-hit-rate.ts", ...args],
    { cwd: process.cwd(), env, encoding: "utf8", timeout: 10_000 }
  );
}

test("hit-rate CLI rejects missing option values before configuration or network access", () => {
  for (const option of ["--json", "--report", "--replace", "--threshold", "--delay"]) {
    const result = runHitRateCli([option]);
    assert.equal(result.status, 2, `${option} should fail: ${result.stderr}`);
    assert.match(result.stderr, new RegExp(`${option} requires a value`));
    assert.doesNotMatch(result.stderr, /TAVILY_API_KEY is required/);
  }
});

test("replacement samples must preserve the 20-item SC-002 denominator", () => {
  const dir = mkdtempSync(join(tmpdir(), "brand-search-hit-rate-"));
  const samplePath = join(dir, "samples.json");
  try {
    writeFileSync(samplePath, JSON.stringify([{ brand: "測試品牌", itemName: "測試品項" }]));
    const result = runHitRateCli(["--replace", samplePath, "--dry-run"]);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /--replace expects exactly 20 samples/);
    assert.doesNotMatch(result.stdout, /Would measure/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── FR-001: both the brand and the item name are required ───────────────────

test("brand-search rejects a request missing either field (FR-001)", () => {
  assert.throws(() => brandSearchSchema.parse({ brand: "光泉" }));
  assert.throws(() => brandSearchSchema.parse({ itemName: "保久乳" }));
  assert.throws(() => brandSearchSchema.parse({}));
});

test("brand-search rejects whitespace-only or over-long input (FR-001)", () => {
  assert.throws(() => brandSearchSchema.parse({ brand: "   ", itemName: "保久乳" }));
  assert.throws(() => brandSearchSchema.parse({ brand: "光泉", itemName: "  " }));
  assert.throws(() => brandSearchSchema.parse({ brand: "x".repeat(81), itemName: "保久乳" }));
  assert.throws(() => brandSearchSchema.parse({ brand: "光泉", itemName: "x".repeat(121) }));
});

test("brand-search trims a valid brand + item name", () => {
  const parsed = brandSearchSchema.parse({ brand: "  光泉 ", itemName: " 保久乳  " });
  assert.deepEqual(parsed, { brand: "光泉", itemName: "保久乳" });
});

// ── FR-008 / FR-004 / FR-007: model output normalisation ───────────────────

test("missing nutrition fields stay null instead of becoming 0 (FR-008)", () => {
  const { candidates } = parseBrandSearchAnalysis(
    JSON.stringify({ candidates: [{ name: "光泉保久乳", packageInfo: "每瓶 245ml", calories: 132, protein: null }] })
  );
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].calories, 132);
  assert.equal(candidates[0].protein, null);
  assert.equal(candidates[0].fat, null);
  assert.equal(candidates[0].carbs, null);
});

test("empty-string and non-numeric nutrition values normalise to null (FR-008)", () => {
  const { candidates } = parseBrandSearchAnalysis(
    JSON.stringify({ candidates: [{ name: "科學麵", calories: "", fat: "未知", carbs: "12" }] })
  );
  assert.equal(candidates[0].calories, null);
  assert.equal(candidates[0].fat, null);
  assert.equal(candidates[0].carbs, 12);
});

test("no more than five candidates are returned (FR-004)", () => {
  const many = Array.from({ length: 7 }, (_, index) => ({ name: `候選 ${index + 1}`, calories: 100 }));
  const { candidates } = parseBrandSearchAnalysis(JSON.stringify({ candidates: many }));
  assert.equal(candidates.length, 5);
  assert.equal(candidates[0].name, "候選 1");
  assert.equal(candidates[4].name, "候選 5");
});

test("no search results yields an empty candidate list, not an error (FR-007)", () => {
  assert.deepEqual(parseBrandSearchAnalysis(JSON.stringify({ candidates: [] })).candidates, []);
  assert.deepEqual(parseBrandSearchAnalysis(JSON.stringify({})).candidates, []);
});

test("alternate key names from the model are still accepted", () => {
  const { candidates } = parseBrandSearchAnalysis(
    JSON.stringify({ 候選: [{ 品名: "統一布丁", 規格: "每杯 100g", 熱量: 110, 蛋白質: 2.2, 脂肪: 3.4, 碳水化合物: 18 }] })
  );
  assert.equal(candidates[0].name, "統一布丁");
  assert.equal(candidates[0].packageInfo, "每杯 100g");
  assert.deepEqual(
    { calories: candidates[0].calories, protein: candidates[0].protein, fat: candidates[0].fat, carbs: candidates[0].carbs },
    { calories: 110, protein: 2.2, fat: 3.4, carbs: 18 }
  );
});

test("a malformed candidate never fabricates nutrition (FR-008)", () => {
  const { candidates } = parseBrandSearchAnalysis(JSON.stringify({ candidates: ["not-an-object", { name: "" }] }));
  assert.equal(candidates[0].name, "未知品項");
  assert.equal(candidates[0].calories, null);
  assert.equal(candidates[1].name, "未知品項");
  assert.equal(candidates[1].packageInfo, null);
});

test("a JSON code fence from the model is unwrapped", () => {
  const { candidates } = parseBrandSearchAnalysis('```json\n{"candidates":[{"name":"悅氏礦泉水","calories":0}]}\n```');
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].name, "悅氏礦泉水");
  assert.equal(candidates[0].calories, 0);
});

test("unparseable model output is rejected rather than silently empty", () => {
  assert.throws(() => parseBrandSearchAnalysis("not json at all"));
});

// ── FR-011: search provider failure surfaces as a typed error ───────────────

test("search without TAVILY_API_KEY raises the not-configured error (503 path)", async () => {
  const previous = process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_API_KEY;
  try {
    await assert.rejects(() => webSearch("光泉 保久乳 營養標示"), WebSearchNotConfiguredError);
  } finally {
    if (previous === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = previous;
  }
});

test("a non-2xx search response raises the request error (502 path)", async () => {
  const previousKey = process.env.TAVILY_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.TAVILY_API_KEY = "test-key";
  globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
  try {
    await assert.rejects(() => webSearch("光泉 保久乳 營養標示"), WebSearchRequestError);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = previousKey;
  }
});

test("a successful search returns title/content/url triples and tolerates malformed rows", async () => {
  const previousKey = process.env.TAVILY_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.TAVILY_API_KEY = "test-key";
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ results: [{ title: "光泉保久乳", content: "每100毫升 熱量 54 大卡", url: "https://example.test/a" }, {}] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })) as typeof fetch;
  try {
    const results = await webSearch("光泉 保久乳 營養標示");
    assert.equal(results.length, 2);
    assert.deepEqual(results[0], { title: "光泉保久乳", content: "每100毫升 熱量 54 大卡", url: "https://example.test/a" });
    assert.deepEqual(results[1], { title: "", content: "", url: "" });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = previousKey;
  }
});

test("a response with no results key returns an empty array (FR-007), not a crash", async () => {
  const previousKey = process.env.TAVILY_API_KEY;
  const previousFetch = globalThis.fetch;
  process.env.TAVILY_API_KEY = "test-key";
  globalThis.fetch = (async () => new Response(JSON.stringify({}), { status: 200 })) as typeof fetch;
  try {
    assert.deepEqual(await webSearch("測試廠牌 XYZ999 不存在的品項 ABC 營養標示"), []);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = previousKey;
  }
});

// ── Operator quota protection (research.md §5) ──────────────────────────────

test("the shared operator search quota is capped per user using the memory-only limiter", async () => {
  const redisState = globalThis as typeof globalThis & { redisClient?: unknown };
  const previousRedisClient = redisState.redisClient;
  const previousRedisUrl = process.env.REDIS_URL;
  redisState.redisClient = null;
  delete process.env.REDIS_URL;
  try {
    const userId = `brand-search-test-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      assert.equal(await enforceBrandSearchRateLimit(userId), null, `attempt ${attempt} should be allowed`);
    }
    const limited = await enforceBrandSearchRateLimit(userId);
    assert.ok(limited, "the 11th attempt within the window should be limited");
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("Retry-After"), "600");
  } finally {
    if (previousRedisClient === undefined) delete redisState.redisClient;
    else redisState.redisClient = previousRedisClient;
    if (previousRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previousRedisUrl;
  }
});

// ── FR-012: same brand + similar item name is a duplicate on its own ────────

function candidate(overrides: Partial<SavedFoodMatchCandidate> = {}): SavedFoodMatchCandidate {
  return {
    id: "food-1",
    name: "光泉保久乳",
    estimatedAmount: "每瓶 245ml",
    calories: 132,
    protein: 6.4,
    fat: 6.4,
    carbs: 10,
    ...overrides
  };
}

function reasonsFor(input: SavedFoodMatchCandidate, foods: SavedFoodMatchCandidate[]) {
  const { matches } = findSavedFoodMatches(input, foods);
  return matches.map((match) => match.reason);
}

test("same brand + equal name is a brand duplicate even when nutrition differs (FR-012)", () => {
  const input = candidate({ brand: "光泉", calories: 200, protein: 9, fat: 9, carbs: 20 });
  const reasons = reasonsFor(input, [candidate({ id: "stored", brand: "光泉" })]);
  assert.deepEqual(reasons, ["brand"]);
});

test("same brand + substring name is a brand duplicate (FR-012)", () => {
  const input = candidate({ id: "in", name: "光泉 保久乳", brand: "光泉" });
  const reasons = reasonsFor(input, [candidate({ id: "stored", name: "光泉保久乳(全脂)", brand: "光泉" })]);
  assert.deepEqual(reasons, ["brand"]);
});

test("brand matching ignores spacing, case, punctuation and width differences (FR-012)", () => {
  const input = candidate({ id: "in", name: "KIRIN 午後紅茶", brand: "Kirin" });
  const reasons = reasonsFor(input, [candidate({ id: "stored", name: "ｋｉｒｉｎ午後紅茶", brand: "KIRIN" })]);
  assert.deepEqual(reasons, ["brand"]);
});

test("same brand but an unrelated item name is not a brand duplicate (FR-012)", () => {
  const input = candidate({ id: "in", name: "光泉保久乳", brand: "光泉" });
  const reasons = reasonsFor(input, [candidate({ id: "stored", name: "光泉豆漿", brand: "光泉" })]);
  assert.ok(!reasons.includes("brand"), `unexpected brand match: ${reasons.join(",")}`);
});

test("a stored food without a brand does not participate in brand matching (FR-012)", () => {
  const input = candidate({ id: "in", brand: "光泉" });
  const { matches } = findSavedFoodMatches(input, [candidate({ id: "stored", brand: null })]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].reason, "name");
});

test("an input without a brand does not trigger brand matching (FR-012)", () => {
  const input = candidate({ id: "in", brand: undefined });
  assert.ok(!reasonsFor(input, [candidate({ id: "stored", brand: "光泉" })]).includes("brand"));
});

test("different brands fall back to the pre-existing name/nutrition rules", () => {
  const input = candidate({ id: "in", brand: "統一" });
  const { matches } = findSavedFoodMatches(input, [candidate({ id: "stored", brand: "光泉" })]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].reason, "name");
});

test("existing duplicate detection is unchanged: barcode still wins and unrelated foods still miss", () => {
  const foods = [candidate({ id: "stored", brand: "光泉", barcode: "4710012345678" })];
  const barcodeHit = findSavedFoodMatches(
    candidate({ id: "in", brand: "光泉", barcode: "4710012345678" }),
    foods
  );
  assert.equal(barcodeHit.exactBarcode?.food.id, "stored");
  assert.equal(barcodeHit.matches.length, 0);

  const unrelated = findSavedFoodMatches(
    candidate({ id: "in", name: "烤雞便當", brand: "某便當店", calories: 700, protein: 30, fat: 25, carbs: 90 }),
    foods
  );
  assert.equal(unrelated.exactBarcode, undefined);
  assert.deepEqual(unrelated.matches, []);
});
