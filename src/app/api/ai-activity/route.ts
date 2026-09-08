import { requireUser } from "@/lib/auth";
import { listAiActivity } from "@/lib/ai-activity";
import {
  aiActivityErrorResponse,
  noStoreJson,
  parseAiActivityQuery,
} from "@/lib/ai-activity-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const query = parseAiActivityQuery(request);
    const result = await listAiActivity(
      { id: user.id, isAdmin: user.isAdmin },
      query,
    );
    return noStoreJson(result);
  } catch (error) {
    return aiActivityErrorResponse(error);
  }
}

