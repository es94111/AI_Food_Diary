import { isValidTimeZone, type TzSpec } from "@/lib/dates";

/** Fallback zone used before a client has reported its timezone. */
export const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || "Asia/Taipei";

/** Cookie the web client sets so server-rendered pages know the device zone on the next load. */
export const TZ_COOKIE = "afd_tz";

function ianaSpec(tz: string | null | undefined): TzSpec | null {
  return tz && isValidTimeZone(tz) ? { kind: "iana", tz } : null;
}

/** Read an explicit per-request zone: `?tz=<IANA>` (web) or `?tzOffset=<minutes>` (mobile). */
function specFromParams(url: URL): TzSpec | null {
  const tz = url.searchParams.get("tz");
  const fromTz = ianaSpec(tz);
  if (fromTz) return fromTz;

  const offset = url.searchParams.get("tzOffset");
  if (offset != null && offset !== "") {
    const minutes = Number(offset);
    if (Number.isFinite(minutes) && Math.abs(minutes) <= 14 * 60) {
      return { kind: "offset", minutes };
    }
  }
  return null;
}

const fallback: TzSpec = { kind: "iana", tz: DEFAULT_TIMEZONE };

/** For API routes: explicit request param → stored profile zone → default. */
export function resolveRequestTz(request: Request, profileTimezone?: string | null): TzSpec {
  return specFromParams(new URL(request.url)) ?? ianaSpec(profileTimezone) ?? fallback;
}

/** For server-rendered pages (no per-request param): device cookie → stored profile zone → default. */
export function resolveUserTz(cookieTimezone?: string | null, profileTimezone?: string | null): TzSpec {
  return ianaSpec(cookieTimezone) ?? ianaSpec(profileTimezone) ?? fallback;
}

/** IANA name for a spec, for embedding back into client-bound URLs (offset specs fall back to default). */
export function tzName(spec: TzSpec): string {
  return spec.kind === "iana" ? spec.tz : DEFAULT_TIMEZONE;
}
