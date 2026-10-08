/* Service worker de la Libreta de Horas: deja la app disponible sin internet.
   Si cambiás algún archivo de la lista, subí el número de VERSION para que los dispositivos lo actualicen. */
const VERSION = 'v27';
const APP_CACHE = 'libreta-horas-app-' + VERSION;
const FONT_CACHE = 'libreta-horas-fonts';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './desktop-updates.js',
  './workspace.js',
  './workspace-ui.js',
  './workspace.css',
  './data.js',
  './pdf-report.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(APP_CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(k => k.startsWith('libreta-horas-') && k !== APP_CACHE && k !== FONT_CACHE)
        .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Fuentes de Google: se guardan la primera vez que hay internet y quedan para después.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(async cache => {
        const hit = await cache.match(req);
        const net = fetch(req).then(res => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        }).catch(() => null);
        return hit || (await net) || Response.error();
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Abrir la app: con internet trae la versión más nueva; sin internet usa la guardada.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(APP_CACHE).then(cache => cache.put('./index.html', copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Resto de los archivos propios: primero lo guardado.
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && res.ok) {
        const copy = res.clone();
        caches.open(APP_CACHE).then(cache => cache.put(req, copy));
      }
      return res;
    }))
  );
});
