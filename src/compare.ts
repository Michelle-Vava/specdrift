import { builtInRules } from './rules.ts';
import { pairOperations, resolve } from './spec.ts';
import type { Finding, OpenApiDocument, Report, Rule, RuleContext, Severity } from './types.ts';

export interface CompareOptions {
  /** Extra rules to run after the built-in ones. */
  rules?: Rule[];
  /** Ids of rules to skip. */
  disable?: string[];
}

const ORDER: Record<Severity, number> = { breaking: 0, warning: 1, safe: 2 };
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Compare an old (base) and new (head) OpenAPI document and report what changed. */
export function compare(base: OpenApiDocument, head: OpenApiDocument, options: CompareOptions = {}): Report {
  const rules = [...builtInRules, ...(options.rules ?? [])];
  const ids = new Set<string>();
  for (const rule of rules) {
    if (ids.has(rule.id)) throw new Error(`Two rules use the id "${rule.id}"`);
    ids.add(rule.id);
  }
  for (const id of options.disable ?? []) {
    if (!ids.has(id)) throw new Error(`Unknown rule "${id}" in disable list`);
  }

  const context: RuleContext = {
    base,
    head,
    operations: pairOperations(base, head),
    resolve: (side, value) => resolve(side === 'base' ? base : head, value),
  };

  const findings: Finding[] = rules
    .filter((rule) => !options.disable?.includes(rule.id))
    .flatMap((rule) => rule.check(context).map((found) => ({ rule: rule.id, ...found })))
    .sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || byText(a.location, b.location) || byText(a.message, b.message));

  const summary: Record<Severity, number> = { breaking: 0, warning: 0, safe: 0 };
  for (const f of findings) summary[f.severity]++;
  return { findings, summary };
}
