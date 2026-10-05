import { NextResponse } from 'next/server';
// İhtiyaç duyduğunda Supabase bağlantını buraya ekleyebilirsin
// import { createClient } from '@supabase/supabase-js';

export async function POST(request) {
  try {
    // 1. Dify'dan (Yapay Zekadan) gelen mesajı okuyoruz
    const body = await request.json();
    const { islem, veri } = body; 

    // 2. Yapay zekanın ne istediğine bakıyoruz
    if (islem === 'test_yap') {
      console.log("Yapay zekadan gelen veri:", veri);
      
      // Burada Supabase'e veri ekleme/silme komutlarını çalıştırabilirsin
      
      // 3. Yapay zekaya "İşlemi hallettim" mesajı gönderiyoruz
      return NextResponse.json({ 
        mesaj: "Sistem: Komutunu başarıyla aldım ve işlemi yaptım!", 
        durum: "basarili" 
      });
    }

    // Bilinmeyen bir komut gelirse uyar
    return NextResponse.json({ mesaj: "Bilinmeyen işlem komutu", durum: "hata" });
    
  } catch (error) {
    return NextResponse.json({ mesaj: "Bir hata oluştu", hata: error.message }, { status: 500 });
  }
}