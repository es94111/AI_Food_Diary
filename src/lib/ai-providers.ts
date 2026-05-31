// Client-safe AI provider catalog (no server-only imports) so both the settings
// UI and the server-side resolver can share one source of truth.
export type AiProviderId = "openai" | "gemini" | "compatible";

export type AiProviderDef = {
  id: AiProviderId;
  label: string;
  // Fixed base URL for hosted providers. Empty for "compatible" (user supplies it).
  baseUrl: string;
  // Whether the user must enter their own base URL (OpenAI-compatible endpoints).
  requiresBaseUrl: boolean;
  defaultVisionModel: string;
  defaultTextModel: string;
  // Suggested models shown in the UI dropdown (empty => free-text input).
  models: string[];
  apiKeysUrl: string;
};

export const AI_PROVIDERS: Record<AiProviderId, AiProviderDef> = {
  openai: {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    requiresBaseUrl: false,
    defaultVisionModel: "gpt-4.1-mini",
    defaultTextModel: "gpt-4.1-mini",
    models: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o", "gpt-4o-mini"],
    apiKeysUrl: "https://platform.openai.com/api-keys"
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini",
    // Gemini's OpenAI-compatible endpoint. Must NOT have /v1 appended.
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    requiresBaseUrl: false,
    defaultVisionModel: "gemini-2.5-flash",
    defaultTextModel: "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
    apiKeysUrl: "https://aistudio.google.com/app/apikey"
  },
  compatible: {
    id: "compatible",
    label: "OpenAI 相容 API",
    baseUrl: "",
    requiresBaseUrl: true,
    defaultVisionModel: "",
    defaultTextModel: "",
    models: [],
    apiKeysUrl: ""
  }
};

export const AI_PROVIDER_IDS = Object.keys(AI_PROVIDERS) as AiProviderId[];

export function isAiProviderId(value: unknown): value is AiProviderId {
  return value === "openai" || value === "gemini" || value === "compatible";
}
