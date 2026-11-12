/* DOES PWA — network-first navigations (avoids ERR_FAILED on flaky cache) */
const CACHE = "does-shell-v3";
const PRECACHE = ["/manifest.webmanifest", "/does-logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event?.data?.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/webpack-hmr")) return;

  // HTML / SPA navigations: always network — never serve stale shells
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith(
      fetch(req).catch(
        () =>
          new Response("오프라인입니다. 연결을 확인해 주세요.", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          }),
      ),
    );
    return;
  }

  // Static assets: network first, cache fallback
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (req.destination === "script" || req.destination === "style" || req.destination === "image" || req.destination === "font")) {
          const copy = res.clone();
          void caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        return new Response("", { status: 504 });
      }),
  );
});
