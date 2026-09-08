import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseMcpJsonBody,
  validateMcpProtocolRequest,
} from "../../src/lib/mcp/protocol";

const META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientCapabilities": {},
  "io.modelcontextprotocol/clientInfo": { name: "protocol-test", version: "1" },
};

function body(method = "tools/list", params: Record<string, unknown> = {}) {
  return { jsonrpc: "2.0", id: 1, method, params: { ...params, _meta: META } };
}

function request(
  payload: unknown,
  headers: Record<string, string> = {},
): Request {
  return new Request("https://food.example/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "mcp-protocol-version": "2026-07-28",
      "mcp-method": "tools/list",
      ...headers,
    },
    body: JSON.stringify(payload),
  });
}

test("accepts a complete MCP 2026-07-28 stateless request", () => {
  const payload = body();
  assert.equal(validateMcpProtocolRequest(request(payload), payload), null);
});

test("rejects missing or mismatched required protocol metadata", async () => {
  const payload = body();
  const missingHeader = request(payload);
  missingHeader.headers.delete("mcp-protocol-version");
  assert.equal(validateMcpProtocolRequest(missingHeader, payload)?.status, 400);

  const wrongVersion = request(payload, {
    "mcp-protocol-version": "2025-11-25",
  });
  const wrongVersionResponse = validateMcpProtocolRequest(wrongVersion, payload);
  assert.equal(wrongVersionResponse?.status, 400);
  assert.match(await wrongVersionResponse!.text(), /2026-07-28/);

  const missingMeta = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };
  assert.equal(
    validateMcpProtocolRequest(request(missingMeta), missingMeta)?.status,
    400,
  );

  const wrongMethod = request(payload, { "mcp-method": "server/discover" });
  assert.equal(validateMcpProtocolRequest(wrongMethod, payload)?.status, 400);
});

test("requires Mcp-Name for a named tools/call request", () => {
  const payload = body("tools/call", { name: "list_meals", arguments: {} });
  const headers = { "mcp-method": "tools/call" };
  assert.equal(validateMcpProtocolRequest(request(payload, headers), payload)?.status, 400);
  assert.equal(
    validateMcpProtocolRequest(
      request(payload, { ...headers, "mcp-name": "list_meals" }),
      payload,
    ),
    null,
  );

  assert.equal(
    validateMcpProtocolRequest(
      request(payload, {
        ...headers,
        "mcp-name": "=?base64?bGlzdF9tZWFscw==?=",
      }),
      payload,
    ),
    null,
  );
});

test("rejects legacy initialization and session dependency", async () => {
  const initialize = body("initialize");
  const initializeResponse = validateMcpProtocolRequest(
    request(initialize, { "mcp-method": "initialize" }),
    initialize,
  );
  assert.equal(initializeResponse?.status, 400);
  assert.match(await initializeResponse!.text(), /removed by MCP 2026-07-28/);

  const payload = body();
  const sessionRequest = request(payload, { "mcp-session-id": "legacy-session" });
  const sessionResponse = validateMcpProtocolRequest(sessionRequest, payload);
  assert.equal(sessionResponse?.status, 400);
  assert.match(await sessionResponse!.text(), /legacy MCP session identifiers/);
});

test("body parser enforces JSON and the request-size boundary", async () => {
  const valid = request(body());
  assert.deepEqual((await parseMcpJsonBody(valid)).body, body());

  const wrongMedia = new Request("https://food.example/mcp", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "{}",
  });
  assert.equal((await parseMcpJsonBody(wrongMedia)).rejection?.status, 415);

  const large = new Request("https://food.example/mcp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ data: "x".repeat(1024) }),
  });
  assert.equal((await parseMcpJsonBody(large, 64)).rejection?.status, 413);
});
