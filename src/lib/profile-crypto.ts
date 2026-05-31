import { encryptJson } from "./encryption";
import { decryptField } from "./field-crypto";

// Internal accessor view of the sensitive columns. Kept separate from the public
// generic param so Prisma's branded output types (Decimal, JsonValue) aren't
// structurally checked at the call site (which TS rejects against `unknown`).
type ProfileAccessor = {
  gender?: string | null;
  birthDate?: Date | string | null;
  heightCm?: number | null;
  weightKg?: number | string | { toString(): string } | null;
  encGender?: unknown;
  encBirthDate?: unknown;
  encHeightCm?: unknown;
  encWeightKg?: unknown;
};

type DecryptedBody = {
  gender: string | null;
  birthDate: string | null;
  heightCm: number | null;
  weightKg: number | null;
};

const ENC_KEYS = ["encGender", "encBirthDate", "encHeightCm", "encWeightKg"] as const;

// Returns a profile with the sensitive body fields decrypted into plaintext and
// the enc* columns stripped, so callers (and API responses) never see ciphertext.
// Non-sensitive columns pass through unchanged. birthDate is normalised to a
// string to match the API/UI contract. Generic + internal cast so any Prisma
// profile row is accepted without structural assignability errors.
export function decryptProfile<T extends object>(
  profile: T | null | undefined
): (Omit<T, (typeof ENC_KEYS)[number]> & DecryptedBody) | null {
  if (!profile) return null;
  const p = profile as ProfileAccessor;
  const birthRaw = p.birthDate;
  const birthFallback =
    birthRaw instanceof Date ? birthRaw.toISOString() : (birthRaw ?? null);

  const rest = { ...(profile as Record<string, unknown>) };
  for (const key of ENC_KEYS) delete rest[key];

  return {
    ...(rest as Omit<T, (typeof ENC_KEYS)[number]>),
    gender: decryptField<string | null>(p.encGender, p.gender ?? null),
    birthDate: decryptField<string | null>(p.encBirthDate, birthFallback),
    heightCm: decryptField<number | null>(p.encHeightCm, p.heightCm ?? null),
    weightKg: decryptField<number | null>(p.encWeightKg, p.weightKg != null ? Number(p.weightKg) : null)
  };
}

// Builds the Prisma write payload for the body fields: encrypts each provided
// field into its enc* column and clears the legacy plaintext column. Fields left
// undefined in the input are omitted (Prisma leaves them unchanged on update).
export function encryptProfileWrite(input: {
  gender?: string;
  birthDate?: string;
  heightCm?: number;
  weightKg?: number;
}) {
  const data: Record<string, unknown> = {};
  if (input.gender !== undefined) {
    data.encGender = encryptJson(input.gender);
    data.gender = null;
  }
  if (input.birthDate !== undefined) {
    data.encBirthDate = encryptJson(input.birthDate);
    data.birthDate = null;
  }
  if (input.heightCm !== undefined) {
    data.encHeightCm = encryptJson(input.heightCm);
    data.heightCm = null;
  }
  if (input.weightKg !== undefined) {
    data.encWeightKg = encryptJson(input.weightKg);
    data.weightKg = null;
  }
  return data;
}
