# @jubasjl76-eng/shared

Cross-service TypeScript for the Smart Pet platform. Repo: `smart-pet-shared`.

**Phase 12** — the **typed config contract**. **Phase 14** adds zod domain
schemas + formatters here.

## Install

Git-tag dependency (this repo is public; no registry auth):

```json
"@jubasjl76-eng/shared": "git+https://github.com/jubasjl76-eng/smart-pet-shared.git#shared-v0.1.0"
```

`npm ci` clones the tag and runs `prepare` (`tsc`) to build `dist/`. Renovate
(`gitTags` datasource) raises the bump PRs. Also published to GitHub Packages by
`release.yml`.

## Config contract

Every service declares ONE zod schema over `process.env`, in three sections by
where the value comes from:

| section | examples | source |
|---|---|---|
| **public build-time** | API base URL, feature flags, public keys | committable per-env |
| **runtime non-secret** | pool sizes, timeouts, tick intervals, log level | per-env files |
| **secret** | DB URL, JWT keyset, provider keys, signing keys | AWS Secrets Manager at runtime; SOPS+age for git-committed non-prod. Never plain in git / an image layer / a task def. |

```ts
import { loadConfig, redact, z, envBool, envInt, envPort, envCsv } from '@jubasjl76-eng/shared';

const schema = z.object({
  // public
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: envPort().default(3000),
  // runtime non-secret
  PG_POOL_MAX: envInt().default(10),
  BREEDER_TICK_MS: envInt().default(60_000),
  // secret
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
});

export const config = loadConfig(schema, { name: 'backend' });
// invalid/missing → prints every issue, process.exit(1)

console.log('[boot] config', redact(config, ['DATABASE_URL', 'JWT_SECRET']));
```

`loadConfig(schema, { onError: 'throw' })` for tests.
