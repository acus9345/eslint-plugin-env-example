import js from "@eslint/js";
import envExample from "./src/index.js";

export default [
  { ignores: ["types/", "tests/fixtures/"] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { process: "readonly", console: "readonly", performance: "readonly", Buffer: "readonly" },
    },
  },
  // Dogfood: this repo's own env reads must be listed in .env.example.
  envExample.configs.recommended,
];
