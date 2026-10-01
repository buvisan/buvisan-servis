import { google } from '@ai-sdk/google';
import { streamText } from 'ai';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = await streamText({
    model: google('gemini-1.5-pro'),
    system: "Sen Buvisan, Birikiton, ZM Çelik ve ZM Kumlama şirketlerinin Teknik Servis yöneticisi otonom bir asistansın. Görevin Kaya'nın talimatlarını yerine getirmektir.",
    messages,
  });

  return result.toTextStreamResponse();
}