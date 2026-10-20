export { compare, type CompareOptions } from './compare.ts';
export { formatText } from './format.ts';
export { builtInRules } from './rules.ts';
export { diffSchemas, type SchemaChange, type Resolver } from './schema.ts';
export { loadSpec, validateSpec, resolve, pairOperations } from './spec.ts';
export type {
  Finding,
  JsonObject,
  OpenApiDocument,
  Operation,
  OperationPair,
  Report,
  Rule,
  RuleContext,
  RuleFinding,
  Severity,
  Side,
} from './types.ts';
