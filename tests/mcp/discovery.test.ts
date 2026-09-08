import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthInfo } from "@modelcontextprotocol/server";
import { aiFoodMcpHandler } from "../../src/lib/mcp/server";

const ALL_SCOPES = [
  "meals:read",
  "meals:create",
  "saved_foods:read",
  "saved_foods:create",
  "water_logs:read",
  "water_logs:create",
];

const authInfo: AuthInfo = {
  token: "test-token-never-returned",
  clientId: "test-client",
  scopes: ALL_SCOPES,
  expiresAt: 4_102_444_800,
  extra: { userId: "test-user" },
};

function mcpBody(method: string) {
  return {
    jsonrpc: "2.0",
    id: 1,
    method,
    params: {
      _meta: {
        "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        "io.modelcontextprotocol/clientCapabilities": {},
        "io.modelcontextprotocol/clientInfo": { name: "test", version: "1" },
      },
    },
  };
}

type DiscoveredTool = {
  name: string;
  inputSchema: { type?: string; additionalProperties?: boolean };
  outputSchema: { type?: string; additionalProperties?: boolean };
  annotations: {
    destructiveHint?: boolean;
    openWorldHint?: boolean;
    readOnlyHint?: boolean;
    idempotentHint?: boolean;
  };
  _meta: { securitySchemes: Array<{ type: string; scopes: string[] }> };
};

type McpResponse = {
  result: {
    supportedVersions?: string[];
    capabilities?: { tools?: unknown };
    tools?: DiscoveredTool[];
    _meta?: Record<string, unknown>;
  };
};

async function call(method: string): Promise<McpResponse> {
  const body = mcpBody(method);
  const request = new Request("http://localhost:3000/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "mcp-protocol-version": "2026-07-28",
      "mcp-method": method,
    },
    body: JSON.stringify(body),
  });
  const response = await aiFoodMcpHandler.fetch(request, {
    authInfo,
    parsedBody: body,
  });
  assert.equal(response.status, 200);
  return JSON.parse(await response.text()) as McpResponse;
}

test("modern server discovery exposes tool capability without initialize", async () => {
  const response = await call("server/discover");
  assert.deepEqual(response.result.supportedVersions, ["2026-07-28"]);
  assert.ok(response.result.capabilities?.tools);
  assert.deepEqual(
    response.result._meta?.["io.modelcontextprotocol/serverInfo"],
    {
      name: "ai-food-diary",
      version: "1.0.0",
      description: "Read and append food diary records with immutable AI audit provenance.",
    },
  );
});

test("tool discovery exposes exactly the read/create allowlist", async () => {
  const response = await call("tools/list");
  const tools = response.result.tools ?? [];
  const names = tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, [
    "create_meal",
    "create_saved_food",
    "create_water_log",
    "get_meal",
    "list_meals",
    "list_saved_foods",
    "list_water_logs",
    "search_meals",
    "search_saved_foods",
  ]);

  for (const tool of tools) {
    assert.equal(tool.inputSchema.type, "object");
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(tool.outputSchema.type, "object");
    assert.equal(tool.outputSchema.additionalProperties, false);
    assert.equal(tool.annotations.destructiveHint, false);
    assert.equal(tool.annotations.openWorldHint, false);
    assert.equal(tool.annotations.readOnlyHint, !tool.name.startsWith("create_"));
    assert.equal(tool.annotations.idempotentHint, !tool.name.startsWith("create_"));
    assert.equal(tool._meta.securitySchemes[0].type, "oauth2");
    assert.equal(tool._meta.securitySchemes[0].scopes.length, 1);
  }
});
