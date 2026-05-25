self.addEventListener('push', event => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Trax', {
      body: data.body ?? '',
      icon: '/favicon.svg',
      data: { url: data.url ?? '/' },
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url ?? '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.endsWith(url) && 'focus' in client) return client.focus()
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
