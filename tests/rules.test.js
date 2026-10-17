import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { RuleTester } from "eslint";
import plugin from "../src/index.js";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const appFile = path.join(fixtures, "app", "src", "index.js");
const nestedFile = path.join(fixtures, "nested", "pkg", "src", "index.js");

// A folder with no .env.example anywhere above it.
const lonelyDir = fs.mkdtempSync(path.join(os.tmpdir(), "env-example-test-"));
const lonelyFile = path.join(lonelyDir, "index.js");
after(() => fs.rmSync(lonelyDir, { recursive: true, force: true }));

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: "latest", sourceType: "module" },
});

const appEnv = path.relative(process.cwd(), path.join(fixtures, "app", ".env.example"));

const undeclared = plugin.rules["no-undeclared-env"];
const dynamic = plugin.rules["no-dynamic-env"];

ruleTester.run("no-undeclared-env", undeclared, {
  valid: [
    // Declared in tests/fixtures/app/.env.example (CRLF line endings).
    { code: "process.env.API_URL", filename: appFile },
    { code: "process.env['DATABASE_URL']", filename: appFile },
    { code: "process.env[`FEATURE_FLAG`]", filename: appFile },
    { code: "process.env?.API_URL", filename: appFile },
    { code: "process['env'].API_URL", filename: appFile },
    // Commented-out assignments count as documented optional variables.
    { code: "process.env.OPTIONAL_TOKEN", filename: appFile },
    { code: "import.meta.env.VITE_PUBLIC_KEY", filename: appFile },
    { code: "Bun.env.API_URL", filename: appFile },
    { code: "Deno.env.get('API_URL')", filename: appFile },
    { code: "const { API_URL, DATABASE_URL: db, ...rest } = process.env", filename: appFile },
    { code: "let API_URL; ({ API_URL } = process.env)", filename: appFile },
    // Always allowed.
    { code: "process.env.NODE_ENV", filename: appFile },
    { code: "import.meta.env.MODE; import.meta.env.DEV; import.meta.env.BASE_URL", filename: appFile },
    // Writes and deletes are not reads.
    { code: "process.env.SET_AT_RUNTIME = 'x'", filename: appFile },
    { code: "delete process.env.SET_AT_RUNTIME", filename: appFile },
    { code: "process.env.COUNTER++", filename: appFile },
    // Dynamic keys are left to no-dynamic-env.
    { code: "process.env[name]", filename: appFile },
    // Not env objects.
    { code: "config.env.API_KEY; process.envy.X; foo.process.env", filename: appFile },
    { code: "Deno.env.set('X', '1'); other.env.get('X')", filename: appFile },
    // allow option, with exact names and prefix patterns.
    { code: "process.env.CI", filename: appFile, options: [{ allow: ["CI"] }] },
    { code: "process.env.npm_package_version", filename: appFile, options: [{ allow: ["npm_*"] }] },
    // Nearest file wins; a BOM is ignored.
    { code: "process.env.NESTED_ONLY", filename: nestedFile },
    // envFile option: one path or several, relative to cwd.
    {
      code: "process.env.EXTRA_ONE",
      filename: lonelyFile,
      options: [{ envFile: path.join(fixtures, "extra.env") }],
    },
    {
      code: "process.env.EXTRA_ONE + process.env.ROOT_VAR",
      filename: lonelyFile,
      options: [
        {
          envFile: [
            path.relative(process.cwd(), path.join(fixtures, "extra.env")),
            path.join(fixtures, "nested", ".env.example"),
          ],
        },
      ],
    },
    // No env reads means no env file is needed.
    { code: "const x = 1;", filename: lonelyFile },
    { code: "", filename: lonelyFile },
  ],
  invalid: [
    {
      code: "process.env.MISSING",
      filename: appFile,
      errors: [
        {
          messageId: "undeclared",
          data: {
            name: "MISSING",
            source: "process.env",
            file: appEnv,
          },
        },
      ],
    },
    {
      code: "import.meta.env.VITE_SECRET; Bun.env.B; Deno.env.get('D'); const { E } = process.env",
      filename: appFile,
      errors: [
        { messageId: "undeclared", data: { name: "VITE_SECRET", source: "import.meta.env", file: appEnv } },
        { messageId: "undeclared", data: { name: "B", source: "Bun.env", file: appEnv } },
        { messageId: "undeclared", data: { name: "D", source: "Deno.env.get()", file: appEnv } },
        { messageId: "undeclared", data: { name: "E", source: "process.env", file: appEnv } },
      ],
    },
    // MODE is only a built-in on import.meta.env.
    { code: "process.env.MODE", filename: appFile, errors: [{ messageId: "undeclared" }] },
    // Prose comments do not declare variables.
    { code: "process.env.Not", filename: appFile, errors: [{ messageId: "undeclared" }] },
    // The nearer file hides the parent's variables.
    { code: "process.env.ROOT_VAR", filename: nestedFile, errors: [{ messageId: "undeclared" }] },
    // Prefix patterns only match their prefix.
    {
      code: "process.env.npmX",
      filename: appFile,
      options: [{ allow: ["npm_*"] }],
      errors: [{ messageId: "undeclared" }],
    },
    // Missing env file: reported once per file, on the first read.
    {
      code: "process.env.A; process.env.B",
      filename: lonelyFile,
      errors: [{ messageId: "noEnvFile", line: 1, column: 1 }],
    },
    {
      code: "process.env.A; process.env.B",
      filename: lonelyFile,
      options: [{ envFile: "does-not-exist.env" }],
      errors: [
        {
          messageId: "unreadableEnvFile",
          data: { file: "does-not-exist.env", reason: "the file does not exist", cwd: process.cwd() },
        },
      ],
    },
    {
      code: "process.env.A",
      filename: lonelyFile,
      options: [{ envFile: fixtures }],
      errors: [
        {
          messageId: "unreadableEnvFile",
          data: { file: fixtures, reason: "the path is not a file", cwd: process.cwd() },
        },
      ],
    },
  ],
});

ruleTester.run("no-dynamic-env", dynamic, {
  valid: [
    "process.env.API_URL",
    "process.env['API_URL']",
    "process.env[`API_URL`]",
    "Deno.env.get('API_URL')",
    "const { API_URL } = process.env",
    "process.env[key] = value",
    "spawn(cmd, { env: process.env })",
    "const env = { ...process.env }",
    "obj[key]",
  ],
  invalid: [
    { code: "process.env[key]", errors: [{ messageId: "dynamic", data: { source: "process.env" } }] },
    { code: "process.env[`VITE_${name}`]", errors: [{ messageId: "dynamic" }] },
    { code: "import.meta.env[k]", errors: [{ messageId: "dynamic", data: { source: "import.meta.env" } }] },
    { code: "Bun.env[k]", errors: [{ messageId: "dynamic" }] },
    { code: "Deno.env.get(name)", errors: [{ messageId: "dynamic", data: { source: "Deno.env.get()" } }] },
    { code: "Deno.env.get()", errors: [{ messageId: "dynamic" }] },
    { code: "const { [key]: v } = process.env", errors: [{ messageId: "dynamic" }] },
  ],
});
