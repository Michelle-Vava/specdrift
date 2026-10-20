// Compares two versions of a fictional plant-shop API and prints the report.
import { compare, formatText, loadSpec } from '../src/index.ts';

const example = (name: string) => new URL(`../examples/${name}`, import.meta.url);
const base = loadSpec(example('plant-shop-v1.json').pathname.replace(/^\/(\w:)/, '$1'));
const head = loadSpec(example('plant-shop-v2.json').pathname.replace(/^\/(\w:)/, '$1'));

console.log('Comparing examples/plant-shop-v1.json → examples/plant-shop-v2.json\n');
const report = compare(base, head);
console.log(formatText(report, Boolean(process.stdout.isTTY) && !process.env.NO_COLOR));

if (report.summary.breaking === 0) {
  console.error('\nExpected the demo to find breaking changes.');
  process.exitCode = 1;
}
