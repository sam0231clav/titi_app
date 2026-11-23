// Service worker de Titi: abre la app al instante (caché) y recibe las notificaciones push.
// La versión y la lista de archivos de la caché las rellena scripts/build.mjs en cada compilación.
const VERSION = "__VERSION__";
const PRECACHE = __PRECACHE__;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Caché primero (rápido) y actualización en segundo plano. Firebase/Firestore (otros dominios) no se tocan.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const clave = req.mode === "navigate" ? "./index.html" : req;
  e.respondWith(
    caches.match(clave, { ignoreSearch: true }).then((guardado) => {
      const red = fetch(req).then((r) => {
        if (r && r.ok) { const copia = r.clone(); caches.open(VERSION).then((c) => c.put(clave, copia)); }
        return r;
      }).catch(() => guardado);
      return guardado || red;
    })
  );
});

// ---------- Notificaciones push (Firebase Cloud Messaging) ----------
self.addEventListener("push", (e) => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch { p = { notification: { body: e.data ? e.data.text() : "" } }; }
  const n = p.notification || {};
  const d = p.data || {};
  const titulo = d.titulo || n.title || "Titi";
  const opciones = {
    body: d.cuerpo || n.body || "",
    icon: "assets/icon-192.png",
    badge: "assets/badge.png",
    tag: d.tag || undefined,
    data: { url: d.url || "./#/alertas" },
  };
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      // Si la app está abierta y a la vista, la propia app avisa (en vivo): no se duplica la notificación.
      if (ventanas.some((v) => v.visibilityState === "visible")) return;
      return self.registration.showNotification(titulo, opciones);
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const destino = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if ("focus" in v) { v.navigate(destino).catch(() => {}); return v.focus(); }
      }
      return self.clients.openWindow(destino);
    })
  );
});
