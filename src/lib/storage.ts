import "server-only";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

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
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image data URL");
  const [, contentType, base64] = match;
  const buffer = Buffer.from(base64, "base64");
  const ext = contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
  const key = `meals/${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  await createClient().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: buffer, ContentType: contentType })
  );
  return key;
}

export async function getImageObject(key: string) {
  return createClient().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
}

export async function deleteImage(key: string): Promise<void> {
  await createClient().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

// Returns true when the value is an S3 object key (not a legacy data URL)
export function isStorageKey(value: string): boolean {
  return !value.startsWith("data:") && !value.startsWith("http://") && !value.startsWith("https://");
}

