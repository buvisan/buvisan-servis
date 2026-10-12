import { createClient } from '@supabase/supabase-js';

// ----------------------------------------------------------------------------
// API YETKİ KONTROLÜ
// ----------------------------------------------------------------------------
// Korumasız kalan API uçları için ortak yönetici kontrolü.
// /api/onay ve /api/asistan ile aynı mantık: Bearer jeton + profiles.role.
// ----------------------------------------------------------------------------

export async function adminMi(req: Request): Promise<{ ok: boolean; email?: string }> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '').trim();
  if (!token) return { ok: false };

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: u } = await supabase.auth.getUser(token);
  if (!u?.user) return { ok: false };

  // Kullanıcının kendi jetonuyla sorgulanır → RLS "kendi profilini oku" kuralı geçerli
  const { data: prof } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', u.user.id)
    .maybeSingle();

  return { ok: prof?.role === 'admin', email: u.user.email ?? undefined };
}

export const yetkiYok = () =>
  new Response(JSON.stringify({ hata: 'Yetki yok. Bu işlem için yönetici girişi gerekir.' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' },
  });
