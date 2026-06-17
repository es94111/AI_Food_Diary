import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Versioned AES-256-GCM payload. `v` is the key id used to encrypt, so keys can
// be rotated without re-reading old rows: each ciphertext records which key
// produced it. Legacy payloads (written before key versioning) have no `v` and
// are treated as the LEGACY_KEY_ID below.
type EncryptedPayload = {
  v?: string;
  iv: string;
  tag: string;
  ciphertext: string;
};

// Key id assigned to ciphertext written before versioning existed, and to a
// bare ENCRYPTION_KEY when no explicit key map is configured.
const LEGACY_KEY_ID = "k1";

type KeyRing = {
  keys: Map<string, Buffer>;
  activeId: string;
};

let cachedKeyRing: KeyRing | null = null;

function decodeKey(value: string, label: string): Buffer {
  const buffer = Buffer.from(value, "base64");
  if (buffer.length !== 32) {
    throw new Error(`${label} must be a 32-byte base64 string`);
  }
  return buffer;
}

// Resolves the key ring from env. Two supported configurations:
//   1. Multi-key (recommended for rotation):
//        ENCRYPTION_KEYS='{"k1":"<base64>","k2":"<base64>"}'
//        ENCRYPTION_KEY_ACTIVE=k2
//   2. Single key (legacy / simple): ENCRYPTION_KEY=<base64>  -> id "k1"
// If both are present, ENCRYPTION_KEYS wins; a bare ENCRYPTION_KEY is merged in
// as "k1" when not already defined, so existing deployments keep working.
function getKeyRing(): KeyRing {
  if (cachedKeyRing) return cachedKeyRing;

  const keys = new Map<string, Buffer>();
  const rawKeys = process.env.ENCRYPTION_KEYS?.trim();

  if (rawKeys) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawKeys);
    } catch {
      throw new Error("ENCRYPTION_KEYS must be valid JSON of { keyId: base64Key }");
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("ENCRYPTION_KEYS must be a JSON object of { keyId: base64Key }");
    }
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value !== "string") {
        throw new Error(`ENCRYPTION_KEYS["${id}"] must be a base64 string`);
      }
      keys.set(id, decodeKey(value, `ENCRYPTION_KEYS["${id}"]`));
    }
  }

  // Merge a bare ENCRYPTION_KEY as the legacy id so old setups still decrypt.
  const singleKey = process.env.ENCRYPTION_KEY?.trim();
  if (singleKey && !keys.has(LEGACY_KEY_ID)) {
    keys.set(LEGACY_KEY_ID, decodeKey(singleKey, "ENCRYPTION_KEY"));
  }

  if (keys.size === 0) {
    throw new Error("No encryption key configured: set ENCRYPTION_KEYS or ENCRYPTION_KEY");
  }

  // The active key encrypts new data. Defaults: explicit ENCRYPTION_KEY_ACTIVE,
  // else the legacy id when present, else the sole/first key.
  const requestedActive = process.env.ENCRYPTION_KEY_ACTIVE?.trim();
  let activeId: string;
  if (requestedActive) {
    if (!keys.has(requestedActive)) {
      throw new Error(`ENCRYPTION_KEY_ACTIVE "${requestedActive}" is not present in the key ring`);
    }
    activeId = requestedActive;
  } else if (keys.has(LEGACY_KEY_ID)) {
    activeId = LEGACY_KEY_ID;
  } else {
    activeId = keys.keys().next().value as string;
  }

  cachedKeyRing = { keys, activeId };
  return cachedKeyRing;
}

// Test/rotation hook: drop the memoised key ring so a changed env is re-read.
export function resetEncryptionKeyRingCache() {
  cachedKeyRing = null;
}

/** The key id new ciphertext is currently written with. */
export function activeEncryptionKeyId(): string {
  return getKeyRing().activeId;
}

function keyFor(id: string): Buffer {
  const key = getKeyRing().keys.get(id);
  if (!key) {
    throw new Error(`No encryption key for id "${id}" (needed to decrypt). Configure it in ENCRYPTION_KEYS.`);
  }
  return key;
}

export function encryptJson(value: unknown): EncryptedPayload {
  const { activeId } = getKeyRing();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(activeId), iv, { authTagLength: 16 });
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final()
  ]);

  return {
    v: activeId,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };
}

export function decryptJson<T>(payload: EncryptedPayload): T {
  // Legacy payloads predate versioning; they were written with the legacy key.
  const keyId = payload.v ?? LEGACY_KEY_ID;
  // Pin the GCM auth tag to 16 bytes so a truncated tag can't be accepted.
  // Existing ciphertext already uses 16-byte tags, so this stays compatible.
  const decipher = createDecipheriv(
    "aes-256-gcm",
    keyFor(keyId),
    Buffer.from(payload.iv, "base64"),
    { authTagLength: 16 }
  );
  decipher.setAuthTag(Buffer.from(payload.tag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");

  return JSON.parse(plaintext) as T;
}

// Raw-bytes counterpart of the JSON helpers, for encrypting binary blobs (e.g.
// uploaded images) rather than serialisable values. Returns the components so a
// caller can build its own on-disk/in-object envelope.
export type EncryptedBytes = { v: string; iv: Buffer; tag: Buffer; ciphertext: Buffer };

export function encryptBytes(data: Buffer): EncryptedBytes {
  const { activeId } = getKeyRing();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(activeId), iv, { authTagLength: 16 });
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  return { v: activeId, iv, tag: cipher.getAuthTag(), ciphertext };
}

export function decryptBytes(payload: { v?: string; iv: Buffer; tag: Buffer; ciphertext: Buffer }): Buffer {
  const keyId = payload.v ?? LEGACY_KEY_ID;
  const decipher = createDecipheriv("aes-256-gcm", keyFor(keyId), payload.iv, { authTagLength: 16 });
  decipher.setAuthTag(payload.tag);
  return Buffer.concat([decipher.update(payload.ciphertext), decipher.final()]);
}

/** True if a payload was encrypted with a key other than the active one. */
export function needsReencryption(payload: EncryptedPayload): boolean {
  return (payload.v ?? LEGACY_KEY_ID) !== getKeyRing().activeId;
}

// Re-encrypt an existing payload under the active key. Used by the rotation
// script to migrate old ciphertext after a new active key is introduced.
export function reencrypt(payload: EncryptedPayload): EncryptedPayload {
  return encryptJson(decryptJson(payload));
}
