# eslint-plugin-env-example

ESLint rules that catch environment variables your code reads but `.env.example` doesn't list.

[![npm](https://img.shields.io/npm/v/eslint-plugin-env-example)](https://www.npmjs.com/package/eslint-plugin-env-example)
[![CI](https://github.com/acus9345/eslint-plugin-env-example/actions/workflows/ci.yml/badge.svg)](https://github.com/acus9345/eslint-plugin-env-example/actions/workflows/ci.yml)

Someone adds `process.env.STRIPE_KEY` and forgets to add it to `.env.example`. The app works on
their machine, then breaks for everyone else. This plugin turns that into a lint error:

```text
src/pay.js
  3:27  error  "STRIPE_KEY" is read from process.env but is not listed in .env.example.
               Add a line "STRIPE_KEY=" to .env.example, or add "STRIPE_KEY" to this rule's
               "allow" option  env-example/no-undeclared-env
```

It understands `process.env.X`, `process.env["X"]`, `const { X } = process.env`,
`import.meta.env.X` (Vite), `Bun.env.X` and `Deno.env.get("X")`.

## Install

```sh
npm install --save-dev eslint eslint-plugin-env-example
```

Requires ESLint 9 or newer (flat config) and Node.js 22.13+ or 24+.

## Quick start

Run these in an empty folder, in PowerShell, cmd or bash:

```sh
npm init -y
npm install --save-dev eslint eslint-plugin-env-example
```

Create `eslint.config.mjs`:

```js
import envExample from "eslint-plugin-env-example";

export default [envExample.configs.recommended];
```

Create `.env.example`:

```sh
API_URL=https://api.example.com
```

Create `app.js`:

```js
console.log(process.env.API_URL, process.env.API_TOKEN);
```

Then run:

```sh
npx eslint app.js
```

ESLint reports `API_TOKEN`, because `.env.example` doesn't list it. Add `API_TOKEN=` to
`.env.example` and run the command again; the error is gone.

> The `.mjs` extension makes the config load as an ES module whatever your `package.json` says.
> If your `package.json` has `"type": "module"`, you can name it `eslint.config.js` instead.

## Rules

| Rule | In `recommended` | What it does |
| --- | --- | --- |
| [`env-example/no-undeclared-env`](docs/rules/no-undeclared-env.md) | error | Every env variable the code reads must be listed in `.env.example`. |
| [`env-example/no-dynamic-env`](docs/rules/no-dynamic-env.md) | warn | Flags reads with keys computed at runtime (`process.env[name]`), which can't be checked. |

### Which `.env.example` is used?

By default, the nearest `.env.example` in the linted file's folder or any folder above it. In a
monorepo, each package can have its own, and packages without one fall back to the root file.

### How `.env.example` is read

```sh
API_URL=https://api.example.com   # KEY=value
export DATABASE_URL=              # export prefix is fine
FEATURE_FLAG                      # a bare name counts too
# SENTRY_DSN=                     # commented-out assignments count as documented (optional) variables
# Any other comment is ignored
```

Blank lines, a UTF-8 BOM and Windows (CRLF) line endings are handled.

### Options

Both options belong to `no-undeclared-env`:

```js
import envExample from "eslint-plugin-env-example";

export default [
  envExample.configs.recommended,
  {
    rules: {
      "env-example/no-undeclared-env": [
        "error",
        {
          // Use these files instead of the nearest .env.example.
          // Paths are resolved from the folder you run ESLint in.
          envFile: [".env.example", ".env.test.example"],
          // Names that never need declaring. A trailing * matches any suffix.
          allow: ["CI", "npm_*"],
        },
      ],
    },
  },
];
```

| Option | Type | Default |
| --- | --- | --- |
| `envFile` | `string \| string[]` | nearest `.env.example` above the linted file |
| `allow` | `string[]` | `[]` (plus the built-ins below) |

Always allowed: `NODE_ENV`. On `import.meta.env` only, Vite's built-ins are also allowed:
`MODE`, `BASE_URL`, `PROD`, `DEV`, `SSR`.

Writes such as `process.env.X = "1"` and `delete process.env.X` are not reads, so they're never reported.

### Using only one rule

```js
import envExample from "eslint-plugin-env-example";

export default [
  {
    plugins: { "env-example": envExample },
    rules: { "env-example/no-undeclared-env": "error" },
  },
];
```

### CommonJS config (`eslint.config.cjs`)

```js
const envExample = require("eslint-plugin-env-example").default;

module.exports = [envExample.configs.recommended];
```

### TypeScript

Types ship with the package, so `eslint.config.ts` works. To lint `.ts` files, add a TypeScript
parser (e.g. `typescript-eslint`) as you normally would; the rules work on its AST unchanged.

## Troubleshooting

**`No .env.example found in "…" or any folder above it`.** The rule couldn't find a file to check
against. Create `.env.example` in your project root, or point the `envFile` option at the file
you use (for example `".env.sample"`).

**`Could not use env file "…" from the "envFile" option`.** The path in `envFile` doesn't exist
or is a folder. Relative paths are resolved from the folder you run ESLint in (shown in the
message), not from the config file's folder.

**A variable is set by the platform, not by you** (e.g. `CI`, `VERCEL_URL`, `npm_package_version`).
Add it to `allow`, using a trailing `*` for whole families: `allow: ["CI", "VERCEL_*", "npm_*"]`.

**`ConfigError: … Key "plugins": Cannot redefine plugin "env-example"`.** You registered the plugin twice
under the same name with different objects. Use `envExample.configs.recommended` once, or define
`plugins: { "env-example": envExample }` yourself, not both from different imports.

**Changes to `.env.example` don't show up in your editor.** The file is re-read when it changes on disk,
but some editor integrations cache lint results. Restart the ESLint server in your editor.

## License

[MIT](LICENSE)
