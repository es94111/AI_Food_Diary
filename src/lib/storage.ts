import "server-only";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { encryptBytes, decryptBytes } from "./encryption";

// Self-describing envelope for an encrypted image object. Layout:
//   "ENC1" | keyIdLen(1) | keyId | ctypeLen(1) | contentType | iv(12) | tag(16) | ciphertext
// The magic prefix lets reads detect encryption: objects written before this
// feature have no prefix (real image bytes never start with "ENC1") and are
// served as-is, so the change is backward compatible.
const ENVELOPE_MAGIC = Buffer.from("ENC1", "ascii");
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const IMAGE_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif"
} as const;

type SupportedImageType = keyof typeof IMAGE_EXTENSIONS;

function hasExpectedImageSignature(buffer: Buffer, contentType: SupportedImageType): boolean {
  switch (contentType) {
    case "image/jpeg":
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    case "image/png":
      return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case "image/webp":
      return buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
    case "image/gif":
      return buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"));
    case "image/avif":
      return buffer.length >= 16 && buffer.subarray(4, 8).toString("ascii") === "ftyp" && /avif|avis/.test(buffer.subarray(8, 32).toString("ascii"));
  }
}

function decodeImageDataUrl(dataUrl: string): { buffer: Buffer; contentType: SupportedImageType; ext: string } {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp|gif|avif));base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!match) throw new Error("Invalid or unsupported image data URL");
  const contentType = match[1].toLowerCase() as SupportedImageType;
  const base64 = match[2];
  const maxEncodedLength = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
  if (base64.length > maxEncodedLength) throw new Error("Image exceeds 6 MB limit");
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES || !hasExpectedImageSignature(buffer, contentType)) {
    throw new Error("Image content does not match its declared type");
  }
  return { buffer, contentType, ext: IMAGE_EXTENSIONS[contentType] };
}

// Encrypts [data] and wraps it (with its content type) in the envelope above.
function packEnvelope(data: Buffer, contentType: string): Buffer {
  const { v, iv, tag, ciphertext } = encryptBytes(data);
  const keyId = Buffer.from(v, "ascii");
  const ctype = Buffer.from(contentType, "ascii");
  return Buffer.concat([
    ENVELOPE_MAGIC,
    Buffer.from([keyId.length]),
    keyId,
    Buffer.from([ctype.length]),
    ctype,
    iv,
    tag,
    ciphertext
  ]);
}

// Returns the decrypted body + original content type, or null when [buffer] is
// not an encryption envelope (a legacy plaintext object).
function unpackEnvelope(buffer: Buffer): { body: Buffer; contentType: string } | null {
  if (buffer.length < ENVELOPE_MAGIC.length || !buffer.subarray(0, ENVELOPE_MAGIC.length).equals(ENVELOPE_MAGIC)) {
    return null;
  }
  let offset = ENVELOPE_MAGIC.length;
  const keyIdLen = buffer[offset++];
  const v = buffer.subarray(offset, offset + keyIdLen).toString("ascii");
  offset += keyIdLen;
  const ctypeLen = buffer[offset++];
  const contentType = buffer.subarray(offset, offset + ctypeLen).toString("ascii");
  offset += ctypeLen;
  const iv = buffer.subarray(offset, offset + 12);
  offset += 12;
  const tag = buffer.subarray(offset, offset + 16);
  offset += 16;
  const ciphertext = buffer.subarray(offset);
  return { body: decryptBytes({ v, iv, tag, ciphertext }), contentType };
}

function createClient() {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error("S3_ENDPOINT, S3_ACCESS_KEY, and S3_SECRET_KEY must be configured");
  }
  return new S3Client({
    endpoint,
    region: process.env.S3_REGION ?? "auto",
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true
  });
}

function bucket() {
  return process.env.S3_BUCKET ?? "food-diary-images";
}

export async function uploadImage(dataUrl: string, userId: string): Promise<string> {
  const { buffer, contentType, ext } = decodeImageDataUrl(dataUrl);
  const key = `meals/${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  // Encrypt at rest: the object body is an envelope (ciphertext + content type),
  // so the S3-level ContentType is generic and the real type travels inside.
  const body = packEnvelope(buffer, contentType);
  await createClient().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: "application/octet-stream" })
  );
  return key;
}

export async function getImageObject(key: string) {
  return createClient().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
}

// Fetches an image and returns its decrypted bytes + content type. Handles both
// encrypted (envelope) objects and legacy plaintext objects transparently.
// Returns null when the object is missing or has no body.
export async function getDecryptedImage(key: string): Promise<{ body: Buffer; contentType: string } | null> {
  const image = await getImageObject(key);
  if (!image.Body) return null;
  const raw = Buffer.from(await image.Body.transformToByteArray());
  const unpacked = unpackEnvelope(raw);
  if (unpacked) return unpacked;
  return { body: raw, contentType: image.ContentType ?? "application/octet-stream" };
}

/// Lists all object keys under [prefix] (handles pagination).
export async function listKeys(prefix: string): Promise<string[]> {
  const client = createClient();
  const out: string[] = [];
  let token: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken: token })
    );
    for (const o of res.Contents ?? []) if (o.Key) out.push(o.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}

/// Reads a text object (e.g. release notes). Returns null if missing.
export async function getObjectText(key: string): Promise<string | null> {
  try {
    const res = await createClient().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
    return res.Body ? await res.Body.transformToString() : null;
  } catch {
    return null;
  }
}

/// Returns the raw object (for streaming a download).
export async function getObject(key: string) {
  return createClient().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
}

// Migration helper: encrypt a legacy plaintext object in place. Idempotent —
// objects already wrapped in the envelope are left untouched.
export async function encryptExistingImage(key: string): Promise<"encrypted" | "already" | "missing"> {
  const image = await getImageObject(key).catch(() => null);
  if (!image?.Body) return "missing";
  const raw = Buffer.from(await image.Body.transformToByteArray());
  if (raw.length >= ENVELOPE_MAGIC.length && raw.subarray(0, ENVELOPE_MAGIC.length).equals(ENVELOPE_MAGIC)) {
    return "already";
  }
  const contentType =
    image.ContentType && image.ContentType !== "application/octet-stream" ? image.ContentType : "image/jpeg";
  await createClient().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: packEnvelope(raw, contentType),
      ContentType: "application/octet-stream"
    })
  );
  return "encrypted";
}

export async function deleteImage(key: string): Promise<void> {
  await createClient().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

// Returns true when the value is an S3 object key (not a legacy data URL)
export function isStorageKey(value: string): boolean {
  return !value.startsWith("data:") && !value.startsWith("http://") && !value.startsWith("https://");
}

