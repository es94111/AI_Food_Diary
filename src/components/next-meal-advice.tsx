"use client";

import { MarkdownContent } from "@/components/markdown-content";

// Shape produced by the next-meal advice prompt (see AI_NEXT_MEAL_ADVICE_PROMPT).
// Every field is optional so a partial/loosely-typed model answer still renders
// whatever it did return instead of throwing.
type SuggestedMeal = {
  name?: string;
  items?: string[];
  calories?: number;
  protein?: number;
  fat?: number;
  carbs?: number;
  reason?: string;
};

type AvoidItem = { item?: string; reason?: string };

type NextMealAdvice = {
  remainingCalories?: number;
  suggestedMeal?: SuggestedMeal;
  avoid?: AvoidItem[];
  notes?: string;
};

// Parse the stored advice string into the structured shape. Returns null when the
// text isn't the expected JSON (e.g. an older plain-text answer or a custom prompt
// override) so the caller can fall back to rendering it as Markdown prose.
function parseAdvice(raw: string): NextMealAdvice | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Tolerate ```json fenced blocks some models add despite "no Markdown".
  const candidate = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1] ?? trimmed;
  if (!candidate.startsWith("{")) return null;
  try {
    const parsed: unknown = JSON.parse(candidate);
    if (
      parsed &&
      typeof parsed === "object" &&
      ("suggestedMeal" in parsed || "remainingCalories" in parsed || "avoid" in parsed)
    ) {
      return parsed as NextMealAdvice;
    }
  } catch {
    return null;
  }
  return null;
}

function MacroChip({ label, value, unit }: { label: string; value?: number; unit: string }) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return (
    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
      {label} {Math.round(value)}{unit}
    </span>
  );
}

export function NextMealAdvice({ advice }: { advice: string }) {
  const parsed = parseAdvice(advice);
  // Fall back to prose for non-JSON answers so nothing is ever shown as raw JSON.
  if (!parsed) {
    return <MarkdownContent className="mt-2 text-amber-900" content={advice} />;
  }

  const { remainingCalories, suggestedMeal, avoid, notes } = parsed;
  const hasRemaining = typeof remainingCalories === "number" && Number.isFinite(remainingCalories);

  return (
    <div className="mt-3 space-y-3 text-amber-900">
      {hasRemaining ? (
        <div className="rounded-xl bg-amber-100/70 px-3 py-2 text-sm font-semibold">
          {remainingCalories! < 0
            ? `今日已超標 ${Math.abs(Math.round(remainingCalories!))} kcal`
            : `今日剩餘可攝取 ${Math.round(remainingCalories!)} kcal`}
        </div>
      ) : null}

      {suggestedMeal ? (
        <div className="rounded-xl bg-white/70 p-3">
          {suggestedMeal.name ? <p className="font-black">{suggestedMeal.name}</p> : null}
          {suggestedMeal.items?.length ? (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm">
              {suggestedMeal.items.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          ) : null}
          {(suggestedMeal.calories ?? suggestedMeal.protein ?? suggestedMeal.fat ?? suggestedMeal.carbs) != null ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <MacroChip label="熱量" value={suggestedMeal.calories} unit=" kcal" />
              <MacroChip label="蛋白" value={suggestedMeal.protein} unit="g" />
              <MacroChip label="脂肪" value={suggestedMeal.fat} unit="g" />
              <MacroChip label="碳水" value={suggestedMeal.carbs} unit="g" />
            </div>
          ) : null}
          {suggestedMeal.reason ? <p className="mt-2 text-sm text-amber-800">{suggestedMeal.reason}</p> : null}
        </div>
      ) : null}

      {avoid?.length ? (
        <div>
          <p className="text-sm font-bold">建議避免</p>
          <ul className="mt-1 space-y-1 text-sm">
            {avoid.map((entry, index) => (
              <li key={`${entry.item ?? index}-${index}`}>
                <span className="font-semibold">{entry.item}</span>
                {entry.reason ? <span className="text-amber-800">：{entry.reason}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {notes ? <p className="text-xs text-amber-700">{notes}</p> : null}
    </div>
  );
}
