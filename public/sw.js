/**
 * AYRA · Service Worker
 *
 * Amaç uygulamayı çevrimdışı çalıştırmak değil — kent verisi tazeliği önemli.
 * Yaptığı iş: uygulama kabuğunu ve statik varlıkları önbelleğe alarak tekrar
 * açılışları hızlandırmak, bağlantı koptuğunda anlamlı bir sayfa göstermek.
 *
 * API yanıtları ve HTML her zaman ağdan gelir (network-first); yalnızca ağ
 * başarısız olursa önbellekten okunur. Böylece kullanıcı asla eski bir sorun
 * listesini güncel sanmaz.
 */
const VERSION = "ayra-v1";
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

const PRECACHE = ["/cevrimdisi", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Statik varlıklar: önce önbellek (içerik hash'li olduğu için güvenli)
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then((hit) =>
        hit ?? fetch(request).then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME).then((c) => c.put(request, copy));
          return res;
        }),
      ),
    );
    return;
  }

  // Yüklenen görseller değişmez
  if (url.pathname.startsWith("/api/medya/")) {
    event.respondWith(
      caches.match(request).then((hit) =>
        hit ?? fetch(request).then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(RUNTIME).then((c) => c.put(request, copy)); }
          return res;
        }),
      ),
    );
    return;
  }

  // Diğer her şey: önce ağ
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && request.mode === "navigate") {
          const copy = res.clone();
          caches.open(RUNTIME).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") return caches.match("/cevrimdisi");
        return new Response("Çevrimdışı", { status: 503, statusText: "Offline" });
      }),
  );
});
