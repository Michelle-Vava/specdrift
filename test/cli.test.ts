import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const run = (...args: string[]) => spawnSync(process.execPath, ['src/cli.ts', ...args], { cwd: root, encoding: 'utf8' });

test('example specs: exits 1 and lists the breaking changes', () => {
  const { status, stdout } = run('examples/plant-shop-v1.json', 'examples/plant-shop-v2.json');
  assert.equal(status, 1);
  assert.match(stdout, /BREAKING {2}DELETE \/products\/\{id\}/);
  assert.match(stdout, /"price" changed type from number to string/);
  assert.match(stdout, /New required query parameter "currency"/);
  assert.match(stdout, /New required field "sku"/);
  assert.match(stdout, /SAFE {6}GET \/categories/);
});

test('--json prints a parseable report', () => {
  const { stdout } = run('examples/plant-shop-v1.json', 'examples/plant-shop-v2.json', '--json');
  const report = JSON.parse(stdout) as { findings: unknown[]; summary: Record<string, number> };
  assert.ok(report.summary.breaking! > 0);
  assert.equal(report.findings.length, report.summary.breaking! + report.summary.warning! + report.summary.safe!);
});

test('same spec twice exits 0', () => {
  const { status, stdout } = run('examples/plant-shop-v1.json', 'examples/plant-shop-v1.json');
  assert.equal(status, 0);
  assert.match(stdout, /No differences found/);
});

test('bad input exits 2 with a message', () => {
  const missing = run('examples/nope.json', 'examples/plant-shop-v1.json');
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /Could not read examples\/nope.json/);
  assert.equal(run('only-one.json').status, 2);
});
