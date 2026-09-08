import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { decryptJson, encryptJson } from "@/lib/encryption";
import { McpPolicyError } from "./policy";
import { McpApplicationError, publicMcpError } from "./errors";

export const AI_ACTOR_SOURCE = "chatgpt_mcp" as const;

export type AiAuditAction =
  | "AI_READ_SUCCEEDED"
  | "AI_READ_FAILED"
  | "AI_CREATE_SUCCEEDED"
  | "AI_CREATE_FAILED"
  | "USER_RESTORE_STARTED"
  | "USER_RESTORE_SUCCEEDED"
  | "USER_RESTORE_FAILED";

export type AiAuditStatus = "started" | "succeeded" | "failed";
export type AiResourceType = "MEAL" | "SAVED_FOOD" | "WATER_LOG";

type AuditWriter = Pick<Prisma.TransactionClient, "aiAuditEvent">;

export type AppendAiAuditEventInput = {
  userId: string;
  actorType: "human" | "ai" | "system";
  actorSource: string;
  action: AiAuditAction;
  resourceType: AiResourceType;
  resourceId?: string | null;
  mcpToolName?: string | null;
  beforeState?: unknown;
  afterState?: unknown;
  requestId: string;
  correlationId: string;
  status: AiAuditStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  originalAiActionId?: string | null;
  resourceVersion?: Date | null;
  restoredAt?: Date | null;
  restoredByUserId?: string | null;
  restoreReason?: string | null;
};

function encryptedState(value: unknown): Prisma.InputJsonValue {
  return encryptJson(value) as Prisma.InputJsonValue;
}

export async function appendAiAuditEvent(
  input: AppendAiAuditEventInput,
  db: AuditWriter = prisma,
) {
  return db.aiAuditEvent.create({
    data: {
      userId: input.userId,
      actorType: input.actorType,
      actorSource: input.actorSource,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      mcpToolName: input.mcpToolName ?? null,
      beforeState:
        input.beforeState === undefined
          ? undefined
          : encryptedState(input.beforeState),
      afterState:
        input.afterState === undefined
          ? undefined
          : encryptedState(input.afterState),
      requestId: input.requestId,
      correlationId: input.correlationId,
      status: input.status,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage?.slice(0, 500) ?? null,
      originalAiActionId: input.originalAiActionId ?? null,
      resourceVersion: input.resourceVersion ?? null,
      restoredAt: input.restoredAt ?? null,
      restoredByUserId: input.restoredByUserId ?? null,
      restoreReason: input.restoreReason?.slice(0, 500) ?? null,
    },
  });
}

type EncryptedState = {
  v?: string;
  iv: string;
  tag: string;
  ciphertext: string;
};

function isEncryptedState(value: unknown): value is EncryptedState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const state = value as Record<string, unknown>;
  return (
    (state.v === undefined || typeof state.v === "string") &&
    typeof state.iv === "string" &&
    typeof state.tag === "string" &&
    typeof state.ciphertext === "string"
  );
}

export function decryptAuditState(value: unknown): unknown {
  if (value == null) return null;
  if (!isEncryptedState(value)) return { unavailable: true };
  try {
    return decryptJson<unknown>(value);
  } catch {
    return { unavailable: true };
  }
}

export function safeAuditFailure(error: unknown): {
  code: string;
  message: string;
} {
  if (error instanceof McpPolicyError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof McpApplicationError) return publicMcpError(error);
  return {
    code: "INTERNAL_ERROR",
    message: "The operation could not be completed.",
  };
}

export async function appendMcpFailure(input: {
  userId: string;
  operation: "read" | "create";
  resourceType: AiResourceType;
  toolName: string;
  requestId: string;
  correlationId: string;
  error: unknown;
}): Promise<void> {
  const failure = safeAuditFailure(input.error);
  await appendAiAuditEvent({
    userId: input.userId,
    actorType: "ai",
    actorSource: AI_ACTOR_SOURCE,
    action:
      input.operation === "create" ? "AI_CREATE_FAILED" : "AI_READ_FAILED",
    resourceType: input.resourceType,
    mcpToolName: input.toolName,
    requestId: input.requestId,
    correlationId: input.correlationId,
    status: "failed",
    errorCode: failure.code,
    errorMessage: failure.message,
  }).catch((auditError) => {
    console.error("Failed to append MCP failure audit event", auditError);
  });
}

