import { google } from '@ai-sdk/google';
import { streamText, tool } from 'ai';
import { z } from 'zod';
import { supabase } from '@/lib/supabaseClient';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = await streamText({
    model: google('gemini-1.5-pro'),
    system: "Sen Buvisan, Birikiton, ZM Çelik ve ZM Kumlama şirketlerinin Teknik Servis yöneticisi otonom bir asistansın. Görevin Kaya'nın talimatlarını yerine getirip Supabase veritabanında işlemler yapmaktır. Bir firmaya teklif veya iş emri oluşturmadan önce DAİMA 'Mimli Şirketler' listesini kontrol etmelisin.",
    messages,
    tools: {
      mimli_sirket_kontrol: tool({
        description: 'Bir firmanın ödeme sorunu olup olmadığını, kara listede (mimli) bulunup bulunmadığını kontrol eder.',
        parameters: z.object({
          firma_adi: z.string().describe('Kontrol edilecek firmanın adı (Örn: Alan Kalıp, Macbending)'),
        }),
        // @ts-ignore
        execute: async ({ firma_adi }) => {
          const { data, error } = await supabase
            .from('blacklisted_companies') 
            .select('*')
            .ilike('company_name', `%${firma_adi}%`); 

          if (error) return { hata: error.message };
          
          if (data && data.length > 0) {
            return { sonuc: 'DİKKAT: FİRMA MİMLİ LİSTEDE!', detay: data[0] };
          }
          return { sonuc: 'TEMİZ', detay: 'Firma kara listede değil, güvenle işlem yapılabilir.' };
        },
      }),

      malzeme_fiyat_sorgula: tool({
         description: 'Depodaki malzemelerin güncel alış, satış fiyatlarını ve kâr marjlarını sorgular.',
         parameters: z.object({
           malzeme_adi: z.string().describe('Sorgulanacak malzeme (Örn: 14MM HALAT, SERVİS İŞÇİLİĞİ)'),
         }),
         // @ts-ignore
         execute: async ({ malzeme_adi }) => {
            const { data, error } = await supabase
              .from('materials') 
              .select('*')
              .ilike('name', `%${malzeme_adi}%`); 
              
            if (error) return { hata: error.message };
            return { sonuc: data && data.length > 0 ? data : 'Malzeme bulunamadı.' };
         }
      })
    },
    // @ts-ignore
    maxSteps: 5, 
  });

  return result.toTextStreamResponse();
}