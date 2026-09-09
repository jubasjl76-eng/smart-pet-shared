# Changelog

All notable changes to `@jubasjl76-eng/shared`.

## 0.2.0 — 2026-09-10

- `@jubasjl76-eng/shared/openapi` — `createOpenApiRegistry({ title, servers, … })`
  → `{ apiRoute, buildOpenApiDoc, docsHtml }`. The lightweight zod OpenAPI
  registry, shared by every Smart Pet HTTP service (Phase 14, A1). Typed
  structurally, no `express` dependency.

## 0.1.0 — 2026-09-09

- First release. Hardening Phase 12 (A8): the **typed config contract**.
  - `loadConfig(schema, opts)` — parse + validate `process.env` against one zod
    schema; prints every problem and `process.exit(1)` by default so a service
    never starts half-configured.
  - `redact(config, secretKeys)` — mask secrets for safe boot-time logging.
  - env-string coercion helpers: `envBool` (`z.stringbool`), `envInt`, `envPort`,
    `envCsv`, `envEnum`; `z` re-exported so consumers pin one zod.
- Consumed as a git-tag dependency:
  `git+https://github.com/jubasjl76-eng/smart-pet-shared.git#shared-v0.1.0`.
