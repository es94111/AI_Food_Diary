import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const ORIGIN = "https://food.example";
const workerSource = readFileSync("public/sw.js", "utf8");

type RequestLike = {
  url: string;
  method: string;
  mode: string;
  headers: { has(name: string): boolean };
};

type Handler = (event: Record<string, unknown>) => void;

function createWorker(fetchImplementation: (request: RequestLike | string) => Promise<Response>, cacheWritesFail = false) {
  const handlers = new Map<string, Handler>();
  const cachesByName = new Map<string, Map<string, Response>>();
  const keyFor = (request: RequestLike | string) => new URL(typeof request === "string" ? request : request.url, ORIGIN).href;
  const caches = {
    async open(name: string) {
      let entries = cachesByName.get(name);
      if (!entries) {
        entries = new Map();
        cachesByName.set(name, entries);
      }
      return {
        async match(request: RequestLike | string) {
          return entries?.get(keyFor(request))?.clone();
        },
        async put(request: RequestLike | string, response: Response) {
          if (cacheWritesFail) throw new Error("cache is full");
          entries?.set(keyFor(request), response.clone());
        },
        async addAll(urls: string[]) {
          for (const url of urls) {
            const response = await fetchImplementation(url);
            if (!response.ok) throw new Error(`Precache failed: ${url}`);
            entries?.set(keyFor(url), response.clone());
          }
        }
      };
    },
    async keys() { return [...cachesByName.keys()]; },
    async delete(name: string) { return cachesByName.delete(name); }
  };
  const self = {
    location: { origin: ORIGIN },
    clients: { async claim() {} },
    addEventListener(name: string, handler: Handler) { handlers.set(name, handler); },
    async skipWaiting() {}
  };
  runInNewContext(workerSource, { self, caches, fetch: fetchImplementation, URL, Response, Promise });

  return {
    handlers,
    cachesByName,
    async dispatch(name: string, request?: RequestLike) {
      let waitPromise: Promise<unknown> | undefined;
      let responsePromise: Promise<Response> | undefined;
      const event: Record<string, unknown> = {
        request,
        waitUntil(promise: Promise<unknown>) { waitPromise = promise; },
        respondWith(promise: Promise<Response>) { responsePromise = promise; }
      };
      handlers.get(name)?.(event);
      if (waitPromise) await waitPromise;
      return { responsePromise };
    }
  };
}

function sameOriginResponse(body: string, init: ResponseInit) {
  const response = new Response(body, init);
  Object.defineProperty(response, "type", { value: "basic" });
  return response;
}

function request(path: string, options: Partial<RequestLike> = {}): RequestLike {
  return {
    url: new URL(path, ORIGIN).href,
    method: "GET",
    mode: "cors",
    headers: { has: () => false },
    ...options
  };
}

test("install precaches only the generic offline page and public icons", async () => {
  const requested: string[] = [];
  const worker = createWorker(async (input) => {
    requested.push(typeof input === "string" ? input : input.url);
    return new Response("static asset");
  });
  await worker.dispatch("install");
  assert.deepEqual(requested, ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png"]);
  assert.deepEqual([...worker.cachesByName.keys()], ["ai-food-diary-static-v1"]);
});

test("API and dynamic Next data requests bypass all service worker caching", async () => {
  let networkRequests = 0;
  const worker = createWorker(async () => {
    networkRequests += 1;
    return new Response("private response", { headers: { "Content-Type": "application/json" } });
  });
  await worker.dispatch("fetch", request("/api/meals"));
  await worker.dispatch("fetch", request("/_next/data/build-id/dashboard.json"));
  assert.equal(networkRequests, 0);
  assert.equal(worker.cachesByName.size, 0);
});

test("only public static assets with safe response headers are cached", async () => {
  const worker = createWorker(async (input) => {
    const path = typeof input === "string" ? new URL(input, ORIGIN).pathname : new URL(input.url).pathname;
    if (path.endsWith("private.js")) {
      return sameOriginResponse("private", { headers: { "Content-Type": "application/javascript", "Cache-Control": "private" } });
    }
    if (path.endsWith("varied.js")) {
      return sameOriginResponse("varied", { headers: { "Content-Type": "application/javascript", Vary: "Cookie" } });
    }
    if (path.endsWith("wildcard.js")) {
      return sameOriginResponse("wildcard", { headers: { "Content-Type": "application/javascript", Vary: "*" } });
    }
    return sameOriginResponse("public", { headers: { "Content-Type": "application/javascript", "Cache-Control": "public, max-age=31536000" } });
  });

  const staticDispatch = await worker.dispatch("fetch", request("/_next/static/chunks/app.js"));
  await staticDispatch.responsePromise;
  const safeCache = worker.cachesByName.get("ai-food-diary-static-v1");
  assert.equal(safeCache?.has(`${ORIGIN}/_next/static/chunks/app.js`), true);

  const privateDispatch = await worker.dispatch("fetch", request("/_next/static/chunks/private.js"));
  await privateDispatch.responsePromise;
  assert.equal(safeCache?.has(`${ORIGIN}/_next/static/chunks/private.js`), false);

  for (const name of ["varied.js", "wildcard.js"]) {
    const varied = await worker.dispatch("fetch", request(`/_next/static/chunks/${name}`));
    await varied.responsePromise;
    assert.equal(safeCache?.has(`${ORIGIN}/_next/static/chunks/${name}`), false);
  }

  const queryDispatch = await worker.dispatch("fetch", request("/_next/static/chunks/app.js?user=1"));
  assert.equal(queryDispatch.responsePromise, undefined);

  const fullCacheWorker = createWorker(async () => sameOriginResponse("network asset", {
    headers: { "Content-Type": "application/javascript", "Cache-Control": "public" }
  }), true);
  const networkFallback = await fullCacheWorker.dispatch("fetch", request("/_next/static/chunks/app.js"));
  assert.ok(networkFallback.responsePromise);
  assert.equal(await (await networkFallback.responsePromise).text(), "network asset");
});

test("failed page navigations show the generic offline document without caching the page", async () => {
  const worker = createWorker(async () => { throw new TypeError("offline"); });
  const staticCache = new Map<string, Response>([[`${ORIGIN}/offline.html`, new Response("generic offline page")]]);
  worker.cachesByName.set("ai-food-diary-static-v1", staticCache);
  const navigation = request("/dashboard", { mode: "navigate" });
  const dispatched = await worker.dispatch("fetch", navigation);
  assert.ok(dispatched.responsePromise);
  assert.equal(await (await dispatched.responsePromise).text(), "generic offline page");
  assert.equal(staticCache.has(`${ORIGIN}/dashboard`), false);
});

test("activation removes only old application caches", async () => {
  const worker = createWorker(async () => new Response("asset"));
  worker.cachesByName.set("ai-food-diary-static-v0", new Map());
  worker.cachesByName.set("unrelated-cache", new Map());
  await worker.dispatch("activate");
  assert.deepEqual([...worker.cachesByName.keys()], ["unrelated-cache"]);
});
