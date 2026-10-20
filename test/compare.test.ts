import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare, type OpenApiDocument, type Rule, type Severity } from '../src/index.ts';

type Json = Record<string, unknown>;

const doc = (paths: Json, schemas: Json = {}): OpenApiDocument => ({
  openapi: '3.0.3',
  info: { title: 'test', version: '1' },
  paths,
  components: { schemas },
});

const jsonBody = (schema: unknown, required = false) => ({ required, content: { 'application/json': { schema } } });
const ok = (schema: unknown) => ({ '200': { description: 'OK', ...jsonBody(schema) } });
const getWith = (extra: Json) => ({ '/items': { get: { responses: { '200': { description: 'OK' } }, ...extra } } });

function messages(base: OpenApiDocument, head: OpenApiDocument, severity?: Severity) {
  return compare(base, head).findings.filter((f) => !severity || f.severity === severity).map((f) => f.message);
}

test('identical specs have no findings', () => {
  const spec = doc({ '/items': { get: { responses: ok({ type: 'string' }) } } });
  assert.deepEqual(compare(spec, spec).findings, []);
});

test('removed endpoint is breaking, added endpoint is safe', () => {
  const base = doc({ '/a': { get: { responses: {} } } });
  const head = doc({ '/b': { get: { responses: {} } } });
  const { findings } = compare(base, head);
  assert.deepEqual(findings.map((f) => [f.severity, f.rule, f.location]), [
    ['breaking', 'endpoint-removed', 'GET /a'],
    ['safe', 'endpoint-added', 'GET /b'],
  ]);
});

test('renaming a path parameter is not a change', () => {
  const base = doc({ '/items/{id}': { get: { responses: {} } } });
  const head = doc({ '/items/{itemId}': { get: { responses: {} } } });
  assert.deepEqual(compare(base, head).findings, []);
});

test('query parameters: new required is breaking, new optional is safe, removed is a warning', () => {
  const base = getWith({ parameters: [{ name: 'old', in: 'query', schema: { type: 'string' } }] });
  const head = getWith({
    parameters: [
      { name: 'must', in: 'query', required: true, schema: { type: 'string' } },
      { name: 'may', in: 'query', schema: { type: 'string' } },
    ],
  });
  const { findings } = compare(doc(base), doc(head));
  assert.deepEqual(findings.map((f) => f.severity), ['breaking', 'warning', 'safe']);
  assert.match(findings[0]!.message, /New required query parameter "must"/);
  assert.match(findings[1]!.message, /Query parameter "old" removed/);
});

test('parameter made required or changed type is breaking', () => {
  const base = getWith({ parameters: [{ name: 'n', in: 'query', schema: { type: 'integer' } }] });
  const head = getWith({ parameters: [{ name: 'n', in: 'query', required: true, schema: { type: 'string' } }] });
  const found = messages(doc(base), doc(head), 'breaking');
  assert.equal(found.length, 2);
  assert.match(found.join('\n'), /is now required/);
  assert.match(found.join('\n'), /Query parameter "n" changed type from integer to string/);
});

test('response: removed field and type change are breaking, new field is safe', () => {
  const schema = (props: Json) => ({ type: 'object', properties: props });
  const base = doc({ '/items': { get: { responses: ok(schema({ price: { type: 'number' }, stock: { type: 'integer' } })) } } });
  const head = doc({ '/items': { get: { responses: ok(schema({ price: { type: 'string' }, colour: { type: 'string' } })) } } });
  const { findings } = compare(base, head);
  assert.deepEqual(findings.map((f) => [f.severity, f.location, f.message.split('.')[0]]), [
    ['breaking', 'GET /items → 200', '"price" changed type from number to string'],
    ['breaking', 'GET /items → 200', 'Field "stock" removed from the response'],
    ['safe', 'GET /items → 200', 'New field "colour" in the response'],
  ]);
});

test('response: removed 2xx response is breaking, removed error response is a warning', () => {
  const base = doc({ '/items': { get: { responses: { '200': { description: 'OK' }, '404': { description: 'Nope' } } } } });
  const head = doc({ '/items': { get: { responses: {} } } });
  assert.deepEqual(compare(base, head).findings.map((f) => [f.severity, f.location]), [
    ['breaking', 'GET /items → 200'],
    ['warning', 'GET /items → 404'],
  ]);
});

test('response: field that may now be missing is a warning', () => {
  const base = doc({ '/items': { get: { responses: ok({ type: 'object', required: ['id'], properties: { id: { type: 'string' } } }) } } });
  const head = doc({ '/items': { get: { responses: ok({ type: 'object', properties: { id: { type: 'string' } } }) } } });
  assert.deepEqual(messages(base, head, 'warning'), ['Field "id" may now be missing. Clients that rely on it may break.']);
});

test('request body: new required field is breaking, new optional field is safe', () => {
  const body = (required: string[], props: Json) => jsonBody({ type: 'object', required, properties: props });
  const base = doc({ '/items': { post: { requestBody: body([], { name: { type: 'string' } }), responses: {} } } });
  const head = doc({
    '/items': {
      post: { requestBody: body(['sku'], { name: { type: 'string' }, sku: { type: 'string' }, note: { type: 'string' } }), responses: {} },
    },
  });
  const { findings } = compare(base, head);
  assert.deepEqual(findings.map((f) => [f.severity, f.location]), [
    ['breaking', 'POST /items → request body'],
    ['safe', 'POST /items → request body'],
  ]);
  assert.match(findings[0]!.message, /New required field "sku"/);
});

test('request body that becomes required is breaking', () => {
  const base = doc({ '/items': { post: { responses: {} } } });
  const head = doc({ '/items': { post: { requestBody: jsonBody({ type: 'object' }, true), responses: {} } } });
  assert.match(messages(base, head, 'breaking')[0]!, /request body is now required/);
});

test('enums: new response value is a warning, removed request value is breaking', () => {
  const base = doc({
    '/items': {
      post: { requestBody: jsonBody({ type: 'string', enum: ['a', 'b'] }), responses: ok({ type: 'string', enum: ['a'] }) },
    },
  });
  const head = doc({
    '/items': {
      post: { requestBody: jsonBody({ type: 'string', enum: ['a'] }), responses: ok({ type: 'string', enum: ['a', 'c'] }) },
    },
  });
  assert.deepEqual(messages(base, head), [
    'The body no longer accepts "b".',
    'The body can now return "c". Clients may not handle the new value.',
  ]);
});

test('follows $refs, including into arrays, and stops on recursive schemas', () => {
  const schemas = (priceType: string) => ({
    Node: {
      type: 'object',
      properties: { price: { type: priceType }, children: { type: 'array', items: { $ref: '#/components/schemas/Node' } } },
    },
  });
  const paths = { '/tree': { get: { responses: ok({ $ref: '#/components/schemas/Node' }) } } };
  const { findings } = compare(doc(paths, schemas('number')), doc(paths, schemas('string')));
  assert.deepEqual(findings.map((f) => f.message.split('.')[0]), ['"price" changed type from number to string']);
});

test('custom rules run with their own id, and rules can be disabled', () => {
  const noDeletes: Rule = {
    id: 'no-new-deletes',
    description: 'Team policy: DELETE endpoints need a review.',
    check: ({ operations }) =>
      operations
        .filter((p) => !p.base && p.head && p.label.startsWith('DELETE'))
        .map((p) => ({ severity: 'warning' as const, location: p.label, message: 'New DELETE endpoint needs review.' })),
  };
  const base = doc({});
  const head = doc({ '/items/{id}': { delete: { responses: {} } } });
  const { findings } = compare(base, head, { rules: [noDeletes], disable: ['endpoint-added'] });
  assert.deepEqual(findings, [
    { rule: 'no-new-deletes', severity: 'warning', location: 'DELETE /items/{id}', message: 'New DELETE endpoint needs review.' },
  ]);
});

test('duplicate rule ids and unknown disabled rules are errors', () => {
  const spec = doc({});
  const dupe: Rule = { id: 'endpoint-added', description: '', check: () => [] };
  assert.throws(() => compare(spec, spec, { rules: [dupe] }), /Two rules use the id "endpoint-added"/);
  assert.throws(() => compare(spec, spec, { disable: ['nope'] }), /Unknown rule "nope"/);
});

test('missing $ref target is a clear error', () => {
  const base = doc({ '/x': { get: { responses: ok({ $ref: '#/components/schemas/Missing' }) } } });
  assert.throws(() => compare(base, base), /Cannot resolve \$ref "#\/components\/schemas\/Missing"/);
});
