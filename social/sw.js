// aveysocial service worker: shows notifications for calls and messages when the app is closed
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data.json(); } catch (_) { d = { title: 'aveysocial', body: e.data ? e.data.text() : '' }; }
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some(w => w.visibilityState === 'visible')) return; // app is open: it shows its own UI
    const call = d.kind === 'call';
    await self.registration.showNotification(d.title || 'aveysocial', {
      body: d.body || '',
      tag: d.tag || 'avey',
      renotify: true,
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      requireInteraction: call,
      vibrate: call ? [300, 150, 300, 150, 300] : [120],
      data: { kind: d.kind, from: d.from, url: d.url || './' }
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const d = e.notification.data || {};
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.length) { await wins[0].focus(); wins[0].postMessage({ type: 'open', from: d.from }); }
    else await self.clients.openWindow(d.url || './');
  })());
});
