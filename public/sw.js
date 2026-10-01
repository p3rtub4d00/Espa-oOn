self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = {}

  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'ClubeOn', body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'ClubeOn'
  const options = {
    body: data.body || 'Você recebeu uma nova notificação.',
    icon: '/clubeon-icon.svg?v=2',
    badge: '/clubeon-icon.svg?v=2',
    tag: data.tag || 'clubeon-notification',
    renotify: true,
    data: {
      url: data.url || '/admin',
    },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl = new URL(
    event.notification.data?.url || '/admin',
    self.location.origin,
  ).href

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl)
          return client.focus()
        }
      }

      if (clients.openWindow) return clients.openWindow(targetUrl)
      return undefined
    }),
  )
})
