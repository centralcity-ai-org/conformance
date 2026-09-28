import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { loadCases, loadSchemas } from '../src/cases.mjs';
import { runMcp, runSchemas, runValidator, schemaValidator } from '../src/run.mjs';

const cases = loadCases();
const semantic = cases.filter((c) => c.verdict === 'semantic').length;

test('the shipped cases: 187, each with a schema, all three verdicts present', () => {
  const schemas = loadSchemas();
  assert.equal(cases.length, 187);
  for (const c of cases) assert.ok(schemas.has(c.schema), c.id);
  for (const verdict of ['valid', 'invalid', 'semantic'])
    assert.ok(cases.some((c) => c.verdict === verdict), verdict);
});

test('schemas mode: the published schemas agree with every case', async () => {
  const report = await runSchemas();
  assert.equal(report.ok, true, report.results.filter((r) => !r.ok).map((r) => r.id).join(', '));
});

test('validator mode: a schema-only validator conforms with --schema-only, and misses the semantic cases without it', async () => {
  const validate = schemaValidator();
  assert.equal((await runValidator(validate, { schemaOnly: true })).ok, true);
  const strict = await runValidator(validate);
  assert.equal(strict.failed, semantic);
  assert.ok(strict.results.filter((r) => !r.ok).every((r) => r.verdict === 'semantic'));
});

test('validator mode: accept-everything, throwing and async validators are judged correctly', async () => {
  const lenient = await runValidator(() => true);
  assert.equal(lenient.failed, cases.filter((c) => c.verdict !== 'valid').length);
  const throwing = await runValidator(() => {
    throw new Error('nope');
  });
  assert.equal(throwing.failed, cases.filter((c) => c.verdict === 'valid').length);
  assert.ok(throwing.results.some((r) => r.detail.startsWith('threw: nope')));
  const only = await runValidator(async () => true, { only: ['manifest/'] });
  assert.ok(only.total > 0 && only.results.every((r) => r.id.startsWith('manifest/')));
});

/** A loopback MCP server that validates tool calls with the published schemas. */
async function fakeServer({ refuseSemantic = true, requireToken } = {}) {
  const schemas = loadSchemas();
  const validate = schemaValidator(schemas);
  const semanticIds = new Set(cases.filter((c) => c.verdict === 'semantic').map((c) => JSON.stringify(c.document)));
  const tools = [...schemas.keys()]
    .filter((k) => k.startsWith('mcp/') && k.endsWith('.input'))
    .map((k) => ({ name: k.slice(4, -6), inputSchema: schemas.get(k) }));
  const calls = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const message = JSON.parse(body);
    calls.push({ method: message.method, headers: request.headers, name: message.params?.name });
    const send = (value, status = 200) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify(value));
    };
    if (requireToken && request.headers.authorization !== `Bearer ${requireToken}`) return send({ error: 'unauthorized' }, 401);
    if (message.method === 'tools/list') return send({ jsonrpc: '2.0', id: 1, result: { tools } });
    const { name, arguments: args } = message.params;
    const ok = validate({ schema: `mcp/${name}.input`, document: args }) && !(refuseSemantic && semanticIds.has(JSON.stringify(args)));
    return send({
      jsonrpc: '2.0',
      id: 1,
      result: ok
        ? { content: [{ type: 'text', text: '{}' }], structuredContent: {} }
        : { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: { code: 'invalid_arguments', message: 'Check these fields.' } }) }] },
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { endpoint: `http://127.0.0.1:${server.address().port}/mcp`, calls, close: () => new Promise((r) => server.close(r)) };
}

test('mcp mode: valid cases are never sent; invalid and semantic ones must be refused by validation', async () => {
  const server = await fakeServer();
  try {
    const report = await runMcp({ endpoint: server.endpoint });
    assert.equal(report.ok, true, report.results.filter((r) => !r.ok).map((r) => `${r.id} ${r.detail}`).join('\n'));
    const called = server.calls.filter((c) => c.method === 'tools/call');
    const sendable = cases.filter((c) => c.schema.startsWith('mcp/') && c.schema.endsWith('.input') && c.verdict !== 'valid');
    assert.equal(called.length, sendable.length);
    assert.equal(server.calls[1].headers['mcp-name'], called[0].name);
    assert.equal(server.calls[0].headers.origin, undefined);
  } finally {
    await server.close();
  }
});

test('mcp mode: a server that accepts semantic cases does not conform; auth failures are not counted as refusals', async () => {
  const lax = await fakeServer({ refuseSemantic: false });
  try {
    const report = await runMcp({ endpoint: lax.endpoint });
    assert.equal(report.ok, false);
    assert.ok(report.results.filter((r) => !r.ok).every((r) => r.verdict === 'semantic'));
  } finally {
    await lax.close();
  }
  const guarded = await fakeServer({ requireToken: 'secret-token-value' });
  try {
    await assert.rejects(runMcp({ endpoint: guarded.endpoint }), /tools\/list failed/);
    assert.equal((await runMcp({ endpoint: guarded.endpoint, token: 'secret-token-value' })).ok, true);
  } finally {
    await guarded.close();
  }
  await assert.rejects(runMcp({ endpoint: 'http://example.com/mcp' }), /https/);
});
