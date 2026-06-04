/* AIPM Nav Service Worker —— 提供离线访问与“添加到主屏”支持 */
const CACHE = 'aipm-nav-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // 页面导航：优先用网络（拿到最新版），断网时回退到缓存
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put('./index.html', cp)); return r; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 其它资源：缓存优先，回源后顺手缓存
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(r => {
      try {
        if (r && (r.status === 200 || r.type === 'opaque')) {
          const cp = r.clone();
          caches.open(CACHE).then(c => c.put(req, cp));
        }
      } catch (_) {}
      return r;
    }).catch(() => cached))
  );
});
