-- ============================================================================
--  🏖️ İZİN GÜN HESABI v2 — TARİH YOKSA METİNDEN/OLUŞTURMADAN (Güncelleme #101)
-- ----------------------------------------------------------------------------
--  BULGU: Veysel'in izin talebinde baslangic/bitis BOŞ!
--         Tarih sadece aciklama metninde: "16.10.2026 için izin istiyorum"
--
--  ÇÖZÜM (3 katmanlı):
--    1) baslangic/bitis doluysa → onları kullan
--    2) Boşsa → aciklama metninden TARİH ÇIKAR (16.10.2026 gibi)
--    3) O da yoksa → created_at tarihini kullan (1 gün)
--
--  KULLANIM: 128'den SONRA çalıştır. Hata vermez.
-- ============================================================================

create or replace function public.izin_gun_sayisi(
  p_personel text,
  p_ay text default null
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ay text := coalesce(p_ay, to_char(current_date,'YYYY-MM'));
  v_nm text := public.parca_adi_normal(coalesce(p_personel,''));
  v_gun numeric := 0;
begin
  begin
    select coalesce(sum(
      -- GÜN SAYISI: 3 katmanlı tarih çözümü
      greatest(1,
        coalesce(
          -- 1) Normal tarih aralığı
          case when nullif(trim(coalesce(to_jsonb(pt)->>'baslangic','')),'') is not null
               then (coalesce(
                      nullif(trim(coalesce(to_jsonb(pt)->>'bitis','')),'')::date,
                      nullif(trim(coalesce(to_jsonb(pt)->>'baslangic','')),'')::date)
                    - nullif(trim(coalesce(to_jsonb(pt)->>'baslangic','')),'')::date) + 1
               else null end,
          -- 2) Metinden çıkarılan tarih (tek gün)
          case when public.izin_metin_tarih(coalesce(to_jsonb(pt)->>'aciklama',''),
                                            coalesce(to_jsonb(pt)->>'baslik','')) is not null
               then 1 else null end,
          -- 3) Oluşturma tarihi (tek gün)
          1
        )
      )
    ), 0)
      into v_gun
    from public.personel_talepler pt
    where public.parca_adi_normal(coalesce(to_jsonb(pt)->>'personel','')) = v_nm
      -- İZİN talepleri
      and (
        public.parca_adi_normal(coalesce(to_jsonb(pt)->>'talep_tipi','')) like '%izin%'
        or public.parca_adi_normal(coalesce(to_jsonb(pt)->>'baslik','')) like '%izin%'
      )
      -- ONAYLI (veya onay bekleyen — ikisini de say)
      and public.parca_adi_normal(coalesce(to_jsonb(pt)->>'durum',''))
          in ('onaylandi','onaylı','onaylanmis','kabul','kabul_edildi','tamamlandi','tamamlandı','aktif','bekliyor','onay_bekliyor')
      -- AY FİLTRESİ: etkin tarih bu ayda mı?
      and (
        -- Normal tarih bu ayda
        (nullif(trim(coalesce(to_jsonb(pt)->>'baslangic','')),'') is not null
         and (to_char(nullif(trim(coalesce(to_jsonb(pt)->>'baslangic','')),'')::date,'YYYY-MM') = v_ay
              or to_char(nullif(trim(coalesce(to_jsonb(pt)->>'bitis','')),'')::date,'YYYY-MM') = v_ay
              or (nullif(trim(coalesce(to_jsonb(pt)->>'baslangic','')),'')::date <= (v_ay || '-01')::date + interval '1 month' - interval '1 day'
                  and nullif(trim(coalesce(to_jsonb(pt)->>'bitis','')),'')::date >= (v_ay || '-01')::date)))
        -- Metinde tarih var ve bu ayda
        or (nullif(trim(coalesce(to_jsonb(pt)->>'baslangic','')),'') is null
            and public.izin_metin_tarih(coalesce(to_jsonb(pt)->>'aciklama',''),
                                        coalesce(to_jsonb(pt)->>'baslik','')) is not null
            and to_char(public.izin_metin_tarih(coalesce(to_jsonb(pt)->>'aciklama',''),
                                                coalesce(to_jsonb(pt)->>'baslik','')), 'YYYY-MM') = v_ay)
        -- Hiç tarih yok → oluşturma ayı
        or (nullif(trim(coalesce(to_jsonb(pt)->>'baslangic','')),'') is null
            and public.izin_metin_tarih(coalesce(to_jsonb(pt)->>'aciklama',''),
                                        coalesce(to_jsonb(pt)->>'baslik','')) is null
            and to_char(pt.created_at::date,'YYYY-MM') = v_ay)
      );
  exception when others then v_gun := 0; end;

  return coalesce(v_gun, 0);
end $$;

revoke all on function public.izin_gun_sayisi(text, text) from public;
grant execute on function public.izin_gun_sayisi(text, text) to authenticated;


-- ============================================================================
-- 📅 YARDIMCI: Metinden tarih çıkar ("16.10.2026 için izin istiyorum")
-- ============================================================================
create or replace function public.izin_metin_tarih(p_metin text, p_baslik text default null)
returns date
language plpgsql
immutable
as $$
declare
  v_metin text := coalesce(p_metin,'') || ' ' || coalesce(p_baslik,'');
  v_m text[];
  v_gun integer;
  v_ay integer;
  v_yil integer;
begin
  if length(trim(v_metin)) < 6 then return null; end if;

  -- 1) GG.AA.YYYY veya GG/AA/YYYY veya GG-AA-YYYY
  v_m := regexp_match(v_metin, '(\d{1,2})[./-](\d{1,2})[./-](\d{4})');
  if v_m is not null then
    begin
      v_gun := v_m[1]::int; v_ay := v_m[2]::int; v_yil := v_m[3]::int;
      return make_date(v_yil, v_ay, v_gun);
    exception when others then null; end;
  end if;

  -- 2) GG.AA (yıl yok → bu yıl)
  v_m := regexp_match(v_metin, '(\d{1,2})[./-](\d{1,2})(?![./-]?\d)');
  if v_m is not null then
    begin
      v_gun := v_m[1]::int; v_ay := v_m[2]::int;
      if v_ay between 1 and 12 and v_gun between 1 and 31 then
        return make_date(extract(year from current_date)::int, v_ay, v_gun);
      end if;
    exception when others then null; end;
  end if;

  -- 3) YYYY-AA-GG
  v_m := regexp_match(v_metin, '(\d{4})-(\d{1,2})-(\d{1,2})');
  if v_m is not null then
    begin
      return make_date(v_m[1]::int, v_m[2]::int, v_m[3]::int);
    exception when others then null; end;
  end if;

  return null;
end $$;

revoke all on function public.izin_metin_tarih(text, text) from public;
grant execute on function public.izin_metin_tarih(text, text) to authenticated;


-- ============================================================================
-- 🧪 TEST
-- ============================================================================
-- Metinden tarih çıkarma testi
select
  '16.10.2026 için izin istiyorum' as metin,
  public.izin_metin_tarih('16.10.2026 için izin istiyorum', 'izin') as bulunan_tarih
union all
select 'Yarın izin istiyorum', public.izin_metin_tarih('Yarın izin istiyorum', 'izin')
union all
select '2026-10-20 tarihinde', public.izin_metin_tarih('2026-10-20 tarihinde', null);

-- İZİN GÜN SAYILARI — Veysel de görünmeli!
select
  pm.personel,
  public.izin_gun_sayisi(pm.personel, to_char(current_date,'YYYY-MM')) as izin_gun,
  public.izin_gun_sayisi(pm.personel, null)                            as izin_tum
from public.personel_maas pm
where pm.aktif
order by pm.maas desc;

-- Veysel'in izin kaydı detayı
select
  coalesce(pt.personel,'')      as personel,
  coalesce(pt.talep_tipi,'')    as tip,
  coalesce(pt.durum,'')         as durum,
  coalesce(pt.baslangic::text,'(boş)') as baslangic,
  coalesce(pt.bitis::text,'(boş)')     as bitis,
  left(coalesce(pt.aciklama,''),40)    as aciklama,
  public.izin_metin_tarih(coalesce(pt.aciklama,''), coalesce(pt.baslik,'')) as metinden_tarih
from public.personel_talepler pt
where public.parca_adi_normal(coalesce(pt.personel,'')) like '%veysel%'
  and (public.parca_adi_normal(coalesce(pt.talep_tipi,'')) like '%izin%'
       or public.parca_adi_normal(coalesce(pt.baslik,'')) like '%izin%')
order by pt.created_at desc
limit 5;
