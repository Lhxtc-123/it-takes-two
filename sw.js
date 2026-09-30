const CACHE_NAME = 'travelatlas-shell-v1'
const APP_SHELL = [
  './',
  './index.html',
  './offline.html',
  './manifest.webmanifest',
  './favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
]

function isSameOrigin(url) {
  return url.origin === self.location.origin
}

function isCacheableRequest(request) {
  if (request.method !== 'GET') return false

  const url = new URL(request.url)
  if (!isSameOrigin(url)) return false
  if (url.pathname.endsWith('/sw.js')) return false

  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font' ||
    request.destination === 'manifest'
  ) {
    return true
  }

  return (
    url.pathname.endsWith('/attraction-data.json') ||
    url.pathname.includes('/map-data/')
  )
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME)

  try {
    const response = await fetch(request)
    if (response.ok) {
      await cache.put('./index.html', response.clone())
    }
    return response
  } catch {
    return (
      (await cache.match(request)) ??
      (await cache.match('./index.html')) ??
      (await cache.match('./offline.html')) ??
      Response.error()
    )
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok && isCacheableRequest(request)) {
        await cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => null)

  if (cached) {
    void network
    return cached
  }

  const response = await network
  return response ?? Response.error()
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (!isSameOrigin(url)) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request))
    return
  }

  if (isCacheableRequest(request)) {
    event.respondWith(staleWhileRevalidate(request))
  }
})

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CACHE_URLS' || !Array.isArray(event.data.urls)) {
    return
  }

  const urls = [
    ...new Set(
      event.data.urls.filter((value) => {
        if (typeof value !== 'string') return false
        const url = new URL(value, self.location.origin)
        return (
          isSameOrigin(url) &&
          !url.pathname.endsWith('/sw.js') &&
          (url.pathname.includes('/assets/') ||
            url.pathname.includes('/icons/') ||
            url.pathname.endsWith('/manifest.webmanifest') ||
            url.pathname.endsWith('/attraction-data.json') ||
            url.pathname.includes('/map-data/'))
        )
      }),
    ),
  ]

  if (urls.length === 0) return

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        urls.map(async (url) => {
          const response = await fetch(url, { cache: 'no-cache' })
          if (response.ok) {
            await cache.put(url, response)
          }
        }),
      ),
    ),
  )
})
