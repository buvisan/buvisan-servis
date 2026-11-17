# 📋 BUVİSAN SERVİS SİSTEMİ — DEVİR DOSYASI

> Bu dosya yeni oturumda devam etmek için hazırlandı.
> Son güncelleme: 2026-11-13

---

## 🎯 PROJE ÖZETİ

**servis.buvisan.com** — Vinç & asansör servis yönetim platformu
- **Repo:** `https://github.com/buvisan/buvisan-servis.git`
- **Klasör:** `C:\buvisan-backend-api`
- **Stack:** Next.js 16 + React 19 + Tailwind 4 + Supabase + Vercel
- **Diller:** Türkçe (tüm UI)
- **Kullanıcı:** Türkçe konuşuyor, adım adım otonom çalışma bekliyor

---

## 🚦 ÇALIŞMA KURALLARI (Kritik)

```
1. SADECE istenen şeyi yap — başka şey bozma
2. Her değişiklikten sonra DERLEME kontrolü:
   npm run build 2>&1 | Select-String -Pattern 'Type error|error TS|Error:'
3. Derleme geçince commit + push:
   git add -A; git commit -m "..."; git push origin main
4. Vercel otomatik deploy (2-4 dakika)
5. Türkçe karakter kullan, PowerShell'de UTF8 encoding ile yaz
6. Kullanıcı test eder, ekran görüntüsü atar
```

---

## ✅ TAMAMLANAN ÖZELLİKLER

### Çekirdek
- ✅ Admin kokpit + operasyon takibi
- ✅ Personel ekranı (rota, mesai, izin, prim)
- ✅ Planlayıcı (takvim, atama)
- ✅ Harita + rota optimizasyonu
- ✅ Müşteri takip (canlı konum)

### Formlar
- ✅ Servis raporu (A4, PDF, imza)
- ✅ Vinç periyodik bakım (27 madde)
- ✅ Asansör periyodik bakım (31 madde)
- ✅ Fiyat teklifi + PDF
- ✅ Malzeme satışı + irsaliye + PDF
- ✅ **Bakım sözleşmesi PDF** (Word şablonu birebir, 13 madde)

### Finans
- ✅ `completed_services` entegrasyonu
- ✅ KDV'siz tutar aktarımı
- ✅ Malzeme detayı
- ✅ Otomatik FİNANSTA işaretleme

### Müşteri Portalı (v4)
- ✅ Telefon + SMS / kullanıcı adı + şifre girişi
- ✅ Admin onaylı kayıt
- ✅ Evrensel firma eşleştirme (alias tablosu)
- ✅ 7 sekme: ÖZET / MAKİNE / SERVİS / TEKLİF / SOHBET / BAKIM / TALEP
- ✅ Canlı sohbet (Realtime)
- ✅ Pazarlık sistemi (kabul/red/revize)
- ✅ Kendi makine ekleme/silme
- ✅ Arıza talebi açma
- ✅ HESABIM ekstre kartı
- ✅ **BAKIM sekmesi** (sözleşme + takvim + tarih değiştirme)

### Bakım Sistemi (Birleştirilmiş)
- ✅ `/admin/bakim-takvimi` — tek ekran
- ✅ Sözleşme yönetimi (ekle/sil/PDF)
- ✅ Aşama: teklif / anlaşıldı
- ✅ Otomatik takvim oluşturma
- ✅ Yıl bazlı liste görünümü
- ✅ **Görsel 12 aylık takvim** (gün işaretleri)
- ✅ **Resmî + dinî tatiller** (2024-2035)
- ✅ Tarih değiştirme
- ✅ Yapıldı işaretleme

### Mobil
- ✅ PWA (iOS + Android)
- ✅ Push bildirim altyapısı
- ✅ Service worker v3 (otomatik güncelleme)

---

## 🔴 DEVAM EDEN İŞ (YARIM KALAN)

### Müşteri Arayüzü Yenileme — %40 TAMAM

**Yapılan:**
- ✅ Header modernize edildi (avatar + 3 metrik + yeşil nokta)
- ✅ Sekmeler pill stiline çevrildi (gradient aktif)

**YAPILACAK:**
```
1. ÖZET sekmesi hero kartı (gradient, istatistikler)
2. Kartların genel polish:
   - rounded-3xl → tutarlı
   - shadow-sm → shadow-md
   - Renk paleti birleştirme
3. MAKİNE sekmesi kartları
4. SERVİS sekmesi timeline görünümü
5. TEKLİF/Pazarlık kartları
6. SOHBET baloncukları
7. BAKIM sekmesi takvim görünümü
8. Boş durumlar (empty state) tasarımları
9. Yükleme iskeletleri (skeleton)
```

### Kullanıcının Son İsteği
> "müşteri ekranını en baştan yapalım, modern ve üst düzey, A Kalite olsun"

---

## 📊 VERİTABANI DURUMU

### Kritik Tablolar
| Tablo | Kayıt | Not |
|---|---|---|
| `cranes` | 288 | QR kodları — ASLA SİLME |
| `customers` | 172 | |
| `completed_services` | 661 | Finans kaynağı |
| `service_reports` | 53 | Servis formları |
| `bakim_formlari` | 12+ | Bakım formları |
| `musteri_hesaplar` | 2+ | Portal hesapları |
| `musteri_telefon_izinleri` | 1167 | Rehber |
| `maintenance_contracts` | 4 | Bakım sözleşmeleri |
| `bakim_plani` | 14+ | Bakım takvimi |
| `offers` | 250 | Teklifler |
| `satislar` | ? | Malzeme satışları |

### Çalıştırılan Son SQL'ler
```
143 → 202 (sırayla, hepsi çalıştırıldı)
En son: 202-musteri-bakim-fix.sql
```

### ⚠️ SQL Editor Kuralı
Supabase SQL Editor **hata olursa TÜM scripti geri alır**.
Her blok `begin ... exception when others then raise notice ... end;` içinde olmalı.
`%%` RAISE içinde güvenilmez — `%` kullan.

---

## 🎨 TASARIM DİLİ (Mevcut)

```
Renkler:
  slate-900/800  → başlıklar, header
  teal-600/cyan   → bakım, onay
  amber-500       → uyarı, teklif
  rose-600        → hata, gecikmiş
  indigo-600      → makine, düzenle
  violet-600      → sohbet, pazarlık
  emerald-600     → başarı, tamamlandı
  yellow-400      → vurgu, logo

Kartlar:
  rounded-2xl/3xl
  border border-slate-200
  shadow-sm/md

Butonlar:
  py-2.5/3.5
  rounded-xl
  font-black text-[10px]/[11px]
  uppercase

Font: font-black ağırlıklı (900)
Boyutlar: text-[8px] - text-[15px] mikro tipografi
```

---

## 📁 ÖNEMLİ DOSYALAR

### Sayfalar
```
app/page.tsx                        → Rol seçim
app/personel/page.tsx               → Personel ekranı
app/admin/page.tsx                  → Admin kokpit
app/admin/bakim-takvimi/page.tsx    → Bakım (birleşik)
app/admin/musteri-hesaplari/page.tsx → Müşteri yönetim
app/admin/satis/page.tsx            → Malzeme satışı
app/musteri/page.tsx                → Müşteri portalı (giriş)
```

### Bileşenler
```
components/MusteriPortaliV4.tsx           → Müşteri portalı ANA
components/admin/BakimSozlesmeler.tsx     → Sözleşme yönetimi
components/admin/BakimTakvimiYeni.tsx     → Liste takvim
components/admin/BakimTakvimiGorsel.tsx   → Görsel takvim
components/admin/MusteriDetay.tsx         → Müşteri detay paneli
components/ServisRaporuFormu.tsx          → A4 rapor
components/BakimFormu.tsx                 → Bakım formu
components/ImzaPad.tsx                    → İmza (hibrit)
```

### Kütüphaneler
```
lib/supabaseClient.ts    → Supabase bağlantısı
lib/personel.ts          → PERSONEL_LISTESI (5 kişi)
lib/bildirimler.ts       → Bildirim sayaçları
lib/yazdirPaylas.ts      → PDF üretimi (html2canvas + jsPDF)
lib/formHtml.ts          → A4 form şablonları
lib/sozlesmeHtml.ts      → Sözleşme PDF şablonu
lib/tatiller.ts          → Resmî + dinî tatiller
```

---

## 🔑 GÜVENLİK / KURALLAR

```
🚨 ASLA YAPMA:
  • QR kodlarını değiştirme (domain/path)
  • cranes tablosunu silme
  • /vinc/[id] rotasını auth'a alma
  • Personel prim bilgisini personel ekranına koyma

⚠️ DİKKAT:
  • Desktop UI pixel-identical kalmalı
  • Mobil kurallar breakpoint ile scope'lanmalı
  • Şema-bağımsız erişim: public.jalan(to_jsonb(x), 'kol1','kol2')
```

---

## 🎯 YENİ OTURUMDA BAŞLANGIÇ

```
"Merhaba, BUVİSAN servis sistemine devam ediyoruz.
DURUM.md dosyasını oku.

Son iş: Müşteri portalı arayüzünü modern ve A-kalite 
seviyeye çıkarmak. Header ve sekmeler yenilendi, 
kalan kartları (ÖZET hero, MAKİNE, SERVİS, TEKLİF, 
SOHBET, BAKIM) modernize etmemiz gerekiyor.

Dosya: components/MusteriPortaliV4.tsx
"
```

---

## 📈 İSTATİSTİK

```
SQL script:     ~85 dosya
Bileşen:        35+
Sayfa:          25+
Kod satırı:     ~50.000+
Commit:         100+
Süre:           Uzun soluklu, çok oturumlu
```

---

**Durum:** Sistem çalışıyor, sadece müşteri arayüzü polish kaldı.
