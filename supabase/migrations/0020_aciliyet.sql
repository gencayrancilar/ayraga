-- =============================================================================
-- AYRA · 0020 · Aciliyet tespiti ve kurum yönlendirmesi
--
-- İki kademe:
--   acil  — yangın, duman, deprem, göçük, patlama, kaza, trafo, acil
--           Bildirim kaydedilir kaydedilmez moderasyona anlık bildirim düşer
--           ve kuruma iletim akışı başlar.
--   hizli — çöp, temizlik, kesinti
--           Acil değildir; haftalık kurum listesinde başa alınır.
--
-- ÖNEMLİ: Bu mekanizma bir acil durum hattı DEĞİLDİR. Bir kurumun e-posta
-- kutusu gece üçte okunmaz. Bu yüzden uygulama, acil kelime yakaladığında
-- bildirimi yazan kişiye önce 112'yi araması gerektiğini söyler; buradaki
-- akış onun yerine değil, üstüne çalışır.
--
-- Kelime eşleşmesi Türkçeye göre yapılır: metin sözcüklere ayrılır, her
-- sözcük kökle karşılaştırılır ve yalnızca tanımlı ekler kabul edilir.
-- "yangına" eşleşir, "kazandı" eşleşmez. Yanlış eşleşen kökler için
-- ayrıca dışlama listesi tutulur.
-- =============================================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'report_urgency') then
    create type public.report_urgency as enum ('normal', 'hizli', 'acil');
  end if;
end $$;

create table if not exists public.alert_keywords (
  id         uuid primary key default gen_random_uuid(),
  word       text not null unique,
  tier       text not null check (tier in ('acil', 'hizli')),
  exclude    text[] not null default '{}',   -- yanlış eşleşen kökler
  -- Metinde bu sözcüklerden biri geçiyorsa kelime sayılmaz: "su patlağı",
  -- "boru patlamış" bir arızadır, patlama değildir.
  context_exclude text[] not null default '{}',
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- Türkçe ek listesi. Kök + bu eklerden biri = eşleşme; başkası eşleşmez.
create or replace function public.turkce_ekler()
returns text[] language sql immutable as $$
  select array[
    '', 'i', 'ı', 'u', 'ü', 'e', 'a',
    'da', 'de', 'ta', 'te',
    'dan', 'den', 'tan', 'ten',
    'ya', 'ye', 'na', 'ne',
    'nin', 'nın', 'nun', 'nün', 'in', 'ın', 'un', 'ün',
    'la', 'le', 'yla', 'yle', 'ile',
    'lar', 'ler', 'ları', 'leri', 'larda', 'lerde', 'lardan', 'lerden',
    'si', 'sı', 'su', 'sü', 'yi', 'yı', 'yu', 'yü',
    'ndan', 'nden', 'nda', 'nde',
    'li', 'lı', 'lu', 'lü', 'lik', 'lık', 'luk', 'lük',
    'm', 'n', 'miz', 'mız', 'muz', 'müz',
    -- fiil ekleri: "patladı", "patlama", "patlayan", "çıkmış"
    'dı', 'di', 'du', 'dü', 'tı', 'ti', 'tu', 'tü',
    'mış', 'miş', 'muş', 'müş', 'ma', 'me', 'mak', 'mek',
    'yor', 'ıyor', 'iyor', 'uyor', 'üyor',
    'acak', 'ecek', 'yan', 'yen', 'an', 'en',
    'ması', 'mesi', 'maları', 'meleri', 'masın', 'mesin', 'mada', 'mede',
    'ndaki', 'ndeki', 'daki', 'deki'
  ]
$$;

/**
 * Metnin aciliyet derecesi. 'acil' bulunursa 'hizli' aranmaz.
 *
 * DİKKAT: Burada unaccent KULLANILMAZ. Türkçede aksan kaldırmak ç→c ve ö→o
 * çevirir; "çök" ile "çok" aynı dizgeye düşer ve "çok" geçen her bildirim
 * acil sayılır. Arama indeksi için doğru olan dönüşüm, kelime eşleşmesi için
 * yanlıştır. Metin de kelimeler de Türkçe hâlleriyle karşılaştırılır.
 */
create or replace function public.aciliyet(p_text text)
returns public.report_urgency
language sql stable
set search_path = public
as $$
  with sozcukler as (
    select distinct regexp_split_to_table(
             lower(coalesce(p_text, '')), '[^a-zçğıöşü0-9]+') as s
  ),
  sonumleyici as (
    -- "yangın riski", "patlama ihtimali", "göçük olabilir": bunlar olmuş bir
    -- olayı değil, bir kaygıyı anlatır. Acil kefesine koymak, gerçek acil
    -- durumun sinyalini boğar. Böyle bir nitelemede aciliyet bir kademe iner.
    select exists (
      select 1 from sozcukler w
       where w.s = any (array['risk','riski','riskli','ihtimal','ihtimali',
                             'olabilir','olma','olması','çıkabilir','tehlikesi',
                             'korkuyorum','endişe','endişem','önlem','tedbir'])
    ) as var
  ),
  eslesme as (
    select k.tier
      from public.alert_keywords k
      join sozcukler w
        on w.s <> ''
       and w.s like lower(k.word) || '%'
       and substr(w.s, length(lower(k.word)) + 1) = any (public.turkce_ekler())
     where k.is_active
       and not exists (
         select 1 from unnest(k.exclude) as x(kok)
          where w.s like lower(x.kok) || '%'
       )
       and not exists (
         select 1 from unnest(k.context_exclude) as y(baglam)
          join sozcukler w2 on w2.s = lower(y.baglam)
       )
  )
  select case
    when exists (select 1 from eslesme where tier = 'acil')
      then case when (select var from sonumleyici)
                then 'hizli'::public.report_urgency
                else 'acil'::public.report_urgency end
    when exists (select 1 from eslesme where tier = 'hizli')
      then 'hizli'::public.report_urgency
    else 'normal'::public.report_urgency
  end
$$;

alter table public.reports
  add column if not exists urgency public.report_urgency not null default 'normal';

create index if not exists idx_reports_urgency
  on public.reports(urgency, created_at desc) where urgency <> 'normal';

-- Aciliyet, başlık + açıklama + adres üzerinden hesaplanır.
create or replace function public.reports_before_write()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  v_base text;
begin
  if tg_op = 'INSERT' then
    if new.ref_code is null or new.ref_code = '' then
      new.ref_code := 'AYRA-' || lpad(nextval('public.report_ref_seq')::text, 6, '0');
    end if;

    if new.slug is null or new.slug = '' then
      v_base := public.slugify(new.title);
      if v_base is null or v_base = '' then v_base := 'sorun'; end if;
      new.slug := left(v_base, 80) || '-' || lower(right(new.ref_code, 6));
    end if;

    if new.neighborhood_id is null then
      new.neighborhood_id := public.resolve_neighborhood(new.latitude, new.longitude);
    end if;

    new.urgency := public.aciliyet(
      coalesce(new.title, '') || ' ' || coalesce(new.description, '') || ' ' || coalesce(new.address, ''));
  end if;

  if new.neighborhood_id is not null then
    select d.id, d.city_id into new.district_id, new.city_id
    from public.neighborhoods n
    join public.districts d on d.id = n.district_id
    where n.id = new.neighborhood_id;
  end if;

  new.search_tsv :=
      setweight(to_tsvector('simple', unaccent(coalesce(new.title, ''))), 'A')
   || setweight(to_tsvector('simple', unaccent(coalesce(new.address, ''))), 'B')
   || setweight(to_tsvector('simple', unaccent(coalesce(new.description, ''))), 'C');

  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;

  return new;
end $$;

/** Kelime listesi değişince geçmiş kayıtları yeniden değerlendirir. */
create or replace function public.aciliyetleri_yenile()
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare v_adet integer;
begin
  with y as (
    select r.id, public.aciliyet(
             coalesce(r.title,'') || ' ' || coalesce(r.description,'') || ' ' || coalesce(r.address,'')) as u
      from public.reports r
  )
  update public.reports r set urgency = y.u
    from y where y.id = r.id and r.urgency is distinct from y.u;
  get diagnostics v_adet = row_count;
  return v_adet;
end $$;

-- ── Acil bildirimde moderasyona anlık haber ─────────────────────────────────
create or replace function public.on_acil_bildirim()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.urgency <> 'acil' then return new; end if;

  insert into public.notifications (user_id, report_id, kind, title, body, url)
  select p.id, new.id, 'system',
         'Acil olabilecek bildirim',
         left(new.title, 180),
         '/yonetim/bildirimler/' || new.id
    from public.profiles p
   where p.role in ('moderator', 'admin');

  perform public.append_report_event(
    new.id, 'note', 'Acil kelime yakalandı; moderasyona iletildi',
    jsonb_build_object('urgency', new.urgency), null, 'AYRA', new.created_at);

  return new;
end $$;

drop trigger if exists trg_acil_bildirim on public.reports;
create trigger trg_acil_bildirim after insert on public.reports
  for each row execute function public.on_acil_bildirim();

-- ── Kelimeler ───────────────────────────────────────────────────────────────
insert into public.alert_keywords (word, tier, exclude, context_exclude) values
  ('yangın',  'acil', '{}', '{}'),
  ('duman',   'acil', '{}', '{}'),
  ('deprem',  'acil', '{}', '{}'),
  ('göçük',   'acil', '{}', '{}'),
  ('göçme',   'acil', '{}', '{}'),
  ('çökme',   'acil', '{}', '{}'),
  ('çöktü',   'acil', '{}', '{}'),
  ('alev',    'acil', '{}', '{}'),
  -- "patla" fiil kökü: patladı, patlama, patlayan eşleşir. Su/boru/şebeke
  -- geçen metinlerde sayılmaz — "su patlağı" bir arızadır, patlama değil.
  ('patla',   'acil', '{patlak,patlağ}', '{su,boru,şebeke,mazgal,içme}'),
  ('kaza',    'acil', '{kazan,kazanç,kazma,kazık,kazı}', '{}'),
  ('trafo',   'acil', '{}', '{}'),
  -- "acil" tek başına çoğu zaman "lütfen çabuk olun" demektir; gerçek acil
  -- durumun işareti değildir. Hızlı kademesinde durur.
  ('acil',    'hizli', '{}', '{}'),
  ('çöp',     'hizli', '{}', '{}'),
  ('temizlik','hizli', '{}', '{}'),
  ('kesinti', 'hizli', '{}', '{}')
on conflict (word) do nothing;

alter table public.alert_keywords enable row level security;

drop policy if exists alert_keywords_read on public.alert_keywords;
create policy alert_keywords_read on public.alert_keywords for select using (true);

drop policy if exists alert_keywords_write on public.alert_keywords;
create policy alert_keywords_write on public.alert_keywords
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.alert_keywords to anon, authenticated;
grant insert, update, delete on public.alert_keywords to authenticated;
grant execute on function public.aciliyet(text), public.turkce_ekler() to anon, authenticated;

-- ── Kurum yönlendirmesi ─────────────────────────────────────────────────────
-- Alt kategorilerin çoğu üst kategorisiyle aynı kuruma gider (çöp → Temizlik →
-- Belediye). Bunları tek tek yazmak yerine kural üst kategoriye düşer; yalnızca
-- istisnalar açıkça tanımlanır. Böylece yeni bir alt kategori eklendiğinde
-- yönlendirme boşta kalmaz.
-- Kategori→kurum istisnaları seed/003_authorities.sql içindedir: migration'lar
-- seed'den ÖNCE çalıştığı için kurumlar burada henüz mevcut olmayabilir.

/**
 * Bir kategorinin sorumlu kurumu. Kategoride tanım yoksa üst kategoriye düşer.
 */
create or replace function public.kurum_bul(p_category_id uuid)
returns uuid language sql stable set search_path = public as $$
  select coalesce(
    (select ca.authority_id
       from public.category_authorities ca
      where ca.category_id = p_category_id and ca.is_primary
      limit 1),
    (select ca.authority_id
       from public.report_categories c
       join public.category_authorities ca on ca.category_id = c.parent_id and ca.is_primary
      where c.id = p_category_id
      limit 1)
  )
$$;

grant execute on function public.kurum_bul(uuid) to anon, authenticated;
