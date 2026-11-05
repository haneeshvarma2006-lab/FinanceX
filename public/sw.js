/*
 * NestedFlow's service worker: push notifications, and a page to show when
 * there is no connection.
 *
 * It deliberately caches none of the person's records. Every page and every
 * answer from the server comes from the network, as it would without this
 * file; only when a page cannot be reached at all does the offline page
 * stand in, so a stale balance is never shown as if it were current.
 */
const CACHE = 'nf-offline-v1';
const OFFLINE = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([OFFLINE, '/icons/icon-192.png']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  // Only page loads, and only when the network fails; everything else is
  // left to the browser exactly as if there were no service worker.
  if (event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE)));
});

/** A path on this site, or the notifications page: a push never opens elsewhere. */
function safePath(href) {
  return typeof href === 'string' && href.startsWith('/') && !href.startsWith('//')
    ? href
    : '/notifications';
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title =
    typeof data.title === 'string' && data.title ? data.title.slice(0, 120) : 'NestedFlow';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof data.body === 'string' ? data.body.slice(0, 300) : undefined,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      // One notification per thing: a second reminder for the same bill
      // replaces the first instead of stacking.
      tag: typeof data.tag === 'string' ? data.tag.slice(0, 64) : undefined,
      data: { href: safePath(data.href) },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(
    safePath(event.notification.data && event.notification.data.href),
    self.location.origin,
  ).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        if ('navigate' in open) await open.navigate(target);
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});

// The browser can replace a subscription; take the new one at once, and the
// app hands it to the server the next time it is opened.
self.addEventListener('pushsubscriptionchange', (event) => {
  const options = event.oldSubscription && event.oldSubscription.options;
  if (!options) return;
  event.waitUntil(self.registration.pushManager.subscribe(options));
});
