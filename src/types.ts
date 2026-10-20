export type Severity = 'breaking' | 'warning' | 'safe';

export interface Finding {
  /** Id of the rule that reported it. */
  rule: string;
  severity: Severity;
  /** Where the change is, e.g. "GET /products → 200 → price". */
  location: string;
  /** Plain-English explanation of the change and why it matters. */
  message: string;
}

/** What a rule returns. The engine fills in `rule`. */
export type RuleFinding = Omit<Finding, 'rule'>;

export type JsonObject = { [key: string]: unknown };

export interface OpenApiDocument extends JsonObject {
  openapi: string;
  paths?: Record<string, unknown>;
  components?: JsonObject;
}

export interface Operation {
  /** Method and path with path-parameter names removed, used to match operations: "GET /products/{}". */
  key: string;
  /** Method and path as written in the spec: "GET /products/{id}". */
  label: string;
  /** The raw operation object. */
  value: JsonObject;
  /** Path-level and operation-level parameters, unresolved. */
  parameters: unknown[];
}

/** The same operation in the old (base) and new (head) spec. One side is missing if it was added or removed. */
export interface OperationPair {
  label: string;
  base?: Operation;
  head?: Operation;
}

export type Side = 'base' | 'head';

export interface RuleContext {
  base: OpenApiDocument;
  head: OpenApiDocument;
  operations: OperationPair[];
  /** Follow local `$ref`s in the base or head document. */
  resolve(side: Side, value: unknown): unknown;
}

export interface Rule {
  id: string;
  description: string;
  check(context: RuleContext): RuleFinding[];
}

export interface Report {
  findings: Finding[];
  summary: Record<Severity, number>;
}
