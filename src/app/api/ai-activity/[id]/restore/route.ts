import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { restoreAiActivity } from "@/lib/ai-activity";
import {
  aiActivityErrorResponse,
  assertHumanMutationOrigin,
  noStoreJson,
  parseRestoreBody,
  requestAuditIdentifiers,
} from "@/lib/ai-activity-http";
import { restoreAiActivitySchema } from "@/lib/mcp/schemas";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const activityIdSchema = z.string().trim().min(1).max(128);

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    assertHumanMutationOrigin(request);
    const user = await requireUser();
    const limited = await enforceRateLimit(`restore:ai-activity:${user.id}`, {
      limit: 10,
      windowSec: 600,
      message: "AI activity restore rate limit exceeded.",
    });
    if (limited) {
      return noStoreJson(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Restore requests are temporarily rate limited.",
          },
        },
        {
          status: 429,
          headers: {
            "Retry-After": limited.headers.get("Retry-After") ?? "600",
          },
        },
      );
    }

    const { id } = await context.params;
    const actionId = activityIdSchema.parse(id);
    const input = restoreAiActivitySchema.parse(await parseRestoreBody(request));
    const result = await restoreAiActivity(
      { id: user.id, isAdmin: user.isAdmin },
      actionId,
      input,
      requestAuditIdentifiers(request),
    );
    return noStoreJson(result);
  } catch (error) {
    return aiActivityErrorResponse(error);
  }
}

