import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function POST(request: Request) {
  try {
    const { kelime } = await request.json();
    
    // Gerçek 'materials' tablosundan 'name' sütununa göre arama yapıyoruz
    const { data, error } = await supabase
      .from('materials') 
      .select('name, sale_price, unit')
      .ilike('name', `%${kelime}%`)
      .limit(5);

    if (error) throw error;

    if (!data || data.length === 0) {
      return NextResponse.json({ sonuc: "Depoda bu isimde bir malzeme bulunamadı." }, { status: 200 });
    }

    const dokum = data.map(item => `- ${item.name} (Birim Fiyat: ${item.sale_price} ₺, Birim: ${item.unit})`).join('\n');
    
    return NextResponse.json({ sonuc: `Depoda bulunan malzemeler:\n${dokum}` }, { status: 200 });

  } catch (error: any) {
    return NextResponse.json({ hata: "Veritabanı hatası: " + error.message }, { status: 500 });
  }
}