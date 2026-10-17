import path from "node:path";
import { envReadVisitor } from "../env-access.js";
import { DEFAULT_ENV_FILE, findEnvFile, readEnvFile } from "../env-file.js";

/** Names that are always allowed, whatever the source. */
const ALWAYS_ALLOWED = ["NODE_ENV"];

/** Names Vite (and compatible tools) define on `import.meta.env` by themselves. */
const IMPORT_META_BUILTINS = ["MODE", "BASE_URL", "PROD", "DEV", "SSR"];

/**
 * @typedef {object} Options
 * @property {string | string[]} [envFile] Env file(s) to read, resolved from ESLint's working
 *   directory. Defaults to the nearest `.env.example` above the linted file.
 * @property {string[]} [allow] Extra names to accept without a declaration. A trailing `*`
 *   matches any suffix, e.g. `"npm_*"`.
 */

/**
 * Turns the `allow` list into a matcher. Entries ending in `*` match by prefix.
 *
 * @param {string[]} allow
 * @returns {(name: string) => boolean}
 */
function makeAllowMatcher(allow) {
  const exact = new Set(allow.filter((entry) => !entry.endsWith("*")));
  const prefixes = allow.filter((entry) => entry.endsWith("*")).map((entry) => entry.slice(0, -1));
  return (name) => exact.has(name) || prefixes.some((prefix) => name.startsWith(prefix));
}

/**
 * Formats a path for messages: relative to the working directory when that is shorter.
 *
 * @param {string} cwd
 * @param {string} file
 * @returns {string}
 */
function displayPath(cwd, file) {
  const relative = path.relative(cwd, file);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? relative : file;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Require every environment variable the code reads to be listed in .env.example",
      recommended: true,
      url: "https://github.com/acus9345/eslint-plugin-env-example/blob/main/docs/rules/no-undeclared-env.md",
    },
    schema: [
      {
        type: "object",
        properties: {
          envFile: {
            anyOf: [
              { type: "string", minLength: 1 },
              { type: "array", items: { type: "string", minLength: 1 }, minItems: 1 },
            ],
          },
          allow: { type: "array", items: { type: "string", minLength: 1 }, uniqueItems: true },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      undeclared:
        '"{{name}}" is read from {{source}} but is not listed in {{file}}. Add a line "{{name}}=" to {{file}}, or add "{{name}}" to this rule\'s "allow" option.',
      noEnvFile:
        'No {{fileName}} found in "{{dir}}" or any folder above it, so {{source}} reads cannot be checked. Create {{fileName}} in your project root listing each variable (e.g. "API_URL="), or set this rule\'s "envFile" option.',
      unreadableEnvFile:
        'Could not use env file "{{file}}" from the "envFile" option: {{reason}}. Relative paths are resolved from "{{cwd}}"; fix the path or create the file.',
    },
  },

  create(context) {
    /** @type {Options} */
    const options = context.options[0] ?? {};
    const cwd = context.cwd;
    const isAllowed = makeAllowMatcher([...ALWAYS_ALLOWED, ...(options.allow ?? [])]);
    const isImportMetaBuiltin = makeAllowMatcher(IMPORT_META_BUILTINS);

    /**
     * Declared names plus a label for messages, or `null` once a setup problem has been
     * reported (so it is reported once per file, not once per read).
     *
     * @type {{ names: Set<string>, label: string } | null | undefined}
     */
    let declared;
    let setupReported = false;

    /**
     * Loads the declared names on first use. Reports a setup problem on `node` if the
     * env file cannot be found or read.
     *
     * @param {import("estree").Node} node
     * @param {string} source
     * @returns {{ names: Set<string>, label: string } | null}
     */
    function load(node, source) {
      if (declared !== undefined) return declared;

      if (options.envFile !== undefined) {
        const files = Array.isArray(options.envFile) ? options.envFile : [options.envFile];
        /** @type {Set<string>} */
        const names = new Set();
        for (const file of files) {
          const absolute = path.resolve(cwd, file);
          const result = readEnvFile(absolute);
          if (!result.ok) {
            if (!setupReported) {
              context.report({
                node,
                messageId: "unreadableEnvFile",
                data: { file, reason: result.reason, cwd },
              });
              setupReported = true;
            }
            declared = null;
            return declared;
          }
          for (const name of result.names) names.add(name);
        }
        declared = { names, label: files.join(", ") };
        return declared;
      }

      const startDir = path.dirname(path.resolve(cwd, context.filename));
      const found = findEnvFile(startDir);
      const result = found ? readEnvFile(found) : null;
      if (!found || !result?.ok) {
        context.report({
          node,
          messageId: "noEnvFile",
          data: { fileName: DEFAULT_ENV_FILE, dir: startDir, source },
        });
        setupReported = true;
        declared = null;
        return declared;
      }
      declared = { names: result.names, label: displayPath(cwd, found) };
      return declared;
    }

    return envReadVisitor(({ name, source, node }) => {
      // Computed keys are the job of the `no-dynamic-env` rule.
      if (name === null || isAllowed(name)) return;
      if (source === "import.meta.env" && isImportMetaBuiltin(name)) return;
      const env = load(node, source);
      if (!env || env.names.has(name)) return;
      context.report({ node, messageId: "undeclared", data: { name, source, file: env.label } });
    });
  },
};

export default rule;
