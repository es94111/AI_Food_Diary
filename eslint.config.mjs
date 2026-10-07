import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextRequire = createRequire(require.resolve("eslint-config-next"));
// Resolve React's version directly instead of plugin auto-detection, which uses removed ESLint context APIs.
const react = require("react");
const eslintRequire = createRequire(require.resolve("eslint"));
const { Variable } = eslintRequire("eslint-scope");
const nextParser = nextRequire("./parser");
// Use Next's Babel parser for TypeScript 7 and adapt its scope manager for ESLint 10.
const parser = {
  ...nextParser,
  parseForESLint(code, options) {
    const result = nextParser.parseForESLint(code, options);
    const scopeManager = result.scopeManager;

    if (scopeManager && typeof scopeManager.addGlobals !== "function") {
      scopeManager.addGlobals = (names) => {
        const globalScope = scopeManager.globalScope;

        for (const name of names) {
          if (!globalScope.set.has(name)) {
            const variable = new Variable(name, globalScope);
            globalScope.set.set(name, variable);
            globalScope.variables.push(variable);
          }
        }

        const namesSet = new Set(names);
        globalScope.through = globalScope.through.filter((reference) => {
          if (!namesSet.has(reference.identifier.name)) return true;

          const variable = globalScope.set.get(reference.identifier.name);
          reference.resolved = variable;
          variable.references.push(reference);
          return false;
        });

        if (globalScope.implicit) {
          globalScope.implicit.variables = globalScope.implicit.variables.filter((variable) => {
            if (!namesSet.has(variable.name)) return true;

            globalScope.implicit.set.delete(variable.name);
            return false;
          });
          globalScope.implicit.left = globalScope.implicit.left.filter(
            (reference) => !namesSet.has(reference.identifier.name),
          );
        }
      };
    }

    return result;
  },
};
const nextPlugin = nextRequire("@next/eslint-plugin-next");
const reactPlugin = nextRequire("eslint-plugin-react");
const reactHooksPlugin = nextRequire("eslint-plugin-react-hooks");
const importPlugin = nextRequire("eslint-plugin-import");
const jsxA11yPlugin = nextRequire("eslint-plugin-jsx-a11y");
const globals = nextRequire("globals");

const config = [
  {
    name: "next/core-web-vitals",
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      import: importPlugin,
      "jsx-a11y": jsxA11yPlugin,
      "@next/next": nextPlugin,
    },
    languageOptions: {
      parser,
      parserOptions: {
        requireConfigFile: false,
        sourceType: "module",
        allowImportExportEverywhere: true,
        babelOptions: {
          presets: ["next/babel"],
          caller: { supportsTopLevelAwait: true },
        },
      },
      globals: { ...globals.browser, ...globals.node },
    },
    settings: {
      react: { version: react.version },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      "import/no-anonymous-default-export": "warn",
      "react/no-unknown-property": "off",
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "jsx-a11y/alt-text": ["warn", { elements: ["img"], img: ["Image"] }],
      "jsx-a11y/aria-props": "warn",
      "jsx-a11y/aria-proptypes": "warn",
      "jsx-a11y/aria-unsupported-elements": "warn",
      "jsx-a11y/role-has-required-aria-props": "warn",
      "jsx-a11y/role-supports-aria-props": "warn",
      "react/jsx-no-target-blank": "off",
    },
  },
  {
    ignores: [".next/**", "out/**", "build/**", "next-env.d.ts", "src/generated/prisma/**"],
  },
];

export default config;
