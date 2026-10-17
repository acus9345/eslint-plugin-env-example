# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-10-17

### Added

- `no-undeclared-env` rule: reports env variables read from `process.env`, `import.meta.env`,
  `Bun.env` or `Deno.env.get()` that `.env.example` doesn't list. Finds the nearest
  `.env.example` automatically; `envFile` and `allow` options.
- `no-dynamic-env` rule: reports env reads whose key is computed at runtime.
- `recommended` flat config.
- TypeScript type declarations.

[0.1.0]: https://github.com/acus9345/eslint-plugin-env-example/releases/tag/v0.1.0
