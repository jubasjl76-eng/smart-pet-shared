import { describe, it, expect } from 'vitest';
import { loadConfig, redact, envBool, envInt, envPort, envCsv, z } from '../src/config.js';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: envPort().default(3000),
  DEBUG: envBool().default(false),
  POOL_MAX: envInt().default(10),
  ALLOWED_ORIGINS: envCsv().default([]),
  DATABASE_URL: z.string().min(1),
});

describe('loadConfig', () => {
  it('parses + coerces a valid environment and freezes the result', () => {
    const cfg = loadConfig(schema, {
      onError: 'throw',
      env: { PORT: '8080', DEBUG: 'true', POOL_MAX: '25', ALLOWED_ORIGINS: 'a.com, b.com', DATABASE_URL: 'postgres://x' },
    });
    expect(cfg).toEqual({
      NODE_ENV: 'development',
      PORT: 8080,
      DEBUG: true,
      POOL_MAX: 25,
      ALLOWED_ORIGINS: ['a.com', 'b.com'],
      DATABASE_URL: 'postgres://x',
    });
    expect(Object.isFrozen(cfg)).toBe(true);
  });

  it('applies defaults when vars are absent', () => {
    const cfg = loadConfig(schema, { onError: 'throw', env: { DATABASE_URL: 'postgres://x' } });
    expect(cfg.PORT).toBe(3000);
    expect(cfg.DEBUG).toBe(false);
    expect(cfg.POOL_MAX).toBe(10);
    expect(cfg.ALLOWED_ORIGINS).toEqual([]);
  });

  it('throws listing every problem when required/invalid', () => {
    expect(() =>
      loadConfig(schema, { onError: 'throw', name: 'svc', env: { PORT: '99999' } })
    ).toThrow(/\[svc\] invalid environment/);
    try {
      loadConfig(schema, { onError: 'throw', env: { PORT: '99999' } });
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('PORT');
      expect(msg).toContain('DATABASE_URL');
    }
  });
});

describe('redact', () => {
  it('masks named keys, leaves the rest, keeps empties as-is', () => {
    const out = redact({ DATABASE_URL: 'postgres://secret', PORT: 3000, API_KEY: '' }, ['DATABASE_URL', 'API_KEY']);
    expect(out).toEqual({ DATABASE_URL: '***', PORT: 3000, API_KEY: '' });
  });
});
