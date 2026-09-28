// Loads the conformance cases and schemas shipped in cases/ (copied from the protocol repository).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CASES_ROOT = fileURLToPath(new URL('../cases/', import.meta.url));
export const VERDICTS = ['valid', 'invalid', 'semantic'];

const posix = (path) => path.split(sep).join('/');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

/**
 * Every case: `{ id, schema, verdict, name, document }`, where `schema` is the schema's path under
 * cases/schemas without ".schema.json" (for example "mcp/city_send_message.input") and `verdict`
 * is valid (accept), invalid (reject, the schema also rejects) or semantic (reject: a rule JSON
 * Schema cannot express; a schema-only validator accepts it).
 */
export function loadCases({ root = CASES_ROOT, only = [] } = {}) {
  const base = join(root, 'conformance');
  const cases = [];
  for (const file of walk(base).filter((f) => f.endsWith('.json'))) {
    const parts = posix(relative(base, file)).split('/');
    const name = parts.pop().replace(/\.json$/, '');
    const verdict = parts.pop();
    if (!VERDICTS.includes(verdict)) continue;
    const schema = parts.join('/');
    const id = `${schema}/${verdict}/${name}`;
    if (only.length && !only.some((prefix) => id.startsWith(prefix))) continue;
    cases.push({ id, schema, verdict, name, document: JSON.parse(readFileSync(file, 'utf8')) });
  }
  return cases;
}

/** Schemas by key (path under cases/schemas without ".schema.json"). */
export function loadSchemas({ root = CASES_ROOT } = {}) {
  const base = join(root, 'schemas');
  const schemas = new Map();
  if (!existsSync(base)) return schemas;
  for (const file of walk(base).filter((f) => f.endsWith('.schema.json')))
    schemas.set(posix(relative(base, file)).replace(/\.schema\.json$/, ''), JSON.parse(readFileSync(file, 'utf8')));
  return schemas;
}

export function source({ root = CASES_ROOT } = {}) {
  return JSON.parse(readFileSync(join(root, 'SOURCE.json'), 'utf8'));
}
