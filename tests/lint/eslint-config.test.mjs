import assert from "node:assert/strict";
import { test } from "node:test";
import { ESLint } from "eslint";

test("ESLint parses TypeScript and TSX with the configured Next rules", async () => {
  const eslint = new ESLint();
  const config = await eslint.calculateConfigForFile("src/lint-coverage.ts");

  assert.equal(config.languageOptions.parser.meta.name, "eslint-config-next/parser");
  assert.equal(
    config.rules["@typescript-eslint/no-explicit-any"],
    undefined,
    "type-aware rules are unavailable until typescript-eslint supports TypeScript 7",
  );

  const [typescriptResult] = await eslint.lintText(
    "type Calories = number; export const calories: Calories = 120;",
    { filePath: "src/lint-coverage.ts" },
  );
  assert.equal(typescriptResult.fatalErrorCount, 0);

  const [tsxResult] = await eslint.lintText(
    [
      "type Props = { src: string };",
      "export function Preview({ src }: Props) {",
      '  return <img src={src} alt="preview" />;',
      "}",
    ].join("\n"),
    { filePath: "src/lint-coverage.tsx" },
  );

  assert.equal(tsxResult.fatalErrorCount, 0);
  assert.ok(tsxResult.messages.some(({ ruleId }) => ruleId === "@next/next/no-img-element"));
});
