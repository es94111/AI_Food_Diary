import "server-only";

import { decryptJson } from "@/lib/encryption";
import { AI_PROVIDERS, isAiProviderId } from "@/lib/ai-providers";
import type { AiConfig } from "@/lib/ai";

export class AiNotConfiguredError extends Error {
  constructor() {
    super("AI_NOT_CONFIGURED");
    this.name = "AiNotConfiguredError";
  }
}

type ProfileLike = {
  aiProvider?: string | null;
  aiBaseUrl?: string | null;
  aiVisionModel?: string | null;
  aiTextModel?: string | null;
  encryptedAiApiKey?: unknown;
} | null | undefined;

type UserLike = {
  isAdmin?: boolean;
  profile?: ProfileLike;
};

function decryptApiKey(encrypted: unknown): string {
  if (!encrypted || typeof encrypted !== "object") return "";
  try {
    const value = decryptJson<string>(encrypted as never);
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

// Resolve the effective AI config for a user. Throws AiNotConfiguredError when
// the user has not set up a key (admins fall back to the operator's env key).
export function resolveUserAiConfig(user: UserLike): AiConfig {
  const profile = user.profile ?? null;
  const providerId = profile?.aiProvider;
  const apiKey = decryptApiKey(profile?.encryptedAiApiKey);

  if (apiKey && isAiProviderId(providerId)) {
    const provider = AI_PROVIDERS[providerId];
    const baseUrl = (provider.requiresBaseUrl ? profile?.aiBaseUrl?.trim() : provider.baseUrl) || "";
    const visionModel = profile?.aiVisionModel?.trim() || provider.defaultVisionModel;
    const textModel = profile?.aiTextModel?.trim() || provider.defaultTextModel;
    if (baseUrl && visionModel && textModel) {
      return { apiKey, baseUrl, visionModel, textModel };
    }
  }

  // Admin fallback: let the operator keep using the env-configured key without
  // per-user setup. Regular users must bring their own key.
  if (user.isAdmin && process.env.OPENAI_API_KEY) {
    return {
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL || process.env.OPENAI_API_BASE_URL || "https://api.openai.com/v1",
      visionModel: process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini",
      textModel: process.env.OPENAI_TEXT_MODEL || "gpt-4.1-mini"
    };
  }

  throw new AiNotConfiguredError();
}
