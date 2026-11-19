/* Aevy app install: registers the service worker and shows an "Install app" card on Android Chrome.
   Skipped inside the native Android app and when opened as file://. */
(function () {
  'use strict';
  var native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  var standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
  if ('serviceWorker' in navigator && /^https:|^http:\/\/localhost/.test(location.href) && !native) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
  if (native || standalone) return;
  var KEY = 'aevy.install.v1', ev = null, box = null;
  function off() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  function close(remember) { if (remember) { try { localStorage.setItem(KEY, '1'); } catch (e) {} } if (box) { box.remove(); box = null; } }
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); ev = e; if (off()) return;
    setTimeout(function () {
      if (box || !ev || document.querySelector('dialog[open]')) return;
      box = document.createElement('aside'); box.className = 'pwa-card'; box.setAttribute('aria-label', 'Install Aevy');
      box.innerHTML = '<img src="assets/icons/icon-192.png" width="44" height="44" alt=""><div><b>Install Aevy</b><small>Add the app to your home screen. Opens full screen, like a normal app.</small></div><button type="button" class="btn btn-primary btn-sm" data-pwa="yes">Install</button><button type="button" class="pwa-x" data-pwa="no" aria-label="Not now">&times;</button>';
      document.body.appendChild(box);
    }, 4000);
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-pwa]'); if (!b) return;
    if (b.dataset.pwa === 'no') { close(true); return; }
    if (ev) { ev.prompt(); ev.userChoice.then(function () { ev = null; close(true); }); }
  });
  window.addEventListener('appinstalled', function () { close(true); });
})();
