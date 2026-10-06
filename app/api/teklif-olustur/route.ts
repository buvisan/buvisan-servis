import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { firma_adi, iscilik_tutari, malzeme_tutari, toplam_tutar, odeme_kosullari } = body;

    // Supabase'deki 'offers' tablona Kayo'nun hazırladığı teklifi ekliyoruz
    const { data, error } = await supabase
      .from('offers')
      .insert([{
        customer_name: firma_adi,
        total_price: toplam_tutar,
        description: `Yapay Zeka Teklif Özeti:\n- Malzeme Tutarı: ${malzeme_tutari} ₺\n- İşçilik ve Kar Marjı: ${iscilik_tutari} ₺\n- Ödeme Koşulları: ${odeme_kosullari}`,
        offer_date: new Date().toISOString(),
        status: 'bekliyor',
        template_type: 'standart'
      }]);

    if (error) throw error;

    return NextResponse.json({ mesaj: "Teklif başarıyla oluşturuldu!" }, { status: 200 });

  } catch (error: any) {
    return NextResponse.json({ hata: "Veritabanına yazılamadı: " + error.message }, { status: 500 });
  }
}