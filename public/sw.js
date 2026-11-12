// ============================================================================
// BUVİSAN - SERVICE WORKER (PWA) 🔧 v2
// ✅ Safari Lockdown Mode uyumlu (caches yoksa sayfa normal çalışır)
// ✅ Push bildirim + çevrimdışı destek
// ============================================================================

const CACHE_ADI = 'buvisan-v1';

// cache API güvenli erişim (Lockdown Mode / gizli mod)
function cacheVar() {
  try { return typeof caches !== 'undefined' && !!caches; } catch { return false; }
}

// ─── KURULUM ───
self.addEventListener('install', (event) => {
  try { self.skipWaiting(); } catch {}
  try {
    if (cacheVar()) {
      event.waitUntil(
        caches.open(CACHE_ADI).then((c) => c.addAll(['/'])).catch(() => {})
      );
    }
  } catch {}
});

// ─── AKTİVASYON ───
self.addEventListener('activate', (event) => {
  try { self.clients.claim(); } catch {}
  try {
    if (cacheVar()) {
      event.waitUntil(
        caches.keys()
          .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_ADI).map((k) => caches.delete(k))))
          .catch(() => {})
      );
    }
  } catch {}
});

// ─── FETCH ───
self.addEventListener('fetch', (event) => {
  try {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET') return;
    if (url.origin !== self.location.origin) return;
    if (url.pathname.startsWith('/api/')) return;

    // ⭐ Lockdown Mode → cache yok, tarayıcı normal devam etsin
    if (!cacheVar()) return;

    event.respondWith(
      fetch(event.request)
        .then((res) => {
          try {
            if (res && res.status === 200 && res.type === 'basic') {
              const kopya = res.clone();
              caches.open(CACHE_ADI).then((c) => c.put(event.request, kopya)).catch(() => {});
            }
          } catch {}
          return res;
        })
        .catch(() => {
          try {
            return caches.match(event.request).then((c) => c || caches.match('/')).catch(() => fetch(event.request));
          } catch {
            return fetch(event.request);
          }
        })
    );
  } catch {
    // Hiçbir şey yapma — tarayıcı normal devam etsin
  }
});

// ─── PUSH BİLDİRİM ───
self.addEventListener('push', (event) => {
  let veri = { baslik: 'BUVİSAN', mesaj: 'Yeni bildirim', url: '/' };
  try {
    if (event.data) {
      const gelen = event.data.json();
      veri = {
        baslik: gelen.baslik || gelen.title || 'BUVİSAN',
        mesaj: gelen.mesaj || gelen.body || 'Yeni bildirim',
        url: gelen.url || gelen.link || '/',
      };
    }
  } catch {}

  event.waitUntil(
    self.registration.showNotification(veri.baslik, {
      body: veri.mesaj,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [200, 100, 200],
      tag: 'buvisan',
      renotify: true,
      data: { url: veri.url },
    }).catch(() => {})
  );
});

// ─── BİLDİRİME TIKLAMA ───
self.addEventListener('notificationclick', (event) => {
  try { event.notification.close(); } catch {}
  const hedef = (event.notification && event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((liste) => {
        for (const c of liste) {
          if (c.url && c.url.indexOf(self.location.origin) === 0) {
            return c.focus().then(() => c.navigate(hedef)).catch(() => c.focus());
          }
        }
        return clients.openWindow(hedef);
      })
      .catch(() => clients.openWindow(hedef))
  );
});
