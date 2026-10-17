# env-example/no-undeclared-env

Require every environment variable the code reads to be listed in `.env.example`.

✅ Enabled as `error` in `recommended`.

## Why

`.env.example` is how a project tells new contributors, CI and deploy targets which variables
to set. When code starts reading a variable that the file doesn't mention, the app breaks
somewhere else, often late and with an unhelpful error. This rule catches it at lint time.

## Examples

With this `.env.example`:

```sh
API_URL=
# SENTRY_DSN=
```

❌ Incorrect:

```js
fetch(process.env.API_URL + "/pay", { headers: { key: process.env.STRIPE_KEY } });
const { DATABASE_URL } = process.env;
import.meta.env.VITE_SECRET;
```

✅ Correct:

```js
fetch(process.env.API_URL);
process.env.SENTRY_DSN; // commented-out assignments count as documented
process.env.NODE_ENV; // always allowed
import.meta.env.MODE; // Vite built-in
process.env.TMP_DIR = "/tmp"; // a write, not a read
```

## Recognised reads

`process.env.X`, `process.env["X"]`, ``process.env[`X`]``, `process.env?.X`,
`const { X } = process.env`, `({ X } = process.env)`, `import.meta.env.X`, `Bun.env.X`,
`Deno.env.get("X")`. Reads with a computed key are left to
[`no-dynamic-env`](no-dynamic-env.md).

## Options

```js
"env-example/no-undeclared-env": ["error", { envFile: ".env.example", allow: ["CI", "npm_*"] }]
```

- `envFile` (`string | string[]`): files to read instead of the nearest `.env.example`. Relative
  paths are resolved from the folder ESLint runs in. With several files, a name listed in any of
  them is accepted.
- `allow` (`string[]`): names that never need declaring. A trailing `*` matches any suffix.

`NODE_ENV` is always allowed, and so are Vite's `MODE`, `BASE_URL`, `PROD`, `DEV` and `SSR` on
`import.meta.env`.

## When the env file is missing

If no file is found, the rule reports once per file, on the first env read, with the folder it
searched from and how to fix it. Files that read no env variables are never reported.
