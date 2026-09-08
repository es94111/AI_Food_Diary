import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  appendAiAuditEvent,
  decryptAuditState,
  type AiResourceType,
} from "@/lib/mcp/audit";
import { mealToMcpOutput, savedFoodToMcpOutput, waterLogToMcpOutput } from "@/lib/mcp/dto";
import { McpApplicationError } from "@/lib/mcp/errors";
import type { RestoreAiActivityInput } from "@/lib/mcp/schemas";
import { evaluateAiCreateRestore } from "@/lib/ai-restore-policy";

const filterValue = z.string().trim().min(1).max(128);
const dateValue = z
  .string()
  .trim()
  .max(64)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date");

export const aiActivityQuerySchema = z
  .object({
    from: dateValue.optional(),
    to: dateValue.optional(),
    userId: filterValue.optional(),
    actorSource: filterValue.optional(),
    mcpToolName: filterValue.optional(),
    resourceType: z.enum(["MEAL", "SAVED_FOOD", "WATER_LOG"]).optional(),
    action: filterValue.optional(),
    status: z.enum(["started", "succeeded", "failed"]).optional(),
    cursor: z.string().trim().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

export type AiActivityQuery = z.infer<typeof aiActivityQuerySchema>;
export type AiActivityViewer = {
  id: string;
  isAdmin: boolean;
};

const activityInclude = {
  user: { select: { id: true, name: true, email: true } },
  restoreEvents: {
    where: { action: "USER_RESTORE_SUCCEEDED", status: "succeeded" },
    orderBy: [{ occurredAt: "desc" as const }, { id: "desc" as const }],
    take: 1,
    select: {
      id: true,
      occurredAt: true,
      restoredAt: true,
      restoredByUserId: true,
      restoreReason: true,
    },
  },
} satisfies Prisma.AiAuditEventInclude;

type ActivityRow = Prisma.AiAuditEventGetPayload<{ include: typeof activityInclude }>;

type ActivityCursor = { occurredAt: string; id: string };

function encodeCursor(row: Pick<ActivityRow, "occurredAt" | "id">): string {
  return Buffer.from(
    JSON.stringify({ occurredAt: row.occurredAt.toISOString(), id: row.id }),
    "utf8",
  ).toString("base64url");
}

function decodeCursor(value: string): ActivityCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as ActivityCursor).id === "string" &&
      typeof (parsed as ActivityCursor).occurredAt === "string" &&
      !Number.isNaN(Date.parse((parsed as ActivityCursor).occurredAt))
    ) {
      return parsed as ActivityCursor;
    }
  } catch {
    // Fall through to the safe public error.
  }
  throw new McpApplicationError("INVALID_INPUT", "The activity cursor is invalid.");
}

function dayBoundary(value: string, end: boolean): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const result = new Date(`${value}T00:00:00.000Z`);
    if (end) result.setUTCDate(result.getUTCDate() + 1);
    return result;
  }
  return new Date(value);
}

export function activityRowToJson(row: ActivityRow) {
  const restore = row.restoreEvents[0];
  return {
    id: row.id,
    timestamp: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    userId: row.userId,
    user: row.user,
    actorType: row.actorType,
    actorSource: row.actorSource,
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    mcpToolName: row.mcpToolName,
    beforeState: decryptAuditState(row.beforeState),
    afterState: decryptAuditState(row.afterState),
    requestId: row.requestId,
    correlationId: row.correlationId,
    status: row.status,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    originalAiActionId: row.originalAiActionId,
    isRestored: Boolean(restore),
    restoredAt: restore?.restoredAt?.toISOString() ?? restore?.occurredAt.toISOString() ?? null,
    restoredBy: restore?.restoredByUserId ?? null,
    restoreActionId: restore?.id ?? null,
    restoreReason: row.restoreReason ?? restore?.restoreReason ?? null,
    resourceVersion: row.resourceVersion?.toISOString() ?? null,
  };
}

function ownerWhere(viewer: AiActivityViewer, requestedUserId?: string): Prisma.AiAuditEventWhereInput {
  if (!viewer.isAdmin) return { userId: viewer.id };
  return requestedUserId ? { userId: requestedUserId } : {};
}

export async function listAiActivity(
  viewer: AiActivityViewer,
  query: AiActivityQuery,
) {
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  const rows = await prisma.aiAuditEvent.findMany({
    where: {
      ...ownerWhere(viewer, query.userId),
      ...(query.actorSource ? { actorSource: query.actorSource } : {}),
      ...(query.mcpToolName ? { mcpToolName: query.mcpToolName } : {}),
      ...(query.resourceType ? { resourceType: query.resourceType } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: dayBoundary(query.from, false) } : {}),
              ...(query.to ? { lt: dayBoundary(query.to, true) } : {}),
            },
          }
        : {}),
      ...(cursor
        ? {
            OR: [
              { occurredAt: { lt: new Date(cursor.occurredAt) } },
              {
                occurredAt: new Date(cursor.occurredAt),
                id: { lt: cursor.id },
              },
            ],
          }
        : {}),
    },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    include: activityInclude,
  });
  const page = rows.slice(0, query.limit);
  return {
    events: page.map(activityRowToJson),
    nextCursor: rows.length > query.limit && page.length ? encodeCursor(page.at(-1)!) : null,
  };
}

async function getActivityRow(viewer: AiActivityViewer, id: string): Promise<ActivityRow> {
  const row = await prisma.aiAuditEvent.findFirst({
    where: { id, ...ownerWhere(viewer) },
    include: activityInclude,
  });
  if (!row) throw new McpApplicationError("RESOURCE_NOT_FOUND", "AI activity was not found.", 404);
  return row;
}

type RestoreResource = {
  exists: boolean;
  currentState: unknown;
  updatedAt?: Date;
  provenanceMatches: boolean;
  safeToDelete: boolean;
};

async function loadRestoreResource(row: ActivityRow): Promise<RestoreResource> {
  if (!row.resourceId) {
    return { exists: false, currentState: null, provenanceMatches: false, safeToDelete: false };
  }
  if (row.resourceType === "MEAL") {
    const record = await prisma.meal.findFirst({
      where: { id: row.resourceId, userId: row.userId },
      include: { items: true },
    });
    if (!record) return { exists: false, currentState: null, provenanceMatches: false, safeToDelete: false };
    return {
      exists: true,
      currentState: mealToMcpOutput(record),
      updatedAt: record.updatedAt,
      provenanceMatches:
        record.createdByType === "ai" &&
        record.createdByAiSource === "chatgpt_mcp" &&
        record.createdByRequestId === row.requestId,
      safeToDelete: record.imageStorageKeys.length === 0 && !record.imageStorageKey,
    };
  }
  if (row.resourceType === "SAVED_FOOD") {
    const record = await prisma.savedFood.findFirst({
      where: { id: row.resourceId, userId: row.userId },
    });
    if (!record) return { exists: false, currentState: null, provenanceMatches: false, safeToDelete: false };
    return {
      exists: true,
      currentState: savedFoodToMcpOutput(record),
      updatedAt: record.updatedAt,
      provenanceMatches:
        record.createdByType === "ai" &&
        record.createdByAiSource === "chatgpt_mcp" &&
        record.createdByRequestId === row.requestId,
      safeToDelete: !record.imageStorageKey,
    };
  }
  if (row.resourceType === "WATER_LOG") {
    const record = await prisma.waterLog.findFirst({
      where: { id: row.resourceId, userId: row.userId },
    });
    if (!record) return { exists: false, currentState: null, provenanceMatches: false, safeToDelete: false };
    return {
      exists: true,
      currentState: waterLogToMcpOutput(record),
      updatedAt: record.updatedAt,
      provenanceMatches:
        record.createdByType === "ai" &&
        record.createdByAiSource === "chatgpt_mcp" &&
        record.createdByRequestId === row.requestId,
      safeToDelete: true,
    };
  }
  return { exists: false, currentState: null, provenanceMatches: false, safeToDelete: false };
}

export type RestorePreview = {
  eligible: boolean;
  conflict: boolean;
  conflictReason: string | null;
  currentState: unknown;
  afterRestoreState: { exists: false; compensatesActionId: string };
  expectedVersion: string | null;
};

async function restorePreview(
  row: ActivityRow,
  ownerAuthorized: boolean,
): Promise<RestorePreview> {
  const resource = await loadRestoreResource(row);
  const decision = evaluateAiCreateRestore({
    ownerAuthorized,
    action: row.action,
    status: row.status,
    alreadyRestored: row.restoreEvents.length > 0,
    resourceVersion: row.resourceVersion,
    resource,
  });
  return {
    eligible: decision.eligible,
    conflict: !decision.eligible,
    conflictReason: decision.conflictReason,
    currentState: resource.currentState,
    afterRestoreState: { exists: false, compensatesActionId: row.id },
    expectedVersion: row.resourceVersion?.toISOString() ?? null,
  };
}

export async function getAiActivity(viewer: AiActivityViewer, id: string) {
  const row = await getActivityRow(viewer, id);
  return {
    event: activityRowToJson(row),
    restorePreview: await restorePreview(row, row.userId === viewer.id),
  };
}

async function appendRestoreFailure(input: {
  row: ActivityRow;
  userId: string;
  requestId: string;
  correlationId: string;
  reason: string;
  error: unknown;
}) {
  const known = input.error instanceof McpApplicationError ? input.error : null;
  await appendAiAuditEvent({
    userId: input.userId,
    actorType: "human",
    actorSource: "web_app",
    action: "USER_RESTORE_FAILED",
    resourceType: input.row.resourceType as AiResourceType,
    resourceId: input.row.resourceId,
    requestId: input.requestId,
    correlationId: input.correlationId,
    status: "failed",
    errorCode: known?.code ?? "INTERNAL_ERROR",
    errorMessage: known?.message ?? "The restore operation could not be completed.",
    originalAiActionId: input.row.id,
    restoredByUserId: input.userId,
    restoreReason: input.reason,
  }).catch((auditError) => console.error("Failed to append restore failure event", auditError));
}

export async function restoreAiActivity(
  viewer: AiActivityViewer,
  actionId: string,
  input: RestoreAiActivityInput,
  ids: { requestId?: string; correlationId?: string } = {},
) {
  const row = await getActivityRow(viewer, actionId);
  const requestId = ids.requestId ?? randomUUID();
  const correlationId = ids.correlationId ?? requestId;
  // Viewing can be delegated to an admin, but compensating a user's data must
  // remain an owner action under the application's existing ownership model.
  if (row.userId !== viewer.id) {
    const error = new McpApplicationError(
      "RESTORE_NOT_ALLOWED",
      "Only the resource owner can restore this AI action.",
      403,
    );
    await appendRestoreFailure({
      row,
      userId: viewer.id,
      requestId,
      correlationId,
      reason: input.reason,
      error,
    });
    throw error;
  }
  const preview = await restorePreview(row, true);
  if (!preview.eligible || !row.resourceId || !row.resourceVersion) {
    const error = new McpApplicationError(
      "RESTORE_CONFLICT",
      preview.conflictReason ?? "The AI action cannot be restored.",
      409,
    );
    await appendRestoreFailure({
      row,
      userId: viewer.id,
      requestId,
      correlationId,
      reason: input.reason,
      error,
    });
    throw error;
  }
  if (input.expectedVersion && input.expectedVersion !== preview.expectedVersion) {
    const error = new McpApplicationError(
      "RESTORE_CONFLICT",
      "The restore preview is stale. Refresh and review the current state.",
      409,
    );
    await appendRestoreFailure({
      row,
      userId: viewer.id,
      requestId,
      correlationId,
      reason: input.reason,
      error,
    });
    throw error;
  }
  await appendAiAuditEvent({
    userId: viewer.id,
    actorType: "human",
    actorSource: "web_app",
    action: "USER_RESTORE_STARTED",
    resourceType: row.resourceType as AiResourceType,
    resourceId: row.resourceId,
    beforeState: preview.currentState,
    afterState: preview.afterRestoreState,
    requestId,
    correlationId,
    status: "started",
    originalAiActionId: row.id,
    resourceVersion: row.resourceVersion,
    restoredByUserId: viewer.id,
    restoreReason: input.reason,
  });

  try {
    const restore = await prisma.$transaction(async (tx) => {
      const commonWhere = {
        id: row.resourceId!,
        userId: viewer.id,
        updatedAt: row.resourceVersion!,
        createdByType: "ai",
        createdByAiSource: "chatgpt_mcp",
        createdByRequestId: row.requestId,
      };
      const deleted =
        row.resourceType === "MEAL"
          ? await tx.meal.deleteMany({ where: { ...commonWhere, imageStorageKey: null, imageStorageKeys: { isEmpty: true } } })
          : row.resourceType === "SAVED_FOOD"
            ? await tx.savedFood.deleteMany({ where: { ...commonWhere, imageStorageKey: null } })
            : row.resourceType === "WATER_LOG"
              ? await tx.waterLog.deleteMany({ where: commonWhere })
              : { count: 0 };
      if (deleted.count !== 1) {
        throw new McpApplicationError(
          "RESTORE_CONFLICT",
          "The resource changed after preview; nothing was overwritten or deleted.",
          409,
        );
      }
      const now = new Date();
      const event = await appendAiAuditEvent(
        {
          userId: viewer.id,
          actorType: "human",
          actorSource: "web_app",
          action: "USER_RESTORE_SUCCEEDED",
          resourceType: row.resourceType as AiResourceType,
          resourceId: row.resourceId,
          beforeState: preview.currentState,
          afterState: preview.afterRestoreState,
          requestId,
          correlationId,
          status: "succeeded",
          originalAiActionId: row.id,
          resourceVersion: row.resourceVersion,
          restoredAt: now,
          restoredByUserId: viewer.id,
          restoreReason: input.reason,
        },
        tx,
      );
      return { event, restoredAt: now };
    });
    return {
      originalActionId: row.id,
      restoreActionId: restore.event.id,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      status: "SUCCEEDED" as const,
      restoredAt: restore.restoredAt.toISOString(),
    };
  } catch (error) {
    await appendRestoreFailure({
      row,
      userId: viewer.id,
      requestId,
      correlationId,
      reason: input.reason,
      error,
    });
    throw error;
  }
}
