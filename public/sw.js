// ============================================================================
// BUVİSAN - SERVICE WORKER (PWA) 🔧
// Çevrimdışı destek + push bildirim + hızlı yükleme
// ============================================================================

const CACHE_ADI = 'buvisan-v1';
const ONBELLEK_DOSYALARI = [
  '/',
  '/manifest.json',
];

// ─── KURULUM ───
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_ADI).then((cache) => cache.addAll(ONBELLEK_DOSYALARI))
      .catch(() => {})
  );
  self.skipWaiting();
});

// ─── AKTİVASYON ───
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_ADI).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ─── FETCH (ağ öncelikli, çevrimdışıysa önbellek) ───
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Sadece GET + kendi domainimiz
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // API ve Supabase isteklerini önbelleğe alma
  if (url.pathname.startsWith('/api/') || url.hostname.includes('supabase')) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        // Başarılıysa önbelleğe kopyala
        if (res && res.status === 200 && res.type === 'basic') {
          const kopya = res.clone();
          caches.open(CACHE_ADI).then((cache) => cache.put(event.request, kopya)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(event.request).then((c) => c || caches.match('/')))
  );
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
        ikon: gelen.ikon || gelen.icon || '/icon-192.png',
      };
    }
  } catch { /* yoksay */ }

  event.waitUntil(
    self.registration.showNotification(veri.baslik, {
      body: veri.mesaj,
      icon: veri.ikon,
      badge: '/icon-192.png',
      vibrate: [200, 100, 200],
      tag: 'buvisan-bildirim',
      renotify: true,
      data: { url: veri.url },
    })
  );
});

// ─── BİLDİRİME TIKLAMA ───
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const hedef = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((liste) => {
      // Açık sekme varsa odakla
      for (const c of liste) {
        if (c.url.includes(self.location.origin)) {
          c.focus();
          return c.navigate(hedef);
        }
      }
      // Yoksa yeni aç
      return clients.openWindow(hedef);
    })
  );
});
