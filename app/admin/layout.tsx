import MobilMenu from '@/components/MobilMenu';

// ----------------------------------------------------------------------------
// ADMIN ORTAK YERLEŞİM
// ----------------------------------------------------------------------------
//  Bu dosya /admin altındaki TÜM sayfaları otomatik sarar.
//  Telefon ve tablette alt menü ekler + içeriğin menü altında kalmaması için
//  aşağıdan boşluk bırakır.
//  Masaüstü görünümü DEĞİŞMEZ (menü lg:hidden).
// ----------------------------------------------------------------------------

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}

      {/* Mobil alt menünün içeriği kapatmaması için boşluk */}
      <div className="lg:hidden h-20" aria-hidden="true" />

      {/* Telefon / tablet alt menüsü */}
      <MobilMenu />
    </>
  );
}
