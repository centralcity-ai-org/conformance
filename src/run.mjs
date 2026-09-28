// The three ways to run the cases.
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { loadCases, loadSchemas } from './cases.mjs';

/** A draft 2020-12 validator with formats, as the protocol repository uses. */
export function schemaValidator(schemas = loadSchemas()) {
  const ajv = new Ajv2020({ strict: true, strictRequired: false, allErrors: true });
  addFormats(ajv);
  const compiled = new Map();
  for (const [key, schema] of schemas) compiled.set(key, ajv.compile(schema));
  return ({ schema, document }) => {
    const validate = compiled.get(schema);
    if (!validate) throw new Error(`No schema ${schema}`);
    return validate(document);
  };
}

function summarise(results) {
  const failed = results.filter((r) => !r.ok);
  const skipped = results.filter((r) => r.skipped);
  return {
    total: results.length,
    passed: results.length - failed.length - skipped.length,
    failed: failed.length,
    skipped: skipped.length,
    inconclusive: results.filter((r) => r.inconclusive).length,
    ok: failed.length === 0,
    results,
  };
}

/**
 * Self-check: the published schemas accept valid and semantic cases and reject invalid ones.
 */
export async function runSchemas(options = {}) {
  const validate = schemaValidator();
  const results = loadCases(options).map((c) => {
    const accepted = validate(c);
    const expected = c.verdict !== 'invalid';
    return { id: c.id, verdict: c.verdict, ok: accepted === expected, detail: accepted ? 'accepted' : 'rejected' };
  });
  return summarise(results);
}

/**
 * Your implementation's validator: `validate({ schema, document })` returns true to accept (or a
 * promise of it). A conforming implementation accepts valid cases and rejects invalid AND semantic
 * ones. Pass `schemaOnly: true` for a validator that only applies the JSON Schemas: semantic cases
 * are then reported but not counted as failures.
 */
export async function runValidator(validate, options = {}) {
  const results = [];
  for (const c of loadCases(options)) {
    let accepted;
    let detail;
    try {
      accepted = Boolean(await validate({ schema: c.schema, document: structuredClone(c.document) }));
      detail = accepted ? 'accepted' : 'rejected';
    } catch (error) {
      accepted = false;
      detail = `threw: ${String(error?.message ?? error).slice(0, 200)}`;
    }
    const expected = c.verdict === 'valid';
    const ok = accepted === expected || (options.schemaOnly && c.verdict === 'semantic');
    results.push({ id: c.id, verdict: c.verdict, ok, detail });
  }
  return summarise(results);
}

const MODERN = '2026-07-28';

function checkEndpoint(endpoint) {
  const url = new URL(endpoint);
  const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))
    throw new Error('Use an https endpoint (plain http only on loopback).');
  if (url.username || url.password || url.search || url.hash)
    throw new Error('The endpoint must not carry credentials, a query or a fragment.');
  return url;
}

async function rpc(url, token, method, params, name, fetchImpl) {
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    'mcp-protocol-version': MODERN,
    'mcp-method': method,
  };
  if (name) headers['mcp-name'] = name;
  if (token) headers.authorization = `Bearer ${token}`;
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method,
    params: {
      ...params,
      _meta: {
        'io.modelcontextprotocol/protocolVersion': MODERN,
        'io.modelcontextprotocol/clientInfo': { name: '@centralcity/conformance', version: '0.1.0' },
        'io.modelcontextprotocol/clientCapabilities': {},
      },
    },
  });
  const response = await fetchImpl(url, { method: 'POST', headers, body, redirect: 'error', signal: AbortSignal.timeout(30_000) });
  const text = await response.text();
  if (text.length > 4 * 1024 * 1024) throw new Error('Response too large.');
  if (!response.ok) return { httpError: response.status, text };
  const payload = (response.headers.get('content-type') ?? '').startsWith('text/event-stream')
    ? text.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).find((d) => d.includes('"result"') || d.includes('"error"'))
    : text;
  return JSON.parse(payload ?? '{}');
}

/** Codes that mean "the input was refused by validation" (not auth, limits or server errors). */
const VALIDATION = new Set(['invalid_arguments', 'invalid_request', 'cannot_remove_host', 'ack_beyond_latest', 'invalid_webhook_url', 'room_credential_required', 'same_workspace']);

function toolError(answer) {
  try {
    return JSON.parse(answer.result?.content?.[0]?.text ?? '{}').error ?? {};
  } catch {
    const text = answer.result?.content?.[0]?.text ?? '';
    return /^Input validation error:/.test(text) ? { code: 'invalid_arguments' } : {};
  }
}
const isRateLimited = (answer) => answer.httpError === 429 || (answer.result?.isError && toolError(answer).code === 'rate_limited');
const retryAfter = (answer) => Math.min(30_000, Math.max(1_000, Number(toolError(answer).retry_after_ms ?? 2_000)));

function refusal(answer) {
  const scope = (code) => ['insufficient_scope', 'unauthorized', 'authorization_expired', 'forbidden'].includes(code);
  if (answer.httpError === 401 || answer.httpError === 403)
    return { validation: false, unauthorized: true, detail: `not tested: HTTP ${answer.httpError} (the credential may not call this tool)` };
  if (answer.result?.isError && scope(toolError(answer).code))
    return { validation: false, unauthorized: true, detail: `not tested: ${toolError(answer).code}` };
  if (answer.result?.isError) {
    const code = toolError(answer).code ?? 'error';
    return { validation: VALIDATION.has(code), detail: VALIDATION.has(code) ? `refused: ${code}` : `refused for another reason: ${code}` };
  }
  if (answer.error)
    return answer.error.code === -32602
      ? { validation: true, detail: 'refused: JSON-RPC -32602' }
      : { validation: false, detail: `refused for another reason: JSON-RPC ${answer.error.code}` };
  if (answer.httpError)
    return answer.httpError === 400
      ? { validation: true, detail: 'refused: HTTP 400' }
      : { validation: false, detail: `refused for another reason: HTTP ${answer.httpError}` };
  return { validation: false, detail: 'accepted (should have been refused)' };
}

/**
 * A live MCP server: for every `mcp/<tool>.input` case,
 * - valid: the tool is listed and the server's own inputSchema accepts the case (never called);
 * - invalid and semantic: a tools/call with the case is refused (isError or a JSON-RPC error), so
 *   the server rejects before anything happens. Nothing valid is ever sent.
 * The token (for /mcp) comes from the caller, never from argv.
 */
export async function runMcp({ endpoint, token, fetch: fetchImpl = fetch, only = [] }) {
  const url = checkEndpoint(endpoint);
  const published = loadSchemas();
  const listed = await rpc(url, token, 'tools/list', {}, undefined, fetchImpl);
  if (!listed.result?.tools) throw new Error(`tools/list failed: ${JSON.stringify(listed).slice(0, 300)}`);
  const tools = new Map(listed.result.tools.map((tool) => [tool.name, tool]));
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  const results = [];
  for (const c of loadCases({ only: only.length ? only : ['mcp/'] }).filter((x) => x.schema.startsWith('mcp/') && x.schema.endsWith('.input'))) {
    const name = c.schema.slice(4, -'.input'.length);
    const tool = tools.get(name);
    if (!tool) {
      results.push({ id: c.id, verdict: c.verdict, ok: true, skipped: true, detail: 'tool not offered on this endpoint' });
      continue;
    }
    // The published schemas describe the authenticated tools. An endpoint may offer another variant
    // under the same name (for example the credential-bound room tools on /mcp/open): skip it when
    // the server's schema does not declare the published schema's properties.
    const mine = tool.inputSchema?.properties ?? {};
    const theirs = published.get(c.schema) ?? {};
    const missing = (theirs.required ?? []).filter((key) => !(key in mine));
    const extra = (tool.inputSchema?.required ?? []).filter((key) => !(key in (theirs.properties ?? {})));
    if (missing.length || extra.length) {
      results.push({ id: c.id, verdict: c.verdict, ok: true, skipped: true, detail: `this endpoint offers another variant of ${name}` });
      continue;
    }
    if (c.verdict === 'valid') {
      const accepted = ajv.validate(tool.inputSchema ?? {}, c.document);
      results.push({ id: c.id, verdict: c.verdict, ok: accepted, detail: accepted ? 'inputSchema accepts' : `inputSchema rejects: ${ajv.errorsText(ajv.errors).slice(0, 200)}` });
      continue;
    }
    let answer = await rpc(url, token, 'tools/call', { name, arguments: c.document }, name, fetchImpl);
    for (let wait = 0; wait < 3 && isRateLimited(answer); wait++) {
      await new Promise((resolve) => setTimeout(resolve, retryAfter(answer)));
      answer = await rpc(url, token, 'tools/call', { name, arguments: c.document }, name, fetchImpl);
    }
    const verdict = refusal(answer);
    if (verdict.unauthorized) {
      results.push({ id: c.id, verdict: c.verdict, ok: true, skipped: true, inconclusive: true, detail: verdict.detail });
      continue;
    }
    const refused = verdict.validation;
    const detail = verdict.detail;
    results.push({ id: c.id, verdict: c.verdict, ok: refused, detail });
  }
  return summarise(results);
}
