import type { Report, Severity } from './types.ts';

const LABEL: Record<Severity, string> = { breaking: 'BREAKING', warning: 'WARNING ', safe: 'SAFE    ' };
const COLOR: Record<Severity, number> = { breaking: 31, warning: 33, safe: 32 };

export function formatText(report: Report, color = false): string {
  const paint = (code: number, text: string) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
  if (report.findings.length === 0) return 'No differences found.';

  const lines = report.findings.flatMap((f) => [
    `${paint(COLOR[f.severity], LABEL[f.severity])}  ${f.location}`,
    `          ${f.message}`,
  ]);
  const { breaking, warning, safe } = report.summary;
  lines.push('', `${breaking} breaking · ${warning} ${warning === 1 ? 'warning' : 'warnings'} · ${safe} safe`);
  return lines.join('\n');
}
