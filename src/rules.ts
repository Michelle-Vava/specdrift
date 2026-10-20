import { diffSchemas, type SchemaChange } from './schema.ts';
import { isObject } from './spec.ts';
import type { JsonObject, Rule, RuleContext, RuleFinding, Severity, Side } from './types.ts';

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const finding = (severity: Severity, location: string, message: string): RuleFinding => ({
  severity,
  location,
  message: capitalize(message),
});

function field(path: string): string {
  if (!path) return 'the body';
  if (path === '[]') return 'each item';
  if (path.startsWith('[].')) return `"${path.slice(3)}" in each item`;
  return `"${path}"`;
}
const show = (value: unknown) => JSON.stringify(value);

function schemaDiff(context: RuleContext, base: unknown, head: unknown): SchemaChange[] {
  return diffSchemas((v) => context.resolve('base', v), (v) => context.resolve('head', v), base, head);
}

/** The JSON schema of a request body or response, if it has one. */
function jsonContent(context: RuleContext, side: Side, raw: unknown): { schema?: unknown; required: boolean } | undefined {
  const value = context.resolve(side, raw);
  if (!isObject(value)) return undefined;
  const content = isObject(value.content) ? value.content : {};
  const types = Object.keys(content);
  const type = types.find((t) => t === 'application/json') ?? types.find((t) => t.includes('json'));
  const media = type ? content[type] : undefined;
  return { schema: isObject(media) ? media.schema : undefined, required: value.required === true };
}

function describeRequestChange(change: SchemaChange): [Severity, string] {
  const name = field(change.path);
  switch (change.kind) {
    case 'type-changed':
      return ['breaking', `${name} changed type from ${change.from} to ${change.to}. Existing clients send the old type.`];
    case 'property-added':
      return change.required
        ? ['breaking', `New required field ${name}. Existing clients don't send it.`]
        : ['safe', `New optional field ${name}.`];
    case 'property-removed':
      return ['warning', `Field ${name} removed. Clients that still send it may be rejected.`];
    case 'became-required':
      return ['breaking', `Field ${name} is now required. Existing clients may not send it.`];
    case 'became-optional':
      return ['safe', `Field ${name} is now optional.`];
    case 'enum-value-removed':
      return ['breaking', `${name} no longer accepts ${show(change.value)}.`];
    case 'enum-value-added':
      return ['safe', `${name} now also accepts ${show(change.value)}.`];
  }
}

function describeResponseChange(change: SchemaChange): [Severity, string] {
  const name = field(change.path);
  switch (change.kind) {
    case 'type-changed':
      return ['breaking', `${name} changed type from ${change.from} to ${change.to}. Clients reading it will break.`];
    case 'property-added':
      return ['safe', `New field ${name} in the response.`];
    case 'property-removed':
      return ['breaking', `Field ${name} removed from the response. Clients reading it will break.`];
    case 'became-required':
      return ['safe', `Field ${name} is now always present.`];
    case 'became-optional':
      return ['warning', `Field ${name} may now be missing. Clients that rely on it may break.`];
    case 'enum-value-removed':
      return ['safe', `${name} no longer returns ${show(change.value)}.`];
    case 'enum-value-added':
      return ['warning', `${name} can now return ${show(change.value)}. Clients may not handle the new value.`];
  }
}

export const endpointRemoved: Rule = {
  id: 'endpoint-removed',
  description: 'An operation in the old spec is missing from the new one.',
  check: ({ operations }) =>
    operations
      .filter((pair) => pair.base && !pair.head)
      .map((pair) => finding('breaking', pair.label, 'Endpoint removed. Clients calling it will get errors.')),
};

export const endpointAdded: Rule = {
  id: 'endpoint-added',
  description: 'A new operation was added.',
  check: ({ operations }) =>
    operations.filter((pair) => !pair.base && pair.head).map((pair) => finding('safe', pair.label, 'New endpoint.')),
};

function parameterMap(context: RuleContext, side: Side, parameters: unknown[]): Map<string, JsonObject> {
  const map = new Map<string, JsonObject>();
  for (const raw of parameters) {
    const parameter = context.resolve(side, raw);
    // Path parameters are matched by position in the path, not by name, so they're left to the path itself.
    if (!isObject(parameter) || typeof parameter.name !== 'string' || parameter.in === 'path') continue;
    map.set(`${String(parameter.in)}:${parameter.name}`, parameter);
  }
  return map;
}

export const parameterChanges: Rule = {
  id: 'parameter-changes',
  description: 'Query, header and cookie parameters that were added, removed, made required or changed type.',
  check(context) {
    const findings: RuleFinding[] = [];
    for (const pair of context.operations) {
      if (!pair.base || !pair.head) continue;
      const before = parameterMap(context, 'base', pair.base.parameters);
      const after = parameterMap(context, 'head', pair.head.parameters);
      for (const [key, parameter] of after) {
        const name = `${String(parameter.in)} parameter "${String(parameter.name)}"`;
        const old = before.get(key);
        if (!old) {
          findings.push(
            parameter.required === true
              ? finding('breaking', pair.label, `New required ${name}. Existing clients don't send it.`)
              : finding('safe', pair.label, `New optional ${name}.`),
          );
          continue;
        }
        if (old.required !== true && parameter.required === true) {
          findings.push(finding('breaking', pair.label, `${name} is now required. Existing clients may not send it.`));
        }
        for (const change of schemaDiff(context, old.schema, parameter.schema)) {
          if (change.kind === 'type-changed' || change.kind === 'enum-value-removed') {
            const [severity, message] = describeRequestChange(change);
            findings.push(finding(severity, pair.label, message.replace('the body', name)));
          }
        }
      }
      for (const [key, parameter] of before) {
        if (!after.has(key)) {
          findings.push(finding('warning', pair.label,
            `${String(parameter.in)} parameter "${String(parameter.name)}" removed. Clients that still send it may be rejected or ignored.`));
        }
      }
    }
    return findings;
  },
};

export const requestBodyChanges: Rule = {
  id: 'request-body-changes',
  description: 'Changes to JSON request bodies that existing clients could break on.',
  check(context) {
    const findings: RuleFinding[] = [];
    for (const pair of context.operations) {
      if (!pair.base || !pair.head) continue;
      const location = `${pair.label} → request body`;
      const before = jsonContent(context, 'base', pair.base.value.requestBody);
      const after = jsonContent(context, 'head', pair.head.value.requestBody);
      if (!after) continue;
      if (after.required && !before?.required) {
        findings.push(finding('breaking', location, 'A request body is now required. Existing clients may not send one.'));
      }
      if (!before) continue;
      for (const change of schemaDiff(context, before.schema, after.schema)) {
        const [severity, message] = describeRequestChange(change);
        findings.push(finding(severity, location, message));
      }
    }
    return findings;
  },
};

export const responseChanges: Rule = {
  id: 'response-changes',
  description: 'Removed responses and changes to JSON response bodies that clients could break on.',
  check(context) {
    const findings: RuleFinding[] = [];
    for (const pair of context.operations) {
      if (!pair.base || !pair.head) continue;
      const before = isObject(pair.base.value.responses) ? pair.base.value.responses : {};
      const after = isObject(pair.head.value.responses) ? pair.head.value.responses : {};
      for (const status of Object.keys(before)) {
        const location = `${pair.label} → ${status}`;
        if (!Object.hasOwn(after, status)) {
          findings.push(status.startsWith('2')
            ? finding('breaking', location, `Response ${status} removed. Clients expecting it will break.`)
            : finding('warning', location, `Response ${status} removed. Clients handling it may behave differently.`));
          continue;
        }
        const old = jsonContent(context, 'base', before[status]);
        const current = jsonContent(context, 'head', after[status]);
        for (const change of schemaDiff(context, old?.schema, current?.schema)) {
          const [severity, message] = describeResponseChange(change);
          findings.push(finding(severity, location, message));
        }
      }
    }
    return findings;
  },
};

export const builtInRules: readonly Rule[] = [
  endpointRemoved,
  endpointAdded,
  parameterChanges,
  requestBodyChanges,
  responseChanges,
];
