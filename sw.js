/* Aevy service worker: caches the app files so it opens fast and works as an installed app.
   Supabase API calls, realtime and other sites are never touched. Bump VERSION to force an update. */
var VERSION = 'aevy-v32';
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var r = e.request;
  if (r.method !== 'GET') return;
  var url = new URL(r.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.indexOf('/social/') !== -1) return;     /* Aevy Social lives in its own folder with its own files */               /* Supabase, fonts, etc: straight to the network */
  if (r.mode === 'navigate') {                              /* pages: network first, cached copy when offline */
    e.respondWith(fetch(r).then(function (res) {
      var c = res.clone(); caches.open(VERSION).then(function (ch) { ch.put('index.html', c); }); return res;
    }).catch(function () { return caches.match('index.html'); }));
    return;
  }
  e.respondWith(caches.open(VERSION).then(function (ch) {   /* files: show cached at once, refresh in background */
    return ch.match(r).then(function (hit) {
      var net = fetch(r).then(function (res) { if (res && res.ok) ch.put(r, res.clone()); return res; }).catch(function () { return hit; });
      return hit || net;
    });
  }));
});
