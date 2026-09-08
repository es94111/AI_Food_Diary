export type McpErrorCode =
  | "FORBIDDEN"
  | "INVALID_INPUT"
  | "MCP_OPERATION_NOT_ALLOWED"
  | `MCP_${string}_NOT_ALLOWED`
  | "MCP_REQUEST_CANCELLED"
  | "MCP_TIMEOUT"
  | "RATE_LIMITED"
  | "RESOURCE_ALREADY_EXISTS"
  | "RESOURCE_NOT_FOUND"
  | "RESTORE_CONFLICT"
  | "RESTORE_NOT_ALLOWED"
  | "INTERNAL_ERROR";

export class McpApplicationError extends Error {
  readonly code: McpErrorCode;
  readonly status: number;

  constructor(code: McpErrorCode, message: string, status = 400) {
    super(message);
    this.name = "McpApplicationError";
    this.code = code;
    this.status = status;
  }
}

export function publicMcpError(error: unknown): {
  code: McpErrorCode;
  message: string;
} {
  if (error instanceof McpApplicationError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: "INTERNAL_ERROR",
    message: "The operation could not be completed.",
  };
}
