/* =========================================================
   Service worker — Registre d'infirmerie École Jules Verne
   L'application installée fonctionne même quand le serveur
   local n'est pas lancé : réponses instantanées depuis le
   cache, mises à jour silencieuses en arrière-plan.
   ========================================================= */
'use strict';

var CACHE = 'infirmerie-jv-v2';

var PRECACHE = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.webmanifest',
  './assets/blason-jules-verne.svg',
  './assets/logo-jules-verne.svg',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return Promise.all(PRECACHE.map(function (u) {
        return cache.add(u)['catch'](function () { /* un fichier absent ne bloque pas l'installation */ });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) {
        return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* « Stale-while-revalidate » : le cache répond immédiatement, le serveur
   rafraîchit le contenu en arrière-plan dès qu'il est joignable. */
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Les requêtes API ne sont jamais mises en cache
  if (url.pathname.indexOf('/api/') === 0) return;
  e.respondWith(
    caches.open(CACHE).then(function (cache) {
      return cache.match(req, { ignoreSearch: true }).then(function (cached) {
        var frais = fetch(req).then(function (resp) {
          if (resp && resp.status === 200 && resp.type === 'basic') {
            cache.put(req, resp.clone());
          }
          return resp;
        })['catch'](function () {
          if (cached) return cached;
          /* Toute navigation hors-ligne retombe sur l'application principale. */
          if (req.mode === 'navigate') return cache.match('./index.html');
          return new Response('Ressource indisponible hors connexion.', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        });
        return cached || frais;
      });
    })
  );
});
