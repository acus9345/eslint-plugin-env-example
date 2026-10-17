# env-example/no-dynamic-env

Disallow reading environment variables through keys computed at runtime.

⚠️ Enabled as `warn` in `recommended`.

## Why

`process.env[name]` can read any variable, so neither this plugin nor a reviewer can tell
whether it's documented in `.env.example`. Prefer fixed names.

## Examples

❌ Incorrect:

```js
process.env[name];
process.env[`VITE_${key}`];
import.meta.env[key];
Deno.env.get(name);
const { [key]: value } = process.env;
```

✅ Correct:

```js
process.env.API_URL;
process.env["API_URL"];
Deno.env.get("API_URL");
spawn(cmd, { env: process.env }); // passing the whole object is fine
process.env[name] = value; // writes are fine
```

If a dynamic lookup is intended (for example, a config loader that validates names itself),
disable the rule for that line:

```js
// eslint-disable-next-line env-example/no-dynamic-env
const value = process.env[name];
```

## Options

None.
