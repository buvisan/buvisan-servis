-- ============================================================================
--  🎯 DOĞRU TRIGGER: completed_services (Güncelleme #137)
-- ----------------------------------------------------------------------------
--  HATA: Trigger'ı financial_records'a kurmuştum
--        ama finansa iş completed_services'e giriliyor!
--        → Trigger hiç çalışmıyordu.
--
--  ÇÖZÜM: completed_services INSERT'te çalışan trigger
--         Yeni iş girilince eşleşen formu OTOMATİK FİNANSTA yapar
--
--  KULLANIM: 164'ten SONRA çalıştır.
-- ============================================================================


-- ============================================================================
-- 1) 🎯 TRIGGER FONKSİYONU
-- ============================================================================
create or replace function public.completed_finans_isle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hedef_id uuid;
  v_skor integer := 0;
  v_tarih date;
begin
  begin
    v_tarih := coalesce(NEW.service_date, NEW.created_at::date);

    -- ═══ SERVİS RAPORU ARA ═══
    select sr.id,
           public.firma_benzerlik(
             coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),''),
             coalesce(NEW.customer_text,'')
           )
      into v_hedef_id, v_skor
    from public.service_reports sr
    where coalesce((to_jsonb(sr)->>'finans_kaydedildi')::boolean, false) = false
      and abs((sr.created_at::date - v_tarih)) <= 7
      and public.firma_benzerlik(
            coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),''),
            coalesce(NEW.customer_text,'')
          ) >= 70
    order by
      public.firma_benzerlik(
        coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),''),
        coalesce(NEW.customer_text,'')
      ) desc,
      abs((sr.created_at::date - v_tarih)) asc
    limit 1;

    if v_hedef_id is not null then
      update public.service_reports
         set finans_kaydedildi = true,
             finans_kayit_id = NEW.id
       where id = v_hedef_id;
      raise notice '💰 Servis formu FİNANSTA işaretlendi: % (skor %)', v_hedef_id, v_skor;
      return NEW;
    end if;

    -- ═══ BAKIM FORMU ARA ═══
    select bf.id,
           public.firma_benzerlik(coalesce(bf.musteri,''), coalesce(NEW.customer_text,''))
      into v_hedef_id, v_skor
    from public.bakim_formlari bf
    where coalesce(bf.finans_kaydedildi, false) = false
      and abs((bf.created_at::date - v_tarih)) <= 7
      and public.firma_benzerlik(coalesce(bf.musteri,''), coalesce(NEW.customer_text,'')) >= 70
    order by
      public.firma_benzerlik(coalesce(bf.musteri,''), coalesce(NEW.customer_text,'')) desc,
      abs((bf.created_at::date - v_tarih)) asc
    limit 1;

    if v_hedef_id is not null then
      update public.bakim_formlari
         set finans_kaydedildi = true,
             finans_kayit_id = NEW.id
       where id = v_hedef_id;
      raise notice '💰 Bakım formu FİNANSTA işaretlendi: % (skor %)', v_hedef_id, v_skor;
    else
      raise notice 'ℹ️ Eşleşen form bulunamadı (müşteri: %)', coalesce(NEW.customer_text,'—');
    end if;
  exception when others then
    raise notice 'completed_finans_isle: %', sqlerrm;
  end;

  return NEW;
end $$;


-- ============================================================================
-- 2) 🔗 TRIGGER'I BAĞLA
-- ============================================================================
do $$
begin
  begin
    drop trigger if exists trg_completed_finans on public.completed_services;
    create trigger trg_completed_finans
      after insert on public.completed_services
      for each row execute function public.completed_finans_isle();
    raise notice '✅ trg_completed_finans (completed_services → form işaretle)';
  exception when others then raise notice '⚠️ trg_completed_finans: %', sqlerrm; end;

  -- Eski yanlış trigger'ı kaldır
  begin
    drop trigger if exists trg_finans_form on public.financial_records;
    raise notice '🧹 Eski trg_finans_form kaldırıldı';
  exception when others then null; end;
end $$;


-- ============================================================================
-- 3) 🔧 MEVCUT PARK METAL'İ İŞARETLE (backfill)
-- ============================================================================
create or replace function public.completed_backfill(p_gun integer default 7, p_esik integer default 70)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sr integer := 0;
  v_bf integer := 0;
begin
  -- SERVİS
  begin
    with adaylar as (
      select
        sr.id as sr_id,
        cs.id as cs_id,
        public.firma_benzerlik(
          coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),''),
          coalesce(cs.customer_text,'')
        ) as skor,
        abs((sr.created_at::date - coalesce(cs.service_date, cs.created_at::date))) as gun_fark,
        row_number() over (partition by sr.id order by
          public.firma_benzerlik(
            coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),''),
            coalesce(cs.customer_text,'')
          ) desc,
          abs((sr.created_at::date - coalesce(cs.service_date, cs.created_at::date))) asc
        ) as sr_sira,
        row_number() over (partition by cs.id order by
          public.firma_benzerlik(
            coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),''),
            coalesce(cs.customer_text,'')
          ) desc,
          abs((sr.created_at::date - coalesce(cs.service_date, cs.created_at::date))) asc
        ) as cs_sira
      from public.service_reports sr
      join public.completed_services cs
        on abs((sr.created_at::date - coalesce(cs.service_date, cs.created_at::date))) <= p_gun
      where public.firma_benzerlik(
              coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),''),
              coalesce(cs.customer_text,'')
            ) >= p_esik
    ),
    secilen as (select sr_id, cs_id from adaylar where sr_sira = 1 and cs_sira = 1)
    update public.service_reports sr set finans_kaydedildi = true, finans_kayit_id = s.cs_id
      from secilen s where sr.id = s.sr_id;
    get diagnostics v_sr = row_count;
  exception when others then v_sr := -1; end;

  -- BAKIM
  begin
    with adaylar as (
      select
        bf.id as bf_id, cs.id as cs_id,
        public.firma_benzerlik(coalesce(bf.musteri,''), coalesce(cs.customer_text,'')) as skor,
        abs((bf.created_at::date - coalesce(cs.service_date, cs.created_at::date))) as gun_fark,
        row_number() over (partition by bf.id order by
          public.firma_benzerlik(coalesce(bf.musteri,''), coalesce(cs.customer_text,'')) desc,
          abs((bf.created_at::date - coalesce(cs.service_date, cs.created_at::date))) asc
        ) as bf_sira,
        row_number() over (partition by cs.id order by
          public.firma_benzerlik(coalesce(bf.musteri,''), coalesce(cs.customer_text,'')) desc,
          abs((bf.created_at::date - coalesce(cs.service_date, cs.created_at::date))) asc
        ) as cs_sira
      from public.bakim_formlari bf
      join public.completed_services cs
        on abs((bf.created_at::date - coalesce(cs.service_date, cs.created_at::date))) <= p_gun
      where public.firma_benzerlik(coalesce(bf.musteri,''), coalesce(cs.customer_text,'')) >= p_esik
    ),
    secilen as (select bf_id, cs_id from adaylar where bf_sira = 1 and cs_sira = 1)
    update public.bakim_formlari bf set finans_kaydedildi = true, finans_kayit_id = s.cs_id
      from secilen s where bf.id = s.bf_id;
    get diagnostics v_bf = row_count;
  exception when others then v_bf := -1; end;

  return jsonb_build_object(
    'servis', v_sr, 'bakim', v_bf,
    'mesaj', '💰 ' || v_sr || ' servis + ' || v_bf || ' bakım işaretlendi.'
  );
exception when others then
  return jsonb_build_object('servis', 0, 'bakim', 0, 'mesaj', 'HATA: ' || sqlerrm);
end $$;

revoke all on function public.completed_backfill(integer, integer) from public;
grant execute on function public.completed_backfill(integer, integer) to authenticated;


-- ============================================================================
-- 4) 🧪 ÇALIŞTIR
-- ============================================================================
select public.completed_backfill(7, 70) as sonuc;

-- PARK METAL kontrolü
select
  coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'—') as form_firma,
  to_char(sr.created_at,'DD.MM') as form_t,
  coalesce(sr.finans_kaydedildi,false) as isaretli,
  coalesce(cs.customer_text,'—') as finans_firma,
  to_char(coalesce(cs.service_date, cs.created_at::date),'DD.MM') as finans_t
from public.service_reports sr
left join public.completed_services cs on cs.id = sr.finans_kayit_id
where public.parca_adi_normal(coalesce(public.jalan(to_jsonb(sr),'firma_adi','musteri_adi','customer_name'),'')) like '%park metal%'
order by sr.created_at desc;
