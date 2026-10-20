# specdrift

[![test](https://github.com/Michelle-Vava/specdrift/actions/workflows/test.yml/badge.svg)](https://github.com/Michelle-Vava/specdrift/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Find the changes in your API that will break the apps using it, **before** you release.

Give specdrift the old and new version of an OpenAPI spec. It tells you, in plain English, which changes are **breaking**, which are **risky**, and which are **safe**. It's written in TypeScript, runs with Node, and you can add your own rules.

```
$ specdrift plant-shop-v1.json plant-shop-v2.json

BREAKING  DELETE /products/{id}
          Endpoint removed. Clients calling it will get errors.
BREAKING  GET /products
          New required query parameter "currency". Existing clients don't send it.
BREAKING  GET /products → 200
          "price" in each item changed type from number to string. Clients reading it will break.
BREAKING  POST /products → request body
          New required field "sku". Existing clients don't send it.
WARNING   GET /products
          Query parameter "limit" removed. Clients that still send it may be rejected or ignored.
WARNING   GET /products/{id} → 200
          "light" can now return "direct". Clients may not handle the new value.
SAFE      GET /categories
          New endpoint.
...

9 breaking · 5 warnings · 5 safe
```

*Shortened output of `npm run demo`, which compares two versions of a made-up plant shop API in [`examples/`](examples).*

## Background

I've built several Node.js backends with Swagger/OpenAPI specs (NestJS, Express). When an API changes, it's easy to break a web or mobile app without noticing: rename a field, make a parameter required, or change a number to a string, and nothing fails until a user hits it.

Good tools for catching this exist, but they're written in Go, Java or C#. The main TypeScript one, Optic, was archived. For a Node team that means installing another runtime just to check a spec. I wanted one that runs with `npx`, explains each change in plain words, and lets a team add its own rules in TypeScript.

**Why the history starts here:** specdrift is a new project, started in October 2026, so this repository holds its full history from the first commit.

## Who it's for

- **Backend developers** changing an API that a frontend or mobile app depends on.
- **Teams** that want CI to fail when a pull request would break existing clients.
- **API maintainers** writing release notes who need a list of what changed.

## How it works

1. **Load** both specs and follow `$ref` links (including recursive schemas).
2. **Match** each endpoint in the old spec with the new one by method and path. Renaming a path parameter (`{id}` → `{productId}`) is not a change.
3. **Run rules.** Each rule looks at one kind of change and decides how serious it is. Direction matters: a new *optional* field is safe in a request but a field that *may now be missing* is risky in a response.
4. **Report** every finding with a severity, a location and an explanation, as text or JSON.

### Built-in rules

| Rule | Breaking | Warning | Safe |
|---|---|---|---|
| `endpoint-removed` | endpoint removed | | |
| `endpoint-added` | | | new endpoint |
| `parameter-changes` | new required parameter, parameter made required, type changed, enum value removed | parameter removed | new optional parameter |
| `request-body-changes` | body now required, new required field, field made required, type changed, enum value removed | field removed | new optional field, field made optional, new enum value |
| `response-changes` | 2xx response removed, field removed, type changed | error response removed, field may now be missing, new enum value | new field, field now always present |

## Try it

Needs Node.js 22.18 or newer to run from source (the built package runs on Node 18+).

```bash
git clone https://github.com/Michelle-Vava/specdrift.git
cd specdrift
npm install

# See it in action on the example plant shop API
npm run demo

# Compare your own specs
node src/cli.ts old.json new.json
node src/cli.ts old.json new.json --json
```

Exit code: `0` no breaking changes, `1` breaking changes found, `2` error.

## Ways to use it

| Where | How | Status |
|---|---|---|
| On your machine | `node src/cli.ts old.json new.json` | ✅ works now |
| In a CI pipeline | `npx --yes github:Michelle-Vava/specdrift old.json new.json` | ✅ works now |
| As a library | `import { compare } from 'specdrift'` | ✅ works now (install from GitHub) |
| From npm | `npx specdrift` | 🗺️ on the roadmap |

### As a library, with your own rule

```ts
import { compare, loadSpec, formatText, type Rule } from 'specdrift';

// Team policy: new DELETE endpoints need a second review.
const reviewDeletes: Rule = {
  id: 'review-new-deletes',
  description: 'New DELETE endpoints need a review.',
  check: ({ operations }) =>
    operations
      .filter((op) => !op.base && op.head && op.label.startsWith('DELETE'))
      .map((op) => ({ severity: 'warning', location: op.label, message: 'New DELETE endpoint: get a second review.' })),
};

const report = compare(loadSpec('old.json'), loadSpec('new.json'), { rules: [reviewDeletes] });
console.log(formatText(report));
```

Rules get every matched endpoint, both full documents and a `$ref` resolver, and return findings. `diffSchemas` is exported too, so a rule can compare schemas the same way the built-in rules do.

## What it reads

- Only the **two spec files** you pass in. Nothing else on disk, and no network calls.
- It compares the **structure** of the API: paths, parameters, fields and types. It doesn't print `example` values from the spec, and it never calls the API or looks at real requests or responses.

## How it's tested

- `npm test` runs 19 tests with Node's built-in test runner: each rule, `$ref` and recursive schemas, path-parameter renames, custom rules, and the CLI's output and exit codes.
- GitHub Actions runs the type check, tests, demo and built CLI on **Windows, macOS and Linux** with Node 22 and 24 on every push.

## How it compares

- **oasdiff** (Go), **openapi-diff** (Java), **Azure openapi-diff** (C#) and **openapi-changes** (Go) are mature and check more cases than specdrift does today. Use them if you already have that runtime.
- **Optic** (TypeScript) did this and more, but was archived.

specdrift's aim is to be the small, TypeScript-native option: `npx` in a Node project, plain-English explanations, and rules you write in TypeScript.

## Roadmap

| Version | Focus |
|---|---|
| ✅ v0.1 | 5 built-in rules, `$ref` support, text and JSON output, custom rules |
| v0.2 | YAML specs, `allOf`/`oneOf`/`anyOf`, `nullable`, format and constraint changes |
| v0.3 | Group findings by shared schema, Markdown output for PR comments, `--fail-on` |
| v0.4 | Rule configuration file, ignore list for accepted changes |
| v0.5 | Swagger 2.0 support, compare against a git ref (`specdrift main:openapi.json openapi.json`) |
| v1.0 | npm package, GitHub Action, docs page per rule |

See [ROADMAP.md](ROADMAP.md) for details.

## License

[MIT](LICENSE)
