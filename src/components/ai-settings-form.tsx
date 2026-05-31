"use client";

import { useEffect, useState } from "react";
import { AI_PROVIDERS, AI_PROVIDER_IDS, type AiProviderId } from "@/lib/ai-providers";

const inputClass =
  "w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400";

export function AiSettingsForm() {
  const [provider, setProvider] = useState<AiProviderId>("openai");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/me/ai-settings");
        if (response.ok) {
          const { settings } = await response.json();
          const p: AiProviderId = AI_PROVIDER_IDS.includes(settings.provider) ? settings.provider : "openai";
          setProvider(p);
          setBaseUrl(settings.baseUrl ?? "");
          setModel(settings.visionModel || AI_PROVIDERS[p].defaultVisionModel);
          setHasKey(Boolean(settings.hasKey));
        }
      } catch {
        // keep defaults; the user can still configure
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function changeProvider(id: AiProviderId) {
    setProvider(id);
    setModel(AI_PROVIDERS[id].defaultVisionModel);
    setBaseUrl("");
  }

  async function save() {
    setSaving(true);
    setMessage("");
    const def = AI_PROVIDERS[provider];
    const modelValue = model.trim() || def.defaultVisionModel;
    const response = await fetch("/api/me/ai-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider,
        apiKey: apiKey.trim() || undefined,
        baseUrl: provider === "compatible" ? baseUrl.trim() : undefined,
        visionModel: modelValue,
        textModel: modelValue
      })
    });
    setSaving(false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setMessage(data?.error ?? data?.issues?.[0]?.message ?? "儲存失敗，請確認欄位是否正確。");
      return;
    }
    if (apiKey.trim()) setHasKey(true);
    setApiKey("");
    setMessage("已儲存 AI 設定。");
    setTimeout(() => setMessage(""), 2500);
  }

  const def = AI_PROVIDERS[provider];

  return (
    <div>
      <h3 className="text-base font-bold text-stone-700">AI 設定</h3>
      <p className="mt-1 text-sm text-stone-500">
        選擇 AI 服務商並輸入你自己的 API 金鑰。金鑰會加密儲存，僅用於分析你的餐點。
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-stone-400">載入中…</p>
      ) : (
        <div className="mt-4 grid gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-500">AI 服務商</label>
            <select className={inputClass} value={provider} onChange={(e) => changeProvider(e.target.value as AiProviderId)}>
              {AI_PROVIDER_IDS.map((id) => (
                <option key={id} value={id}>
                  {AI_PROVIDERS[id].label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-500">API 金鑰</label>
            <div className="flex gap-2">
              <input
                className={inputClass}
                type={showKey ? "text" : "password"}
                value={apiKey}
                autoComplete="off"
                placeholder={hasKey ? "已儲存金鑰，留空則維持不變" : "輸入你的 API 金鑰"}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="shrink-0 rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-600 transition-colors hover:bg-stone-50"
              >
                {showKey ? "隱藏" : "顯示"}
              </button>
            </div>
            {def.apiKeysUrl ? (
              <a href={def.apiKeysUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-medium text-amber-700 hover:underline">
                取得 {def.label} API 金鑰 →
              </a>
            ) : null}
          </div>

          {provider === "compatible" ? (
            <div>
              <label className="mb-1 block text-xs font-semibold text-stone-500">API Base URL</label>
              <input
                className={inputClass}
                type="text"
                value={baseUrl}
                placeholder="https://your-endpoint/v1"
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>
          ) : null}

          <div>
            <label className="mb-1 block text-xs font-semibold text-stone-500">模型</label>
            <input
              className={inputClass}
              type="text"
              value={model}
              list={def.models.length ? "ai-model-suggestions" : undefined}
              placeholder={provider === "compatible" ? "例如 gpt-4o" : def.defaultVisionModel}
              onChange={(e) => setModel(e.target.value)}
            />
            {def.models.length ? (
              <datalist id="ai-model-suggestions">
                {def.models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            ) : null}
            <p className="mt-1 text-xs text-stone-400">需支援圖片輸入（vision）才能分析餐點照片。</p>
          </div>

          {message ? <p className="text-sm font-medium text-amber-700">{message}</p> : null}

          <button
            onClick={save}
            disabled={saving}
            className="mt-1 w-full cursor-pointer rounded-xl bg-stone-950 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-stone-800 disabled:opacity-60"
            type="button"
          >
            {saving ? "儲存中…" : "儲存 AI 設定"}
          </button>
        </div>
      )}
    </div>
  );
}
