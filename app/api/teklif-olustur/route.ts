import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { firma_adi, iscilik_tutari, malzeme_tutari, toplam_tutar, odeme_kosullari, malzeme_adi } = body;

    // Gerçek 'offers' tablonun sütunlarına tam uyumlu kayıt
    const { data, error } = await supabase
      .from('offers')
      .insert([{
        customer_name: firma_adi,
        total_price: toplam_tutar,
        final_price: toplam_tutar,
        status: 'bekliyor',
        template_type: 'standart',
        offer_date: new Date().toISOString().split('T')[0],
        description: `Yapay Zeka Teklif Özeti:\n- Malzeme (${malzeme_adi || 'Parça'}): ${malzeme_tutari} ₺\n- İşçilik ve Yol: ${iscilik_tutari} ₺\n- Ödeme Koşulları: ${odeme_kosullari}`
      }]);

    if (error) throw error;

    return NextResponse.json({ mesaj: "Teklif başarıyla sisteme ve veritabanına kaydedildi kanka!" }, { status: 200 });

  } catch (error: any) {
    return NextResponse.json({ hata: "Veritabanına yazılamadı: " + error.message }, { status: 500 });
  }
}