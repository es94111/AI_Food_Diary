import { NextResponse } from "next/server";
import { encryptJson } from "@/lib/encryption";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { aiSettingsSchema } from "@/lib/validators";

// Returns the user's saved AI settings. The API key itself is never returned —
// only whether one is set — so it can't be exfiltrated from the client.
export async function GET() {
  const user = await requireUser();
  const profile = user.profile;
  return NextResponse.json({
    settings: {
      provider: profile?.aiProvider ?? "openai",
      baseUrl: profile?.aiBaseUrl ?? "",
      visionModel: profile?.aiVisionModel ?? "",
      textModel: profile?.aiTextModel ?? "",
      hasKey: Boolean(profile?.encryptedAiApiKey)
    }
  });
}

export async function PATCH(request: Request) {
  const user = await requireUser();
  const body = aiSettingsSchema.parse(await request.json());

  const isCompatible = body.provider === "compatible";
  // For hosted providers the base URL is fixed by the catalog; only "compatible"
  // stores a user-supplied endpoint.
  const baseUrl = isCompatible ? body.baseUrl?.trim() || null : null;
  const visionModel = body.visionModel?.trim() || null;
  // Fall back the text model to the vision model so compatible setups need only one field.
  const textModel = body.textModel?.trim() || visionModel;

  const apiKey = body.apiKey?.trim();
  // Only overwrite the stored key when a new one is supplied; otherwise keep it.
  const encryptedAiApiKey = apiKey ? encryptJson(apiKey) : undefined;

  const data = {
    aiProvider: body.provider,
    aiBaseUrl: baseUrl,
    aiVisionModel: visionModel,
    aiTextModel: textModel,
    ...(encryptedAiApiKey ? { encryptedAiApiKey } : {})
  };

  await prisma.userProfile.upsert({
    where: { userId: user.id },
    update: data,
    create: { userId: user.id, ...data }
  });

  return NextResponse.json({ ok: true });
}
