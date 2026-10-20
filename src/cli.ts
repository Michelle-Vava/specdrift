#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { compare } from './compare.ts';
import { formatText } from './format.ts';
import { loadSpec } from './spec.ts';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

const HELP = `specdrift ${version}
Find breaking changes between two OpenAPI 3.x specs.

Usage: specdrift <old.json> <new.json> [--json]

  --json          print the report as JSON
  -h, --help      show this help
  -v, --version   show the version

Exit code: 0 no breaking changes, 1 breaking changes found, 2 error.`;

const args = process.argv.slice(2);
if (args.includes('-h') || args.includes('--help')) {
  console.log(HELP);
  process.exit(0);
}
if (args.includes('-v') || args.includes('--version')) {
  console.log(version);
  process.exit(0);
}

const files = args.filter((arg) => !arg.startsWith('-'));
if (files.length !== 2) {
  console.error(HELP);
  process.exit(2);
}

try {
  const report = compare(loadSpec(files[0]!), loadSpec(files[1]!));
  const color = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
  console.log(args.includes('--json') ? JSON.stringify(report, null, 2) : formatText(report, color));
  process.exitCode = report.summary.breaking > 0 ? 1 : 0;
} catch (error) {
  console.error(`specdrift: ${(error as Error).message}`);
  process.exitCode = 2;
}
