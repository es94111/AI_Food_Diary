import assert from "node:assert/strict";
import { test } from "node:test";
import { ESLint } from "eslint";

test("ESLint parses TypeScript and TSX with the configured Next rules", async () => {
  const eslint = new ESLint();
  const config = await eslint.calculateConfigForFile("src/lint-coverage.ts");

  assert.equal(config.languageOptions.parser.meta.name, "eslint-config-next/parser");
  assert.ok(config.rules["@next/next/no-img-element"]);

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
