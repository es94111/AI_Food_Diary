const CACHE_PREFIX = "ai-food-diary-";
const STATIC_CACHE = "ai-food-diary-static-v1";
const PRECACHE_URLS = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png"];
const PUBLIC_IMAGES = new Set(["/images/meal-journal.jpg"]);
const PUBLIC_ICONS = new Set(["/icons/icon-192.png", "/icons/icon-512.png"]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== STATIC_CACHE)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== "GET") return;
  if (url.pathname === "/api" || url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/data/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(STATIC_CACHE);
      return (await cache.match("/offline.html")) || new Response("目前離線", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
      });
    }));
    return;
  }

  if (!isPublicStaticAsset(request, url)) return;
  event.respondWith((async () => {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (isSafeStaticResponse(response)) {
      try {
        await cache.put(request, response.clone());
      } catch {
        // A full or unavailable cache must not break a successful network request.
      }
    }
    return response;
  })());
});

function isPublicStaticAsset(request, url) {
  if (url.search || request.headers.has("authorization")) return false;
  if (url.pathname.startsWith("/_next/static/")) return true;
  return PUBLIC_IMAGES.has(url.pathname) || PUBLIC_ICONS.has(url.pathname);
}

function isSafeStaticResponse(response) {
  if (!response.ok || response.type !== "basic") return false;
  if (response.headers.has("set-cookie")) return false;
  const cacheControl = response.headers.get("cache-control") || "";
  if (/\b(?:private|no-store)\b/i.test(cacheControl)) return false;
  const vary = (response.headers.get("vary") || "").toLowerCase().split(/\s*,\s*/);
  if (vary.includes("cookie") || vary.includes("*")) return false;
  const contentType = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  return /^(?:text\/css|text\/javascript|application\/(?:javascript|wasm)|image\/(?:avif|gif|jpeg|png|svg\+xml|webp)|font\/(?:woff|woff2)|application\/font-woff2?)$/.test(contentType);
}
