import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getAiActivity } from "@/lib/ai-activity";
import {
  aiActivityErrorResponse,
  noStoreJson,
} from "@/lib/ai-activity-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const activityIdSchema = z.string().trim().min(1).max(128);

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const result = await getAiActivity(
      { id: user.id, isAdmin: user.isAdmin },
      activityIdSchema.parse(id),
    );
    return noStoreJson(result);
  } catch (error) {
    return aiActivityErrorResponse(error);
  }
}

