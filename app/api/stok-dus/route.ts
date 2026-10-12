import { NextResponse } from 'next/server';
import { adminMi, yetkiYok } from '@/lib/api-yetki';

// ----------------------------------------------------------------------------
// STOK DÜŞME UCU
// ----------------------------------------------------------------------------
// ⚠️ DÜRÜST DURUM: Bu uç daha önce SAHTEYDİ — gerçek stok düşme kodu yorum
//    satırındaydı, ama uç "başarıyla düşüldü" diye CEVAP VERİYORDU.
//    Yani çağıran (yapay zeka dahil) stok düştü sanıyordu, hiçbir şey olmuyordu.
//
//    Gerçek stok takibi mümkün değil çünkü `materials` tablosunda ADET alanı yok
//    (yalnızca isim, birim, alış/satış fiyatı, indirim var).
//
//    Bu yüzden uç artık yalan söylemiyor: durumu açıkça bildiriyor.
//    Gerçek stok takibi kurulduğunda (stok_adet + hareket tablosu) burası doldurulacak.
// ----------------------------------------------------------------------------

export async function POST(request: Request) {
  if (!(await adminMi(request)).ok) return yetkiYok();

  return NextResponse.json(
    {
      hata: 'Stok takibi henüz kurulmadı.',
      aciklama:
        'Depoda adet (stok) alanı bulunmuyor; bu yüzden otomatik stok düşme yapılamıyor. ' +
        'Gerçek stok takibi için materials tablosuna stok_adet eklenmesi ve bir stok hareket ' +
        'tablosu oluşturulması gerekiyor. O zamana kadar parça kullanımı servis raporunda ' +
        '(değişen parçalar + maliyet) kayıt altına alınmaya devam ediyor.',
    },
    { status: 501 }
  );
}
