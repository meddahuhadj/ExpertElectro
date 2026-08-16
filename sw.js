// Service Worker — HADJ EXPERT ÉLECTRO
// Met en cache l'app shell (index.html, manifest, icônes) pour un chargement
// hors-ligne fiable. Les appels à l'API Gemini (generativelanguage.googleapis.com),
// Google Fonts et pdf.js (CDN) ne sont JAMAIS interceptés : ce sont des données
// dynamiques ou des ressources tierces, pas l'app elle-même — le mode hors-ligne
// de l'app (diagnostic guidé, points de test, calculs) est géré côté page, pas ici.

const CACHE_NAME = 'hadj-expert-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ne jamais intercepter : requêtes non-GET, autre origine (API IA, CDN, fonts).
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Navigation (chargement de la page) : réseau en priorité pour avoir les
  // mises à jour, secours sur le cache si hors-ligne.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', clone));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Autres ressources internes (manifest, icônes) : cache d'abord, réseau en
  // secours, et mise à jour du cache en arrière-plan (stale-while-revalidate).
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
