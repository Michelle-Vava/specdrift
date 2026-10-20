# Testing

How specdrift is tested, how to run the tests yourself, and what isn't covered yet.

## Run it yourself

Needs Node.js 22.18 or newer (the tests run the TypeScript source directly).

```bash
npm install
npm run typecheck   # TypeScript type check, no output means it passed
npm test            # all 19 tests
npm run demo        # compare the two example specs and print the report
```

`npm test` ends with a summary like this:

```
ℹ tests 19
ℹ pass 19
ℹ fail 0
```

For a list of every test by name:

```bash
node --test --test-reporter=spec "test/*.test.ts"
```

## How the tests work

- **Made-up specs only.** Each test builds two small OpenAPI documents in code (an "old" and a "new" version), runs `compare`, and checks the exact findings: severity, location and message. Nothing calls a real API.
- **One change at a time.** Most tests change a single thing (remove a field, make a parameter required), so a failure points straight at the rule that broke.
- **The CLI is tested as a real program.** `test/cli.test.ts` starts `src/cli.ts` as a separate process with the example specs in [`examples/`](examples) and checks its output and exit code.
- Tests use Node's built-in test runner (`node:test`). There are no test dependencies.

## What each test checks

### Comparison rules ([test/compare.test.ts](test/compare.test.ts))

| Test | What it proves |
|---|---|
| identical specs have no findings | Comparing a spec with itself reports nothing |
| removed endpoint is breaking, added endpoint is safe | `endpoint-removed` and `endpoint-added` |
| renaming a path parameter is not a change | `/items/{id}` and `/items/{itemId}` are treated as the same endpoint |
| query parameters: new required is breaking, new optional is safe, removed is a warning | `parameter-changes` for added and removed parameters |
| parameter made required or changed type is breaking | `parameter-changes` for changed parameters |
| response: removed field and type change are breaking, new field is safe | `response-changes` on response bodies |
| response: removed 2xx response is breaking, removed error response is a warning | Removing a success response is worse than removing an error response |
| response: field that may now be missing is a warning | A field that stops being required in a response |
| request body: new required field is breaking, new optional field is safe | `request-body-changes` on request bodies |
| request body that becomes required is breaking | A body that clients didn't have to send before |
| enums: new response value is a warning, removed request value is breaking | Direction matters: the same kind of change is judged differently for requests and responses |
| follows $refs, including into arrays, and stops on recursive schemas | `$ref` resolution, array items, and a schema that refers to itself doesn't loop forever |
| custom rules run with their own id, and rules can be disabled | The `Rule` plug-in interface and the `disable` option |
| duplicate rule ids and unknown disabled rules are errors | Mistakes in rule setup are reported, not ignored |
| missing $ref target is a clear error | A broken `$ref` gives a readable message |

### Command line ([test/cli.test.ts](test/cli.test.ts))

| Test | What it proves |
|---|---|
| example specs: exits 1 and lists the breaking changes | Real output on the example plant shop API, exit code `1` when something breaks |
| --json prints a parseable report | JSON output is valid and its counts add up |
| same spec twice exits 0 | Exit code `0` and "No differences found" when nothing changed |
| bad input exits 2 with a message | Missing files and wrong arguments give exit code `2` and a clear error |

## What runs on every push

GitHub Actions ([`.github/workflows/test.yml`](.github/workflows/test.yml)) runs on **Windows, macOS and Linux** with **Node 22 and 24** (6 combinations):

1. `npm ci`: clean install
2. `npm run typecheck`
3. `npm test`
4. `npm run demo`
5. Builds the package and runs the **built** CLI on the example specs, checking it exits with `1`

Results are on the [Actions tab](https://github.com/Michelle-Vava/specdrift/actions); the badge at the top of the README shows the latest run.

## Not tested yet

These are on the [roadmap](ROADMAP.md), so they aren't supported or tested in v0.1:

- YAML specs, Swagger 2.0, and `$ref`s to other files
- `allOf` / `oneOf` / `anyOf`, `nullable`, `format` and constraint changes
- Path parameter type changes
- Response headers and non-JSON content types
- Very large real-world specs (performance)
