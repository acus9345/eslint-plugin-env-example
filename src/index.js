import { createRequire } from "node:module";
import noDynamicEnv from "./rules/no-dynamic-env.js";
import noUndeclaredEnv from "./rules/no-undeclared-env.js";

const { name, version } = createRequire(import.meta.url)("../package.json");

/**
 * @typedef {object} EnvExamplePlugin
 * @property {{ name: string, version: string, namespace: string }} meta
 * @property {Record<"no-undeclared-env" | "no-dynamic-env", import("eslint").Rule.RuleModule>} rules
 * @property {{ recommended: import("eslint").Linter.Config }} configs
 */

/**
 * ESLint plugin that keeps the environment variables your code reads in sync with
 * `.env.example`.
 *
 * @example
 * // eslint.config.js
 * import envExample from "eslint-plugin-env-example";
 * export default [envExample.configs.recommended];
 *
 * @type {EnvExamplePlugin}
 */
const plugin = {
  meta: { name, version, namespace: "env-example" },
  rules: {
    "no-undeclared-env": noUndeclaredEnv,
    "no-dynamic-env": noDynamicEnv,
  },
  configs: {
    recommended: {
      name: "env-example/recommended",
      plugins: {},
      rules: {
        "env-example/no-undeclared-env": "error",
        "env-example/no-dynamic-env": "warn",
      },
    },
  },
};

// Set after creation because the config refers back to the plugin object.
plugin.configs.recommended.plugins = { "env-example": plugin };

export default plugin;
