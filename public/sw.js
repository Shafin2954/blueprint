// Blueprint service worker: makes the app open offline and install as an app.
// Pages: network first (so updates arrive), falling back to the cached copy.
// Hashed build assets and icons: cache first (they never change under the same URL).
const VERSION = "v1";
const CACHE = `blueprint-${VERSION}`;
const scope = new URL(self.registration.scope);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([scope.pathname])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("blueprint-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;

  const put = (res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  };

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then(put)
        .catch(() => caches.match(req).then((r) => r || caches.match(scope.pathname))),
    );
    return;
  }

  if (url.pathname.includes("/_next/static/") || url.pathname.includes("/icons/")) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then(put)));
    return;
  }

  // Everything else (RSC payloads, manifest…): network, then cache.
  event.respondWith(fetch(req).then(put).catch(() => caches.match(req)));
});
