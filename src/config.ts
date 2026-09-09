/**
 * Typed config contract for the Smart Pet services (hardening Phase 12, A8).
 *
 * Every service declares ONE zod schema over `process.env`, split by where the
 * value comes from:
 *
 *   1. public build-time   API base URLs, feature flags, public keys.
 *                          Safe to commit per-env (SOPS not needed).
 *   2. runtime non-secret  pool sizes, timeouts, tick intervals, log level.
 *                          Per-env files; SOPS-encrypted only if you prefer.
 *   3. secret              DB URL, JWT keyset, provider API keys, signing keys.
 *                          AWS Secrets Manager at runtime; SOPS+age for
 *                          git-committed non-prod. NEVER plain in git / an
 *                          image layer / a task def.
 *
 * `loadConfig` parses + validates once at boot and, by default, prints every
 * problem and `process.exit(1)` — a service must not start half-configured.
 */
import { z } from 'zod';

export { z };

export interface LoadConfigOptions {
  /** Source map; defaults to `process.env`. */
  env?: Record<string, string | undefined>;
  /** On invalid config: 'exit' (print + process.exit(1), the default) or 'throw' (tests). */
  onError?: 'exit' | 'throw';
  /** Label in the error output, e.g. the service name. */
  name?: string;
}

/**
 * Parse `env` against `schema`. Returns a frozen, typed config object, or (by
 * default) prints all issues and exits the process.
 */
export function loadConfig<S extends z.ZodType>(
  schema: S,
  opts: LoadConfigOptions = {}
): z.infer<S> {
  const { env = process.env, onError = 'exit', name = 'config' } = opts;
  const result = schema.safeParse(env);
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`
    );
    const msg = `[${name}] invalid environment:\n${lines.join('\n')}`;
    if (onError === 'throw') throw new Error(msg);
    console.error(msg);
    process.exit(1);
  }
  return Object.freeze(result.data) as z.infer<S>;
}

/** Replace the named keys with '***' — for logging a resolved config safely. */
export function redact<T extends Record<string, unknown>>(
  config: T,
  secretKeys: readonly (keyof T)[]
): T {
  const out: Record<string, unknown> = { ...config };
  for (const k of secretKeys) {
    if (k in out && out[k as string] != null && out[k as string] !== '') {
      out[k as string] = '***';
    }
  }
  return out as T;
}

// ── env-string coercion helpers (env values are always strings) ──────────────

/** "true" | "1" | "yes" | "on" → true; "false" | "0" | "no" | "off" | "" → false. */
export const envBool = () => z.stringbool();

/** Integer from an env string. */
export const envInt = () => z.coerce.number().int();

/** TCP port (1–65535) from an env string. */
export const envPort = () => z.coerce.number().int().min(1).max(65535);

/** Comma-separated env string → trimmed, non-empty string[]. */
export const envCsv = () =>
  z
    .string()
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.string()));

/** One of the given literal strings, from an env string. */
export const envEnum = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values);
