import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // Kayo'nun Qwen modelinden süzüp gönderdiği verileri alıyoruz
    const { firma_adi, sorun, aciliyet, ekip, ticket_type, pipeline_status } = body;

    const { data, error } = await supabase
      .from('service_tickets')
      .insert([{
        manual_customer_name: firma_adi,
        description: sorun,
        priority: aciliyet || 'Normal',
        assigned_team: ekip || '',
        ticket_type: ticket_type || 'ariza',
        pipeline_status: pipeline_status || 'bekliyor',
        status: 'bekliyor' // Legacy status
      }]);

    if (error) throw error;

    return NextResponse.json({ mesaj: `${firma_adi} firması için iş emri başarıyla açıldı kanka!` }, { status: 200 });

  } catch (error: any) {
    return NextResponse.json({ hata: "Veritabanına yazılamadı: " + error.message }, { status: 500 });
  }
}