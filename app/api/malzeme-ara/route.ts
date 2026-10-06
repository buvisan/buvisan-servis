import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function POST(request: Request) {
  try {
    const { kelime } = await request.json();
    
    // DİKKAT: 'malzemeler' yazan yeri Supabase'deki kendi depo/stok tablonun adıyla değiştir!
    // 'urun_adi' veya 'parca_adi' gibi kendi sütun isimlerini de güncelle.
    const { data, error } = await supabase
      .from('malzemeler') 
      .select('*')
      .ilike('urun_adi', `%${kelime}%`)
      .limit(5); // En fazla 5 sonuç dönsün ki Kayo'nun kafası karışmasın

    if (error) throw error;

    if (data.length === 0) {
      return NextResponse.json({ sonuc: "Depoda bu isimde bir malzeme bulunamadı." }, { status: 200 });
    }

    // Bulunan malzemeleri Kayo'nun anlayacağı bir metne çeviriyoruz
    const döküm = data.map(item => `- ${item.marka || ''} ${item.urun_adi} (Stok: ${item.stok_adet}, Fiyat: ${item.birim_fiyat} ₺)`).join('\n');
    
    return NextResponse.json({ sonuc: `Depoda şunlar bulundu:\n${döküm}` }, { status: 200 });

  } catch (error: any) {
    return NextResponse.json({ hata: "Veritabanı hatası: " + error.message }, { status: 500 });
  }
}