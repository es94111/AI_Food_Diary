import "server-only";

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { HttpError } from "@/lib/http";
import {
  aiActivityQuerySchema,
  type AiActivityQuery,
} from "@/lib/ai-activity";
import { McpApplicationError } from "@/lib/mcp/errors";

const MAX_RESTORE_BODY_BYTES = 8 * 1024;

function safeRequestIdentifier(value: string | null): string | null {
  return value && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value)
    ? value
    : null;
}

export function requestAuditIdentifiers(request: Request): {
  requestId: string;
  correlationId: string;
} {
  const requestId =
    safeRequestIdentifier(request.headers.get("x-request-id")) ?? randomUUID();
  const correlationId =
    safeRequestIdentifier(request.headers.get("x-correlation-id")) ?? requestId;
  return { requestId, correlationId };
}

export function parseAiActivityQuery(request: Request): AiActivityQuery {
  const values: Record<string, string> = {};
  for (const [key, value] of new URL(request.url).searchParams) {
    if (key in values) {
      throw new McpApplicationError(
        "INVALID_INPUT",
        `The query parameter ${key} may only be provided once.`,
      );
    }
    values[key] = value;
  }
  return aiActivityQuerySchema.parse(values);
}

export async function parseRestoreBody(request: Request): Promise<unknown> {
  const mediaType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (mediaType !== "application/json") {
    throw new McpApplicationError(
      "INVALID_INPUT",
      "Content-Type must be application/json.",
      415,
    );
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_RESTORE_BODY_BYTES
  ) {
    throw new McpApplicationError(
      "INVALID_INPUT",
      "The restore request body is too large.",
      413,
    );
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_RESTORE_BODY_BYTES) {
    throw new McpApplicationError(
      "INVALID_INPUT",
      "The restore request body is too large.",
      413,
    );
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new McpApplicationError(
      "INVALID_INPUT",
      "The restore request body must be valid JSON.",
    );
  }
}

/**
 * Browser requests must be same-origin. Native app requests do not send
 * Origin/Sec-Fetch-Site and are authenticated by the same httpOnly session.
 */
export function assertHumanMutationOrigin(request: Request): void {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new McpApplicationError(
      "FORBIDDEN",
      "Cross-site restore requests are not allowed.",
      403,
    );
  }
  const origin = request.headers.get("origin");
  if (!origin) return;
  let normalized: string;
  try {
    normalized = new URL(origin).origin;
  } catch {
    throw new McpApplicationError("FORBIDDEN", "Invalid request origin.", 403);
  }
  if (normalized !== new URL(request.url).origin) {
    throw new McpApplicationError(
      "FORBIDDEN",
      "Cross-origin restore requests are not allowed.",
      403,
    );
  }
}

export function noStoreJson(body: unknown, init: ResponseInit = {}): NextResponse {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

export function aiActivityErrorResponse(error: unknown): NextResponse {
  if (error instanceof McpApplicationError) {
    return noStoreJson(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }
  if (error instanceof HttpError) {
    const code = error.status === 401 ? "UNAUTHORIZED" : "FORBIDDEN";
    return noStoreJson(
      { error: { code, message: error.publicMessage } },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return noStoreJson(
      {
        error: {
          code: "INVALID_INPUT",
          message: "The request contains invalid or unsupported fields.",
        },
      },
      { status: 400 },
    );
  }
  console.error("AI activity API failed", {
    errorType: error instanceof Error ? error.name : "UnknownError",
  });
  return noStoreJson(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "The operation could not be completed.",
      },
    },
    { status: 500 },
  );
}

