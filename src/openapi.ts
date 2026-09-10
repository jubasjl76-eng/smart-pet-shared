/**
 * Lightweight OpenAPI registry for the Smart Pet HTTP services (Phase 14, A1).
 *
 * `createOpenApiRegistry(config)` → `{ apiRoute, buildOpenApiDoc, docsHtml }`
 * bound to that service. `apiRoute(spec)` returns an Express-compatible
 * middleware that validates the request with the zod schemas AND records the
 * route so `buildOpenApiDoc()` can emit `/openapi.json`. Routes migrate onto it
 * file-by-file; anything not registered is served but absent from the spec.
 *
 * Typed structurally so this package needs no `express` dependency; the returned
 * middleware is assignable to `express.RequestHandler`.
 */
import { z } from './config.js';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface RouteSpec {
  method: HttpMethod;
  /** OpenAPI path, e.g. `/api/auth/login`. */
  path: string;
  tags?: string[];
  summary?: string;
  /** true → documented as requiring the bearer JWT. */
  secure?: boolean;
  /** true → documented as honouring `Idempotency-Key`. */
  idempotent?: boolean;
  request?: { body?: z.ZodType; query?: z.ZodType; params?: z.ZodType };
  responses: Record<number, { description: string; schema?: z.ZodType }>;
}

export interface OpenApiConfig {
  title: string;
  /** default `v1` */
  version?: string;
  description?: string;
  /** default `[{ url: '/api/v1' }, { url: '/api', description: 'unversioned alias (deprecated)' }]` */
  servers?: Array<{ url: string; description?: string }>;
  /** include the bearer securityScheme + document `secure` routes. default true */
  bearerAuth?: boolean;
}

interface MinReq {
  params: Record<string, unknown>;
  query: Record<string, unknown>;
  body: unknown;
}
interface MinRes {
  status(code: number): { json(body: unknown): unknown };
}
export type Middleware = (req: MinReq, res: MinRes, next: (err?: unknown) => void) => void;

const jsonSchema = (s: z.ZodType, io: 'input' | 'output') =>
  z.toJSONSchema(s, { target: 'openapi-3.0', io, unrepresentable: 'any' }) as Record<string, unknown>;

function paramList(schema: z.ZodType | undefined, location: 'path' | 'query') {
  if (!schema) return [];
  const js = jsonSchema(schema, 'input') as { properties?: Record<string, unknown>; required?: string[] };
  return Object.entries(js.properties ?? {}).map(([name, s]) => ({
    name,
    in: location,
    required: location === 'path' || (js.required ?? []).includes(name),
    schema: s,
  }));
}

export function createOpenApiRegistry(config: OpenApiConfig) {
  const registry: RouteSpec[] = [];
  const bearer = config.bearerAuth ?? true;
  const servers =
    config.servers ??
    [{ url: '/api/v1' }, { url: '/api', description: 'unversioned alias (deprecated)' }];

  function apiRoute(spec: RouteSpec): Middleware {
    registry.push(spec);
    return (req, res, next) => {
      try {
        if (spec.request?.params) req.params = spec.request.params.parse(req.params) as MinReq['params'];
        if (spec.request?.query) Object.assign(req.query, spec.request.query.parse(req.query));
        if (spec.request?.body) req.body = spec.request.body.parse(req.body);
        next();
      } catch (e) {
        if (e instanceof z.ZodError) {
          res.status(400).json({ error: 'validation', issues: e.issues });
          return;
        }
        next(e);
      }
    };
  }

  function buildOpenApiDoc() {
    const paths: Record<string, Record<string, unknown>> = {};
    for (const r of registry) {
      const item = (paths[r.path] ??= {});
      const params = [...paramList(r.request?.params, 'path'), ...paramList(r.request?.query, 'query')];
      item[r.method] = {
        tags: r.tags,
        summary: r.summary,
        ...(bearer && r.secure ? { security: [{ bearerAuth: [] }] } : {}),
        ...(r.idempotent
          ? { parameters: [...params, { $ref: '#/components/parameters/IdempotencyKey' }] }
          : params.length
            ? { parameters: params }
            : {}),
        ...(r.request?.body
          ? {
              requestBody: {
                required: true,
                content: { 'application/json': { schema: jsonSchema(r.request.body, 'input') } },
              },
            }
          : {}),
        responses: {
          ...Object.fromEntries(
            Object.entries(r.responses).map(([code, resp]) => [
              code,
              {
                description: resp.description,
                ...(resp.schema
                  ? { content: { 'application/json': { schema: jsonSchema(resp.schema, 'output') } } }
                  : {}),
              },
            ]),
          ),
          '429': { $ref: '#/components/responses/RateLimited' },
        },
      };
    }

    return {
      openapi: '3.1.0',
      info: {
        title: config.title,
        version: config.version ?? 'v1',
        description:
          config.description ??
          'Routes are migrated to this spec file-by-file; anything not listed is served but not yet documented.',
      },
      servers,
      components: {
        ...(bearer
          ? { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } }
          : {}),
        parameters: {
          IdempotencyKey: {
            name: 'Idempotency-Key',
            in: 'header',
            required: false,
            schema: { type: 'string', maxLength: 255 },
            description:
              'A client-chosen key; a retried request with the same key returns the first result (enforced from Phase 20).',
          },
          Cursor: {
            name: 'cursor',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Opaque pagination cursor from a previous response.',
          },
          Limit: {
            name: 'limit',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          },
        },
        responses: {
          RateLimited: {
            description: 'Too many requests. Back off per `Retry-After`.',
            headers: {
              'Retry-After': { schema: { type: 'integer' }, description: 'Seconds to wait.' },
              'RateLimit-Limit': { schema: { type: 'integer' } },
              'RateLimit-Remaining': { schema: { type: 'integer' } },
              'RateLimit-Reset': { schema: { type: 'integer' }, description: 'Seconds until the window resets.' },
            },
            content: {
              'application/json': { schema: { type: 'object', properties: { error: { type: 'string' } } } },
            },
          },
        },
      },
      paths,
    };
  }

  const docsHtml = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${config.title}</title>
  </head>
  <body>
    <script id="api-reference" data-url="/openapi.json"></script>
    <script
      src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.68.0/dist/browser/standalone.js"
      integrity="sha384-PhSzhE9ihf7z/cKeRSKAeP+oJMMzotyFv0EjvNYgL798a2ODBQVuJLTP4Klle6IB"
      crossorigin="anonymous"
    ></script>
  </body>
</html>`;

  return { apiRoute, buildOpenApiDoc, docsHtml };
}
