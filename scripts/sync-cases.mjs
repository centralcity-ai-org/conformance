#!/usr/bin/env node
// Copies the cases and schemas from a checkout of centralcity-ai-org/protocol, unchanged.
//   node scripts/sync-cases.mjs <protocol checkout>
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const from = process.argv[2];
if (!from || !existsSync(join(from, 'protocol', 'conformance'))) {
  console.error('Usage: node scripts/sync-cases.mjs <protocol checkout>');
  process.exit(2);
}
const cases = fileURLToPath(new URL('../cases/', import.meta.url));
for (const [src, dest] of [['protocol/conformance', 'conformance'], ['protocol/schemas', 'schemas']]) {
  rmSync(join(cases, dest), { recursive: true, force: true });
  cpSync(join(from, src), join(cases, dest), { recursive: true });
}
rmSync(join(cases, 'conformance', 'README.md'), { force: true });
const version = JSON.parse(readFileSync(join(from, 'package.json'), 'utf8')).version;
const commit = execFileSync('git', ['-C', from, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
writeFileSync(
  join(cases, 'SOURCE.json'),
  `${JSON.stringify({ repository: 'https://github.com/centralcity-ai-org/protocol', version, commit, paths: { 'protocol/conformance': 'cases/conformance', 'protocol/schemas': 'cases/schemas' }, note: 'Copied unchanged by scripts/sync-cases.mjs. Do not edit here; change the protocol repository.' }, null, 2)}\n`,
);
console.log(`cases synced from protocol ${version} (${commit.slice(0, 7)})`);
