import { isObject } from './spec.ts';
import type { JsonObject } from './types.ts';

/** A structural difference between two JSON schemas. `path` is the field path, e.g. "items[].price" ("" is the root). */
export type SchemaChange =
  | { kind: 'type-changed'; path: string; from: string; to: string }
  | { kind: 'property-removed'; path: string }
  | { kind: 'property-added'; path: string; required: boolean }
  | { kind: 'became-required'; path: string }
  | { kind: 'became-optional'; path: string }
  | { kind: 'enum-value-removed'; path: string; value: unknown }
  | { kind: 'enum-value-added'; path: string; value: unknown };

export type Resolver = (value: unknown) => unknown;

function typeOf(schema: JsonObject): string | undefined {
  if (typeof schema.type === 'string') return schema.type;
  if (Array.isArray(schema.type)) return [...schema.type].sort().join(' | ');
  if (isObject(schema.properties)) return 'object';
  if (schema.items !== undefined) return 'array';
  return undefined;
}

const refOf = (value: unknown) => (isObject(value) && typeof value.$ref === 'string' ? value.$ref : '');
const join = (path: string, key: string) => (path ? `${path}.${key}` : key);
const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function requiredSet(schema: JsonObject): Set<string> {
  return new Set(Array.isArray(schema.required) ? schema.required.filter((k): k is string => typeof k === 'string') : []);
}

/**
 * Compare two schemas and list what changed. Direction-neutral: rules decide whether a change
 * is breaking for a request or a response. Recursive schemas are followed once per branch.
 */
export function diffSchemas(
  resolveBase: Resolver,
  resolveHead: Resolver,
  base: unknown,
  head: unknown,
  path = '',
  ancestors: ReadonlySet<string> = new Set(),
): SchemaChange[] {
  const changes: SchemaChange[] = [];
  const refPair = refOf(base) || refOf(head) ? `${refOf(base)}|${refOf(head)}` : '';
  if (refPair && ancestors.has(refPair)) return changes;
  const chain = refPair ? new Set(ancestors).add(refPair) : ancestors;

  const a = resolveBase(base);
  const b = resolveHead(head);
  if (!isObject(a) || !isObject(b)) return changes;

  const typeA = typeOf(a);
  const typeB = typeOf(b);
  if (typeA && typeB && typeA !== typeB) {
    changes.push({ kind: 'type-changed', path, from: typeA, to: typeB });
    return changes;
  }

  if (Array.isArray(a.enum) && Array.isArray(b.enum)) {
    const enumA = a.enum;
    const enumB = b.enum;
    for (const value of enumA) {
      if (!enumB.some((v) => sameValue(v, value))) changes.push({ kind: 'enum-value-removed', path, value });
    }
    for (const value of enumB) {
      if (!enumA.some((v) => sameValue(v, value))) changes.push({ kind: 'enum-value-added', path, value });
    }
  }

  const propsA = isObject(a.properties) ? a.properties : {};
  const propsB = isObject(b.properties) ? b.properties : {};
  const requiredA = requiredSet(a);
  const requiredB = requiredSet(b);
  for (const key of Object.keys(propsA)) {
    const child = join(path, key);
    if (!Object.hasOwn(propsB, key)) {
      changes.push({ kind: 'property-removed', path: child });
      continue;
    }
    if (!requiredA.has(key) && requiredB.has(key)) changes.push({ kind: 'became-required', path: child });
    if (requiredA.has(key) && !requiredB.has(key)) changes.push({ kind: 'became-optional', path: child });
    changes.push(...diffSchemas(resolveBase, resolveHead, propsA[key], propsB[key], child, chain));
  }
  for (const key of Object.keys(propsB)) {
    if (!Object.hasOwn(propsA, key)) changes.push({ kind: 'property-added', path: join(path, key), required: requiredB.has(key) });
  }

  if (a.items !== undefined && b.items !== undefined) {
    changes.push(...diffSchemas(resolveBase, resolveHead, a.items, b.items, `${path}[]`, chain));
  }
  return changes;
}
