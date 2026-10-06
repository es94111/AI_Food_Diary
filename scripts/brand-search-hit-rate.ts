#!/usr/bin/env tsx
/**
 * SC-002 hit-rate measurement for brand nutrition-label search.
 *
 * Runs the exact two-step pipeline the product uses — Tavily web search, then
 * the AI judgement call (src/lib/web-search.ts + analyzeBrandSearchCandidates) —
 * against the 20 fixed samples listed in
 * specs/001-brand-nutrition-search/quickstart.md, and reports the hit rate.
 *
 * A sample counts as a "hit" when the pipeline returns at least one candidate
 * (`candidates.length >= 1`), matching SC-002's definition.
 *
 * Usage:
 *   TAVILY_API_KEY=... OPENAI_API_KEY=... npm run test:brand-search:hit-rate
 *   npm run test:brand-search:hit-rate -- --json out.json --report out.md
 *   npm run test:brand-search:hit-rate -- --replace ./my-samples.json
 *   npm run test:brand-search:hit-rate -- --dry-run        # print the plan only
 *
 * Options:
 *   --json <path>      Write raw per-sample results as JSON.
 *   --report <path>    Write a Markdown report.
 *   --replace <path>   JSON array of { brand, itemName, note? } replacing the
 *                      default list 1:1 (quickstart.md §SC-002 step 4 allows
 *                      swapping discontinued products; record the reason in
 *                      the `note` field).
 *   --threshold <n>    Pass mark in percent (default 85).
 *   --delay <ms>       Pause between samples (default 1200) to stay gentle on
 *                      the shared Tavily quota.
 *   --no-fail          Always exit 0, even below the threshold.
 *   --dry-run          Print samples and exit without any network call.
 *
 * Exit code: 0 when the hit rate meets the threshold, 1 otherwise (so CI or a
 * human can gate on it), 2 on configuration errors.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeBrandSearchCandidates, type AiConfig } from "../src/lib/ai";
import { webSearch } from "../src/lib/web-search";

type Sample = { brand: string; itemName: string; note?: string };

type SampleResult = {
  index: number;
  brand: string;
  itemName: string;
  note?: string;
  hit: boolean;
  candidateCount: number;
  firstCandidate: string | null;
  missingFields: string[];
  searchResultCount: number;
  query: string;
  error: string | null;
};

type Options = {
  jsonPath: string | null;
  reportPath: string | null;
  replacePath: string | null;
  threshold: number;
  delayMs: number;
  failOnThreshold: boolean;
  dryRun: boolean;
};

// Default sample list — verbatim from quickstart.md §"SC-002 驗證程序".
const DEFAULT_SAMPLES: Sample[] = [
  { brand: "光泉", itemName: "保久乳" },
  { brand: "統一", itemName: "科學麵" },
  { brand: "義美", itemName: "小泡芙" },
  { brand: "御茶園", itemName: "日式綠茶" },
  { brand: "舒跑", itemName: "運動飲料" },
  { brand: "可口可樂", itemName: "可樂" },
  { brand: "悅氏", itemName: "礦泉水" },
  { brand: "卡迪那", itemName: "洋芋片" },
  { brand: "黑松", itemName: "沙士" },
  { brand: "味丹", itemName: "多喝水" },
  { brand: "桂格", itemName: "大燕麥片" },
  { brand: "中興", itemName: "米粉" },
  { brand: "老協珍", itemName: "干貝醬" },
  { brand: "統一", itemName: "布丁" },
  { brand: "義美", itemName: "鮮奶" },
  { brand: "泰山", itemName: "仙草蜜" },
  { brand: "金車", itemName: "伯朗咖啡" },
  { brand: "白蘭氏", itemName: "雞精" },
  { brand: "波蜜", itemName: "果菜汁" },
  { brand: "統一", itemName: "麵包" }
];

function parseArgs(argv: string[]): Options {
  const options: Options = {
    jsonPath: null,
    reportPath: null,
    replacePath: null,
    threshold: 85,
    delayMs: 1200,
    failOnThreshold: true,
    dryRun: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => argv[++index];
    switch (arg) {
      case "--json": options.jsonPath = next(); break;
      case "--report": options.reportPath = next(); break;
      case "--replace": options.replacePath = next(); break;
      case "--threshold": options.threshold = Number(next()); break;
      case "--delay": options.delayMs = Number(next()); break;
      case "--no-fail": options.failOnThreshold = false; break;
      case "--dry-run": options.dryRun = true; break;
      default:
        if (arg.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (!Number.isFinite(options.threshold) || options.threshold < 0 || options.threshold > 100) {
    throw new Error("--threshold must be a number between 0 and 100");
  }
  if (!Number.isFinite(options.delayMs) || options.delayMs < 0) {
    throw new Error("--delay must be a non-negative number of milliseconds");
  }
  return options;
}

function loadSamples(replacePath: string | null): Sample[] {
  if (!replacePath) return DEFAULT_SAMPLES;
  const parsed: unknown = JSON.parse(readFileSync(resolve(replacePath), "utf8"));
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("--replace expects a non-empty JSON array of { brand, itemName }");
  }
  return parsed.map((entry, index) => {
    const candidate = entry as Record<string, unknown>;
    const brand = typeof candidate.brand === "string" ? candidate.brand.trim() : "";
    const itemName = typeof candidate.itemName === "string" ? candidate.itemName.trim() : "";
    if (!brand || !itemName) throw new Error(`--replace entry ${index + 1} needs non-empty brand and itemName`);
    return { brand, itemName, note: typeof candidate.note === "string" ? candidate.note : undefined };
  });
}

function aiConfigFromEnv(): AiConfig {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is required to run the AI judgement step");
  const baseUrl = process.env.OPENAI_BASE_URL?.trim() || process.env.OPENAI_API_BASE_URL?.trim() || "https://api.openai.com/v1";
  const textModel = process.env.OPENAI_TEXT_MODEL?.trim() || "gpt-4.1-mini";
  const visionModel = process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4.1-mini";
  // The AI judgement step only uses textModel; visionModel is part of the shared
  // config shape and is never exercised on this path.
  return { apiKey, baseUrl, textModel, visionModel, source: "operator" };
}

function queryFor(sample: Sample) {
  // Mirrors the route's query composition (src/app/api/foods/brand-search/route.ts).
  return `${sample.brand} ${sample.itemName} 營養標示`;
}

function formatResults(results: Array<{ title: string; content: string }>) {
  return results.map((result) => `【${result.title}】${result.content}`).join("\n\n");
}

function missingNutrition(candidate: { calories: number | null; protein: number | null; fat: number | null; carbs: number | null }) {
  const missing: string[] = [];
  if (candidate.calories === null) missing.push("calories");
  if (candidate.protein === null) missing.push("protein");
  if (candidate.fat === null) missing.push("fat");
  if (candidate.carbs === null) missing.push("carbs");
  return missing;
}

function sleep(ms: number) {
  return new Promise((done) => setTimeout(done, ms));
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

async function measure(sample: Sample, index: number, config: AiConfig): Promise<SampleResult> {
  const query = queryFor(sample);
  const base: SampleResult = {
    index: index + 1,
    brand: sample.brand,
    itemName: sample.itemName,
    note: sample.note,
    hit: false,
    candidateCount: 0,
    firstCandidate: null,
    missingFields: [],
    searchResultCount: 0,
    query,
    error: null
  };

  try {
    const results = await webSearch(query);
    const { candidates } = await analyzeBrandSearchCandidates(config, {
      brand: sample.brand,
      itemName: sample.itemName,
      searchResultsText: formatResults(results)
    });
    return {
      ...base,
      hit: candidates.length >= 1,
      candidateCount: candidates.length,
      firstCandidate: candidates[0]?.name ?? null,
      missingFields: candidates[0] ? missingNutrition(candidates[0]) : [],
      searchResultCount: results.length
    };
  } catch (error) {
    return { ...base, error: errorMessage(error) };
  }
}

function percent(hits: number, total: number) {
  return total === 0 ? 0 : Math.round((hits / total) * 1000) / 10;
}

function renderReport(samples: Sample[], results: SampleResult[], threshold: number, generatedAt: string) {
  const hits = results.filter((result) => result.hit).length;
  const rate = percent(hits, samples.length);
  const errors = results.filter((result) => result.error !== null);
  const misses = results.filter((result) => !result.hit && result.error === null);
  const partial = results.filter((result) => result.hit && result.missingFields.length > 0);
  const verdict = rate >= threshold ? "PASS" : "FAIL";

  const rows = results.map((result) => {
    const outcome = result.hit ? "命中" : result.error ? "錯誤" : "查無";
    const detail = result.error ?? (result.hit ? `${result.firstCandidate ?? "（無名稱）"}（${result.candidateCount} 筆）` : "");
    return `| ${result.index} | ${result.brand} | ${result.itemName} | ${outcome} | ${result.candidateCount} | ${detail} |`;
  });

  const lines = [
    "# SC-002 品牌搜尋命中率驗證",
    "",
    `- 執行時間：${generatedAt}`,
    `- 樣本數：${samples.length}`,
    `- 命中筆數：${hits}`,
    `- **命中率：${rate}%（門檻 ${threshold}%）→ ${verdict}**`,
    `- 錯誤筆數：${errors.length}；查無結果筆數：${misses.length}`,
    `- 首筆候選有缺漏營養欄位：${partial.length} 筆（FR-008 允許，屬資訊而非失敗）`,
    "",
    "| # | 廠牌 | 品項 | 結果 | 候選筆數 | 首筆候選／錯誤訊息 |",
    "|---|---|---|---|---|---|",
    ...rows,
    ""
  ];

  if (misses.length > 0 || errors.length > 0) {
    lines.push("## 未命中清單（供後續調整查詢字串或判斷邏輯）", "");
    for (const result of [...misses, ...errors]) {
      lines.push(
        `- #${result.index} ${result.brand}／${result.itemName}：${result.error ?? "查無結果"}（搜尋結果 ${result.searchResultCount} 筆）` +
          (result.note ? `（替換原因：${result.note}）` : "")
      );
    }
    lines.push("");
  }

  return { text: lines.join("\n"), hits, rate, verdict };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const samples = loadSamples(options.replacePath);

  if (options.dryRun) {
    console.log(`Would measure ${samples.length} samples (threshold ${options.threshold}%):`);
    for (const [index, sample] of samples.entries()) {
      console.log(`  ${index + 1}. ${sample.brand}／${sample.itemName}  →  ${queryFor(sample)}`);
    }
    return;
  }

  if (!process.env.TAVILY_API_KEY?.trim()) {
    console.error("TAVILY_API_KEY is required (the search step cannot run without it).");
    process.exit(2);
  }
  const config = aiConfigFromEnv();

  const results: SampleResult[] = [];
  for (const [index, sample] of samples.entries()) {
    const result = await measure(sample, index, config);
    results.push(result);
    const outcome = result.hit ? `命中（${result.candidateCount} 筆）` : result.error ? `錯誤：${result.error}` : "查無結果";
    console.log(`[${index + 1}/${samples.length}] ${sample.brand}／${sample.itemName} → ${outcome}`);
    if (index < samples.length - 1 && options.delayMs > 0) await sleep(options.delayMs);
  }

  const generatedAt = new Date().toISOString();
  const report = renderReport(samples, results, options.threshold, generatedAt);
  console.log("");
  console.log(report.text);

  if (options.jsonPath) {
    writeFileSync(
      resolve(options.jsonPath),
      `${JSON.stringify({ generatedAt, threshold: options.threshold, hitRatePercent: report.rate, verdict: report.verdict, samples, results }, null, 2)}\n`
    );
    console.log(`JSON written to ${options.jsonPath}`);
  }
  if (options.reportPath) {
    writeFileSync(resolve(options.reportPath), `${report.text}\n`);
    console.log(`Markdown report written to ${options.reportPath}`);
  }

  if (report.rate < options.threshold && options.failOnThreshold) {
    console.error(`Hit rate ${report.rate}% is below the ${options.threshold}% threshold.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exit(2);
});
