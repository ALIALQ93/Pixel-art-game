const CACHE = "pixel-games-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./color.html",
  "./puzzle-game.html",
  "./xo.html",
  "./xo.js",
  "./xo-net.js",
  "./style.css",
  "./game.js",
  "./color-worker.js",
  "./play-data.js",
  "./tutorial.js",
  "./home.js",
  "./manifest.json",
  "./favicon.svg",
  "./og-cover.png",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg",
  "./pwa-register.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: "window" }))
      .then((clients) => Promise.all(clients.map((client) => {
        if (typeof client.navigate === "function") return client.navigate(client.url).catch(() => {});
      })))
  );
});

function fromNetwork(request) {
  return fetch(request).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy));
    }
    return res;
  });
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  const isPage = e.request.mode === "navigate"
    || url.pathname.endsWith(".html")
    || url.pathname.endsWith("/");

  if (isPage) {
    e.respondWith(
      fromNetwork(e.request).catch(() =>
        caches.match(e.request).then((cached) => cached || caches.match("./index.html"))
      )
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cached) => cached || fromNetwork(e.request))
  );
});
