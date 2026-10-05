export function withImageWidth(url: string, width: number): string {
  const parsed = new URL(url, "https://image.invalid");
  parsed.searchParams.set("w", String(width));
  if (/^https?:\/\//i.test(url)) return parsed.toString();
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function signedImageCacheControl(expiresAt: number, now = Date.now()): string {
  const maxAge = Math.max(0, Math.min(60, Math.floor((expiresAt - now) / 1000)));
  return `private, max-age=${maxAge}`;
}
