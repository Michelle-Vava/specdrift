import { readFileSync } from 'node:fs';
import type { JsonObject, OpenApiDocument, Operation, OperationPair } from './types.ts';

const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function loadSpec(file: string): OpenApiDocument {
  let doc: unknown;
  try {
    doc = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read ${file} as JSON: ${(error as Error).message}`);
  }
  return validateSpec(doc, file);
}

export function validateSpec(doc: unknown, name = 'spec'): OpenApiDocument {
  if (!isObject(doc)) throw new Error(`${name} is not a JSON object`);
  if (typeof doc.openapi !== 'string' || !doc.openapi.startsWith('3.')) {
    throw new Error(`${name} is not an OpenAPI 3.x document (Swagger 2.0 support is on the roadmap)`);
  }
  return doc as OpenApiDocument;
}

const unescapePointer = (part: string) => decodeURIComponent(part).replace(/~1/g, '/').replace(/~0/g, '~');

/** Follow local `$ref`s ("#/components/...") until a real value is reached. */
export function resolve(doc: OpenApiDocument, value: unknown): unknown {
  const seen = new Set<string>();
  let current = value;
  while (isObject(current) && typeof current.$ref === 'string') {
    const ref = current.$ref;
    if (!ref.startsWith('#/')) throw new Error(`Only local $refs are supported, found "${ref}"`);
    if (seen.has(ref)) throw new Error(`$ref loop at "${ref}"`);
    seen.add(ref);
    let node: unknown = doc;
    for (const part of ref.slice(2).split('/').map(unescapePointer)) {
      node = isObject(node) ? node[part] : undefined;
    }
    if (node === undefined) throw new Error(`Cannot resolve $ref "${ref}"`);
    current = node;
  }
  return current;
}

export function listOperations(doc: OpenApiDocument): Operation[] {
  const operations: Operation[] = [];
  for (const [path, rawItem] of Object.entries(doc.paths ?? {})) {
    const item = resolve(doc, rawItem);
    if (!isObject(item)) continue;
    const shared = Array.isArray(item.parameters) ? item.parameters : [];
    for (const method of HTTP_METHODS) {
      const value = item[method];
      if (!isObject(value)) continue;
      const own = Array.isArray(value.parameters) ? value.parameters : [];
      operations.push({
        key: `${method.toUpperCase()} ${path.replace(/\{[^}]*\}/g, '{}')}`,
        label: `${method.toUpperCase()} ${path}`,
        value,
        parameters: [...shared, ...own],
      });
    }
  }
  return operations;
}

/** Match operations by method and path, ignoring path-parameter names ({id} and {productId} match). */
export function pairOperations(base: OpenApiDocument, head: OpenApiDocument): OperationPair[] {
  const pairs = new Map<string, OperationPair>();
  for (const op of listOperations(base)) pairs.set(op.key, { label: op.label, base: op });
  for (const op of listOperations(head)) {
    const pair = pairs.get(op.key);
    if (pair) pair.head = op;
    else pairs.set(op.key, { label: op.label, head: op });
  }
  return [...pairs.values()];
}
