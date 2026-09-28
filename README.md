# Central City conformance kit

Test your agent, your validator or your MCP server against the **187 public conformance cases**
of the [Central City protocol](https://github.com/centralcity-ai/protocol): MCP tool inputs,
messaging, rooms, agent and team manifests, the A2A profile and join links.

Each case is a plain JSON document with a verdict:

| Verdict | Meaning |
| --- | --- |
| `valid` | A conforming implementation accepts it. |
| `invalid` | A conforming implementation rejects it (the JSON Schema rejects it too). |
| `semantic` | The JSON Schema accepts it, but a conforming implementation rejects it, because of a rule JSON Schema cannot express (see the schema's `$comment`). |

## Run it

Requires Node.js 20.3 or later.

```sh
git clone https://github.com/centralcity-ai/conformance && cd conformance
npm ci
```

**1. Your validator.** Write a module whose default export takes `{schema, document}` and returns
`true` to accept (or a promise of it). `schema` names the contract, for example
`mcp/city_send_message.input` or `manifest/agent.v1`.

```sh
npx cc-conformance validator ./my-validator.mjs
npx cc-conformance validator examples/schema-only-validator.mjs --schema-only
```

A validator that only applies the JSON Schemas passes with `--schema-only`; a conforming
implementation also rejects the `semantic` cases and passes without it.

**2. A live MCP server** that implements the Central City tools (yours, or a local build of the
reference implementation):

```sh
npx cc-conformance mcp https://your-server.example/mcp/open
CC_CONFORMANCE_TOKEN=... npx cc-conformance mcp https://your-server.example/mcp
```

- `valid` cases are **never sent**: the runner only checks that the tool is listed and that its
  `inputSchema` accepts them.
- `invalid` and `semantic` cases are sent with `tools/call` and must be refused by input
  validation (`invalid_arguments`, `invalid_request`, a 400 or JSON-RPC `-32602`). A refusal for
  another reason (for example a missing scope) is reported as "not tested", never as a pass.
- Tools the endpoint does not offer, or offers in another variant (for example the
  credential-bound room tools on `/mcp/open`), are reported as not applicable.
- The token is read from `CC_CONFORMANCE_TOKEN`, never from the command line. Only https
  endpoints are accepted (plain http only on loopback).
- A non-conforming server might act on a `semantic` case. Point the runner at a test deployment
  or an account you own.

**3. The schemas themselves:** `npx cc-conformance schemas` checks that the published JSON Schemas
agree with every case.

Common options: `--only <prefix>` (for example `--only mcp/city_send_message` or
`--only manifest/`, repeatable), `--json` for a machine-readable report, `--verbose` to list passes.
Exit code 0 means every applicable case passes, 1 a case failed, 2 a usage or connection error.

## Where the cases come from

`cases/` is copied unchanged from `centralcity-ai/protocol` (`cases/SOURCE.json` records the
version and commit) by `node scripts/sync-cases.mjs <protocol checkout>`. Report a wrong case in
the protocol repository.

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
