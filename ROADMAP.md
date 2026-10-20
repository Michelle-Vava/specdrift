# Roadmap

specdrift compares two versions of an OpenAPI spec and explains which changes will break existing clients. It works on the spec files only: no network calls, no live API, no real traffic.

**Where it's going:** a small, TypeScript-native compatibility checker that covers the OpenAPI features real APIs use, fits into pull requests and CI, and lets teams add their own rules.

## Principles

1. **Plain English.** Every finding says what changed and who it breaks.
2. **Direction-aware.** The same change can be safe in a request and breaking in a response; rules must say which.
3. **Extensible.** Built-in rules use the same public `Rule` interface anyone can use.
4. **Deterministic.** The same two specs always give the same report, in the same order.
5. **Specs only.** No network, no live endpoints, no real payloads.

---

## ✅ v0.1: Core comparison (done)

- [x] Load OpenAPI 3.x JSON, follow local `$ref`s, handle recursive schemas
- [x] Match endpoints by method and path, ignoring path-parameter names
- [x] Rules: endpoint removed/added, parameter changes, request body changes, response changes
- [x] Schema diff: type changes, added/removed fields, required/optional, enum values, arrays
- [x] Custom rules via the `Rule` interface; disable rules by id; duplicate ids rejected
- [x] Text and `--json` output, exit codes for CI
- [x] Fictional example specs and `npm run demo`
- [x] Tests and CI on Windows, macOS and Linux

---

## v0.2: Cover more of OpenAPI

**Goal:** handle the schema features real-world specs use.
**Why:** v0.1 compares plain objects, arrays and enums. Many specs rely on composition and constraints.

- [ ] YAML input
- [ ] `allOf` (merged), `oneOf` / `anyOf` (options added or removed)
- [ ] `nullable` (3.0) and `type: [..., "null"]` (3.1): a response field that can now be `null` is a warning
- [ ] `format` changes (`int32` → `int64`, `date` → `date-time`)
- [ ] Constraint changes: `maxLength`, `minimum`, `maximum`, `pattern` tightened in a request is breaking
- [ ] `additionalProperties` changes
- [ ] Path parameters compared by position (type change of `{id}` from integer to string)
- [ ] Response headers and content types (e.g. JSON response removed)

**Done when:** each feature has paired base/head fixtures covering breaking, warning and safe cases.

---

## v0.3: Reports people can act on

**Goal:** make large reports easy to read and use in review.
**Why:** one schema change used by many endpoints currently shows up once per endpoint.

- [ ] Group findings caused by the same shared schema: "`Product.price` changed type (affects 3 endpoints)"
- [ ] `--markdown` output for PR comments and GitHub job summaries
- [ ] `--fail-on breaking|warning` and `--quiet`
- [ ] Documented, versioned JSON schema for the report
- [ ] Changelog-style output: "Added / Changed / Removed" for release notes

---

## v0.4: Team policies

**Goal:** let teams tune specdrift to their own rules.

- [ ] Config file (`specdrift.config.ts` / `.json`): enable/disable rules, change severities, load custom rules
- [ ] Ignore list for accepted breaking changes, with a reason and an expiry date
- [ ] Rule options (e.g. treat removed error responses as breaking)
- [ ] Rule metadata (`docsUrl`, examples) shown in output

---

## v0.5: Fit the workflow

- [ ] Swagger 2.0 input (converted internally)
- [ ] Compare against a git ref: `specdrift main:openapi.json openapi.json`
- [ ] Watch mode for local development
- [ ] Multi-file specs (external `$ref`s to local files)

---

## v1.0: Ready for everyone

- [ ] Publish to npm (`npx specdrift`)
- [ ] GitHub Action with a PR comment
- [ ] A docs page per rule: what it catches, why it matters, how to roll the change out safely
- [ ] Semantic versioning and a CHANGELOG

## Ideas for later

- Suggest a safe rollout for a breaking change (add the new field first, deprecate, then remove)
- Detect `deprecated: true` and warn when a deprecated endpoint is removed too early
- AsyncAPI support

## Out of scope

- Calling live APIs, recording traffic or testing real requests (tools like Schemathesis do this)
- Linting spec style (Spectral, Redocly and vacuum do this well)
- Anything that needs an account, token or network access
