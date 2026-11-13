// ============================================================================
// BUVİSAN - SERVICE WORKER (PWA) 🔧 v3
// ✅ Cache sürümü yükseltildi (eski önbellek temizlenir)
// ✅ HTML her zaman AĞDAN (asla eski sayfa gösterme)
// ✅ Safari Lockdown Mode uyumlu
// ============================================================================

const CACHE_ADI = 'buvisan-v3';

function cacheVar() {
  try { return typeof caches !== 'undefined' && !!caches; } catch { return false; }
}

// ─── KURULUM ───
self.addEventListener('install', (event) => {
  try { self.skipWaiting(); } catch {}
});

// ─── AKTİVASYON: eski cache'leri SİL ───
self.addEventListener('activate', (event) => {
  try { self.clients.claim(); } catch {}
  try {
    if (cacheVar()) {
      event.waitUntil(
        caches.keys()
          .then((keys) => Promise.all(
            keys.filter((k) => k !== CACHE_ADI).map((k) => caches.delete(k))
          ))
          .catch(() => {})
      );
    }
  } catch {}
});

// ─── FETCH ───
self.addEventListener('fetch', (event) => {
  try {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;
    if (url.pathname.startsWith('/api/')) return;

    // ⭐ SAYFA İSTEKLERİ: HER ZAMAN AĞDAN (eski HTML gösterme!)
    const sayfaMi =
      req.mode === 'navigate' ||
      req.destination === 'document' ||
      (req.headers.get('accept') || '').includes('text/html');

    if (sayfaMi) {
      event.respondWith(
        fetch(req, { cache: 'no-store' })
          .catch(() => {
            try { return caches.match('/'); } catch { return fetch(req); }
          })
      );
      return;
    }

    // ⭐ JS/CSS: AĞDAN, hata olursa cache
    const kodMu = req.destination === 'script' || req.destination === 'style';
    if (kodMu) {
      event.respondWith(
        fetch(req)
          .then((res) => {
            try {
              if (res && res.status === 200) {
                const kopya = res.clone();
                caches.open(CACHE_ADI).then((c) => c.put(req, kopya)).catch(() => {});
              }
            } catch {}
            return res;
          })
          .catch(() => {
            try { return caches.match(req).then((c) => c || fetch(req)); }
            catch { return fetch(req); }
          })
      );
      return;
    }

    // Diğer: cache-first
    if (!cacheVar()) return;
    event.respondWith(
      caches.match(req).then((c) => c || fetch(req).then((res) => {
        try {
          if (res && res.status === 200 && res.type === 'basic') {
            const kopya = res.clone();
            caches.open(CACHE_ADI).then((cc) => cc.put(req, kopya)).catch(() => {});
          }
        } catch {}
        return res;
      }).catch(() => fetch(req)))
    );
  } catch {
    // hiçbir şey yapma
  }
});

// ─── PUSH ───
self.addEventListener('push', (event) => {
  let veri = { baslik: 'BUVİSAN', mesaj: 'Yeni bildirim', url: '/' };
  try {
    if (event.data) {
      const g = event.data.json();
      veri = {
        baslik: g.baslik || g.title || 'BUVİSAN',
        mesaj: g.mesaj || g.body || 'Yeni bildirim',
        url: g.url || g.link || '/',
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

// ─── BİLDİRİM TIKLAMA ───
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
