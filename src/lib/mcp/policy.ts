/**
 * System-wide MCP mutation policy.
 *
 * This module intentionally has no framework or `server-only` dependency so the
 * policy can be exercised directly by Node's test runner. Tool handlers must
 * call the assertion at the boundary; domain services still enforce their own
 * create-only contracts and never expose a generic mutation API.
 */

export const MCP_SPEC_VERSION = "2026-07-28" as const;
export const MCP_WRITE_POLICY = "CREATE_ONLY" as const;

export const MCP_CREATE_ONLY = true as const;
export const MCP_UPDATE_ALLOWED = false as const;
export const MCP_DELETE_ALLOWED = false as const;
export const MCP_UPSERT_ALLOWED = false as const;
export const MCP_RESTORE_ALLOWED = false as const;

export const MCP_ALLOWED_OPERATIONS = Object.freeze([
  "read",
  "list",
  "search",
  "get",
  "create",
  "append"
] as const);

export const MCP_DENIED_OPERATIONS = Object.freeze([
  "update",
  "edit",
  "patch",
  "modify",
  "delete",
  "remove",
  "overwrite",
  "replace",
  "upsert",
  "restore"
] as const);

export type McpAllowedOperation = (typeof MCP_ALLOWED_OPERATIONS)[number];
export type McpDeniedOperation = (typeof MCP_DENIED_OPERATIONS)[number];

const allowedOperations = new Set<string>(MCP_ALLOWED_OPERATIONS);
const deniedOperations = new Set<string>(MCP_DENIED_OPERATIONS);

export type McpPolicyErrorCode =
  | `MCP_${Uppercase<McpDeniedOperation>}_NOT_ALLOWED`
  | "MCP_OPERATION_NOT_ALLOWED";

const deniedMessages: Record<McpDeniedOperation, string> = {
  update: "MCP is create-only and cannot update existing data.",
  edit: "MCP is create-only and cannot edit existing data.",
  patch: "MCP is create-only and cannot patch existing data.",
  modify: "MCP is create-only and cannot modify existing data.",
  delete: "MCP is not permitted to delete data.",
  remove: "MCP is not permitted to remove data.",
  overwrite: "MCP create-only operations cannot overwrite existing data.",
  replace: "MCP create-only operations cannot replace existing data.",
  upsert: "MCP create-only operations cannot upsert existing data.",
  restore: "Restore is restricted to an authenticated human Web or App operation."
};

export class McpPolicyError extends Error {
  readonly code: McpPolicyErrorCode;
  readonly operation: string;

  constructor(code: McpPolicyErrorCode, message: string, operation: string) {
    super(message);
    this.name = "McpPolicyError";
    this.code = code;
    this.operation = operation;
  }
}

/**
 * Allow an operation only when it appears in the explicit MCP allowlist.
 * Unknown, blank, or newly introduced operations fail closed.
 */
export function assertMcpCreateOnlyOperation(operation: unknown): McpAllowedOperation {
  const rawOperation = typeof operation === "string" ? operation : "";
  const normalized = rawOperation.trim().toLowerCase();

  if (allowedOperations.has(normalized)) {
    return normalized as McpAllowedOperation;
  }

  if (deniedOperations.has(normalized)) {
    const deniedOperation = normalized as McpDeniedOperation;
    throw new McpPolicyError(
      `MCP_${deniedOperation.toUpperCase()}_NOT_ALLOWED` as McpPolicyErrorCode,
      deniedMessages[deniedOperation],
      normalized
    );
  }

  throw new McpPolicyError(
    "MCP_OPERATION_NOT_ALLOWED",
    "The requested operation is not present in the MCP allowlist.",
    normalized || rawOperation || "<invalid>"
  );
}
