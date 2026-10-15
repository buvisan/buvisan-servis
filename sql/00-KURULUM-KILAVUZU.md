# 🚀 DEV PAKET KURULUM KILAVUZU

> **Bu dosya, 7 fazlık Dev Paket'in kurulum sırasını gösterir.**
> Her SQL'i Supabase → SQL Editor'de **sırayla** çalıştır. Hata alırsan **devam et** — `80` çoğunu düzeltir, `79` son durumu söyler.

---

## ⚡ HIZLI YOL (5 adım)

```
1. 77-tam-sema-duzeltmesi.sql          ← SÜTUNLARI EKLER (zorunlu ilk adım)
2. 79-saglik-kontrolu.sql              ← DURUM RAPORU (Messages sekmesine bak)
3. 80-sema-bagimsiz-fonksiyonlar.sql   ← KRİTİK FONKSİYONLARI SAĞLAMLAŞTIRIR
4. 71 → 72 → 73 → 75 → 76 → 78         ← FAZ VERİ KATMANLARI
5. 79-saglik-kontrolu.sql              ← SON TEST (hepsi ✅ olmalı)
```

---

## 📋 DETAYLI SIRA (9 SQL)

| # | Dosya | Ne yapar | Zorunlu mu? |
|---|---|---|---|
| 1 | `77-tam-sema-duzeltmesi.sql` | 32 eksik sütunu ekler (cranes, service_tickets, appointments, service_reports, materials, offers) + veriden otomatik doldurur | ⚠️ **EVET — İLK BU** |
| 2 | `79-saglik-kontrolu.sql` | Eksik sütunları + fonksiyonları test eder | Önerilir |
| 3 | `80-sema-bagimsiz-fonksiyonlar.sql` | 4 kritik fonksiyonu şema-bağımsız hale getirir | ⭐ **ÇOK ÖNEMLİ** |
| 4 | `71-vinc-saglik-ve-kehanet.sql` | Sağlık skoru · kehanet · hafıza · parça ömrü | FAZ 2 |
| 5 | `72-bakim-takvimi-ve-kampanya.sql` | Bakım takvimi · akıllı plan · kampanya · fırsatlar | FAZ 3 |
| 6 | `73-personel-karnesi.sql` | Performans karnesi · yetkinlik · sıralama | FAZ 4 |
| 7 | `75-harita-ve-rota.sql` | Harita noktaları · bölge analizi · rota | FAZ 5 |
| 8 | `76-foto-fiyat-anomali.sql` | Foto AI tablosu · fiyat önerisi · anomali | FAZ 6 |
| 9 | `78-kayip-riski-ve-kar.sql` | Kayıp riski · canlı kâr · sezon tahmini | FAZ 7 |
| 10 | `79-saglik-kontrolu.sql` | **SON TEST** — hepsi ✅ olmalı | ✅ Kontrol |

> 💡 `80`, `71/72/75`'in fonksiyonlarını **daha sağlam** haliyle yeniden yazar.
> Yani `71/72/75` hata verse bile `80` düzeltir ✓

---

## 🖥️ KURULUM SONRASI EKRANLAR

| Faz | Ekran | Adres |
|---|---|---|
| 1 | 📊 Yönetim Kokpiti | `/admin/kokpit` |
| 2 | 🏗️ Vinç Sağlık Merkezi | `/admin/vinc-saglik` |
| 3 | 🗓️ Bakım Takvimi | `/admin/bakim-takvimi` |
| 4 | 🏆 Personel Performans | `/admin/personel-performans` |
| 5 | 🗺️ Rota & Harita | `/admin/rota-harita` |
| 6 | 📸 Akıllı Analiz | `/admin/akilli-analiz` |
| 7 | 🏆 Büyüme Merkezi | `/admin/buyume` |

**Hepsi admin panelde renkli buton olarak da var** ✓

---

## 🔧 SORUN GİDERME

### "column X does not exist" hatası
→ `77` çalıştırılmamış. **`77`'yi çalıştır**, sonra hata veren SQL'i tekrar dene.

### "function X does not exist"
→ O SQL çalıştırılmamış. Dosyayı tekrar çalıştır.

### Fonksiyon çalışıyor ama veri boş geliyor
→ Normal olabilir. O özelliğin verisi henüz yok (örn. koordinat girilmemişse harita boş).
→ `79`'un **4. bölümündeki veri durumu** tablosuna bak.

### Hangi konular asistan tarafından takip ediliyor?
→ `select count(*) from public.asistan_bekleyenler();`

### Her şeyi sıfırdan test et
→ `79-saglik-kontrolu.sql` çalıştır → **Messages** sekmesindeki raporu oku.

---

## 🔒 KORUNANLAR (Asla Değişmedi)

- ✅ **QR kodları** → `/vinc/<uuid>` aynı kaldı, tüm vinç kayıtları korundu
- ✅ **Mevcut veriler** → hiçbir script veri silmez
- ✅ **Personel ekranı** → çalışmaya devam ediyor
- ✅ **Telegram asistanı** → aktif
- ✅ **Maaş geçmiş koruması** → kilitli aylar değişmez

---

## 📊 DEV PAKET İÇERİĞİ

| Faz | Özellikler |
|---|---|
| **1** | Bugün/ay/yıl rakamlar · 12 aylık trend · iş öncelik skoru · öncelik kuyruğu · en iyi müşteriler · personel performansı |
| **2** | 0-100 vinç sağlık skoru · arıza kehaneti (risk %) · kurumsal hafıza (tekrarlayan sorunlar) · parça ömür analizi · model analizi |
| **3** | Yıllık 12 ay bakım takvimi · mevsim kampanyası (otomatik) · abonelik fırsatları (kademeli fiyat) · akıllı haftalık plan |
| **4** | Günlük skor tablosu (canlı) · aylık sıralama (madalyalı) · yetkinlik matrisi (tıkla-düzenle) · detaylı karne (6 aylık trend) |
| **5** | Leaflet canlı harita (5 katman) · akıllı rota (en yakın komşu) · bölge yoğunluğu analizi · yol tarifi |
| **6** | Gemini Vision foto analizi · dinamik fiyat önerisi · anomali alarmı (4 kontrol) · foto analiz geçmişi |
| **7** | Müşteri kayıp riski · canlı kâr sayacı · sezon tahmini (3 ay) · müşteri yaşam döngüsü huni |

---

## 🆘 ACİL DURUM

Bir şey ters giderse:
1. **Panik yapma** — tüm scriptler idempotent (tekrar çalıştırılabilir)
2. `79-saglik-kontrolu.sql` çalıştır → hataları gör
3. Hata mesajını **olduğu gibi** bana ilet

**Hiçbir script veri silmez.** En kötü durumda fonksiyonlar çalışmaz, ekranlar boş görünür — ama **verin güvende** ✓

---

*Son güncelleme: Dev Paket v1.0 — 7 faz tamamlandı*
