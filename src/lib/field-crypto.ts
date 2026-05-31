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

// Resolve a HealthMetric's numeric value from its encrypted column, falling back
// to the legacy plaintext `value` (and finally 0 if neither is present).
export function decryptMetricValue(row: { value?: number | null; encValue?: unknown }): number {
  return decryptField<number>(row.encValue, row.value ?? 0);
}
