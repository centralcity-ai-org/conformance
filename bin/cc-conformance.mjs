#!/usr/bin/env node
// cc-conformance: test your agent or server against Central City's protocol conformance cases.
//
//   cc-conformance schemas                         the published schemas agree with every case
//   cc-conformance validator ./my-validator.mjs    your validator: export default ({schema, document}) => boolean
//        [--schema-only]                           a JSON-Schema-only validator (semantic cases reported, not failed)
//   cc-conformance mcp https://host/mcp/open       a live MCP server: listed tools accept the valid cases
//                                                  (never sent) and refuse the invalid ones
//        token for /mcp: environment CC_CONFORMANCE_TOKEN (never on the command line)
//   common: [--only <prefix>]... [--json] [--verbose]
//
// Exit codes: 0 all cases pass, 1 a case failed, 2 usage or connection error.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { runMcp, runSchemas, runValidator } from '../src/run.mjs';
import { loadCases, source } from '../src/cases.mjs';

const USAGE = 'Usage: cc-conformance <schemas | validator <module> [--schema-only] | mcp <endpoint>> [--only <prefix>]... [--json] [--verbose]';

function parse(argv) {
  const positional = [];
  const only = [];
  const flags = new Set();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--only') only.push(argv[++i] ?? '');
    else if (arg.startsWith('--')) flags.add(arg.slice(2));
    else positional.push(arg);
  }
  return { positional, only, flags };
}

async function main() {
  const { positional, only, flags } = parse(process.argv.slice(2));
  const [mode, target] = positional;
  if (flags.has('help') || !mode) {
    console.log(USAGE);
    return mode ? 0 : 2;
  }
  if (flags.has('token')) {
    console.error('Pass the token in CC_CONFORMANCE_TOKEN, never on the command line.');
    return 2;
  }
  let report;
  try {
    if (mode === 'schemas') report = await runSchemas({ only });
    else if (mode === 'validator') {
      if (!target) throw new Error(USAGE);
      const module = await import(pathToFileURL(resolve(target)).href);
      const validate = module.default ?? module.validate;
      if (typeof validate !== 'function') throw new Error('The module must export a validate function (default or named "validate").');
      report = await runValidator(validate, { only, schemaOnly: flags.has('schema-only') });
    } else if (mode === 'mcp') {
      if (!target) throw new Error(USAGE);
      report = await runMcp({ endpoint: target, token: process.env.CC_CONFORMANCE_TOKEN, only });
    } else throw new Error(USAGE);
  } catch (error) {
    console.error(error.message);
    return 2;
  }
  const from = source();
  if (flags.has('json')) console.log(JSON.stringify({ cases_from: from, ...report }, null, 2));
  else {
    for (const result of report.results)
      if (!result.ok || flags.has('verbose'))
        console.log(`${result.ok ? (result.skipped ? 'SKIP' : 'PASS') : 'FAIL'} ${result.id}: ${result.detail}`);
    const notes = [];
    if (report.skipped - report.inconclusive) notes.push(`${report.skipped - report.inconclusive} not applicable (tool not offered here, or another variant)`);
    if (report.inconclusive) notes.push(`${report.inconclusive} not tested (the credential may not call the tool)`);
    console.log(
      `Cases from centralcity-ai-org/protocol ${from.version}: ${report.passed} pass, ${report.failed} fail` +
        (notes.length ? `; ${notes.join('; ')}` : '') +
        `. RESULT: ${report.ok ? 'CONFORMS' : 'DOES NOT CONFORM'}`,
    );
  }
  return report.ok ? 0 : 1;
}

process.exitCode = await main();
export { loadCases };
