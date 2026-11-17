// Imported into the PWA service worker (workbox importScripts). Shows push notifications sent by /api/notify.
self.addEventListener('push', (event) => {
  let d = {}
  try {
    const j = event.data ? event.data.json() : {}
    d = j.data || j.notification || j
  } catch {
    /* ignore */
  }
  const title = d.title || 'Chess 3D'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: d.body || 'It is your move.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: d.tag || 'chess3d',
      data: { url: d.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.navigate(url).catch(() => {})
          return c.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
