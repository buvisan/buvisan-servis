import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Supabase bağlantını .env.local dosyasından çeker
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function POST(request: Request) {
  try {
    // Kayo'nun gönderdiği JSON verisini alıyoruz
    const body = await request.json();
    const { parca_adi, miktar } = body;

    // BURASI SUPABASE VERİTABANI KODUN
    // Kendi tablona göre 'stoklar' ismini ve sütun isimlerini değiştirebilirsin
    /*
    const { data, error } = await supabase
      .from('stoklar')
      .update({ adet: mevcut_adet - miktar })
      .eq('parca_adi', parca_adi);
    */

    console.log(`[API LOG] Kayo'dan gelen istek: ${miktar} adet ${parca_adi}`);

    // Kayo'ya geri başarılı mesajı dönüyoruz
    return NextResponse.json({ 
      mesaj: `Gerçek veritabanından ${miktar} adet ${parca_adi} başarıyla düşüldü!` 
    }, { status: 200 });

  } catch (error) {
    return NextResponse.json({ hata: "API'de bir sorun oluştu." }, { status: 500 });
  }
}