const js = require("@eslint/js");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
  {
    ignores: ["coverage/**", "dist/**", "node_modules/**"]
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["src/**/*.ts", "tests/**/*.ts", "scripts/backfill-activity-events.ts", "scripts/poll-activity-events.ts"],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.json", "./tsconfig.test.json", "./tsconfig.scripts.json"],
        tsconfigRootDir: __dirname
      }
    },
    rules: {
      "no-console": "off"
    }
  }
);
