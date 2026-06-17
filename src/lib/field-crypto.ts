import { encryptJson, decryptJson } from "./encryption";

// Helpers for per-field encryption: encrypt nullable values into a Prisma Json
// column, and read either the encrypted column or a legacy plaintext fallback
// (so rows not yet backfilled still work).
type EncryptedPayload = { v?: string; iv: string; tag: string; ciphertext: string };

export function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "iv" in value &&
    "tag" in value &&
    "ciphertext" in value
  );
}

// Encrypt a value for storage. Returns null for null/undefined so the column
// stays empty rather than storing an "encrypted null".
export function encryptField(value: unknown): EncryptedPayload | null {
  if (value === null || value === undefined) return null;
  return encryptJson(value);
}

// Read a possibly-encrypted field, falling back to a plaintext value when the
// encrypted column is empty (legacy/not-yet-backfilled rows). Decryption errors
// also fall back, so a single bad row can't take a request down.
export function decryptField<T>(stored: unknown, plaintextFallback: T): T {
  if (isEncryptedPayload(stored)) {
    try {
      return decryptJson<T>(stored);
    } catch {
      return plaintextFallback;
    }
  }
  return plaintextFallback;
}

// Resolve a HealthMetric's numeric value from its encrypted column. Returns null
// when there is no reading — and, crucially, also when an encrypted value is
// PRESENT but fails to decrypt (almost always an encryption-key mismatch after a
// rotated/regenerated ENCRYPTION_KEY). We deliberately do NOT fall back to 0 in
// that case: a silent 0 looks like a real reading and poisons downstream maths
// (it once overrode the profile weight/height and silently broke BMR/TDEE). The
// failure is logged so this otherwise-invisible class of bug is diagnosable.
// Callers that need a number should coalesce (`?? 0`); callers feeding the value
// into calculations should treat null/0 as "no reading".
export function decryptMetricValue(row: { value?: number | null; encValue?: unknown }): number | null {
  if (isEncryptedPayload(row.encValue)) {
    try {
      return decryptJson<number>(row.encValue);
    } catch (err) {
      console.error("decryptMetricValue: failed to decrypt encValue (encryption key mismatch?)", err);
      return null;
    }
  }
  return row.value ?? null;
}
