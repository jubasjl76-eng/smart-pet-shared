import { describe, it, expect } from 'vitest';
import { createOpenApiRegistry } from '../src/openapi.js';
import { z } from '../src/config.js';

describe('createOpenApiRegistry', () => {
  const { apiRoute, buildOpenApiDoc, docsHtml } = createOpenApiRegistry({ title: 'Test API' });

  const mw = apiRoute({
    method: 'post',
    path: '/api/things',
    tags: ['things'],
    summary: 'make a thing',
    secure: true,
    request: { body: z.object({ n: z.coerce.number() }) },
    responses: { 201: { description: 'created', schema: z.object({ id: z.string() }) } },
  });

  it('registers into the doc with body + secure + shared 429', () => {
    const doc = buildOpenApiDoc() as any;
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.info.title).toBe('Test API');
    const op = doc.paths['/api/things'].post;
    expect(op.security).toEqual([{ bearerAuth: [] }]);
    expect(op.requestBody.content['application/json'].schema.required).toEqual(['n']);
    expect(Object.keys(op.responses)).toEqual(expect.arrayContaining(['201', '429']));
    expect(doc.components.responses.RateLimited).toBeDefined();
  });

  it('the middleware coerces + 400s', () => {
    const ok: any = { params: {}, query: {}, body: { n: '5' } };
    let nexted = false;
    mw(ok, {} as any, () => (nexted = true));
    expect(nexted && ok.body.n).toBe(5);

    let code = 0;
    const res: any = { status: (c: number) => ((code = c), { json: () => {} }) };
    mw({ params: {}, query: {}, body: { n: 'x' } } as any, res, () => {});
    expect(code).toBe(400);
  });

  it('docsHtml carries the title', () => {
    expect(docsHtml).toContain('<title>Test API</title>');
  });
});
