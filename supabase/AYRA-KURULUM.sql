-- ═══════════════════════════════════════════════════════════════════════════
-- AYRA · Tek dosyalık kurulum
--
-- Bu dosya 15 migration ve 3 başlangıç verisi dosyasının
-- birleşimidir. Supabase panelinde SQL Editor'e yapıştırıp "Run" demeniz
-- yeterlidir; sıra önemlidir, dosyayı bölmeyin.
--
-- Üretilme tarihi: 2026-08-31
--
-- Ne kurar:
--   · Konum hiyerarşisi (Türkiye → İzmir → Torbalı → 60 mahalle)
--   · 12 ana + 21 alt kategori, ağırlık ve hedef süreleriyle
--   · 12 yetkili kurum ve kategori eşlemesi
--   · Bildirim, destek, medya, durum geçmişi ve kanıt zinciri tabloları
--   · Tüm tablolarda Row Level Security politikaları
--   · AYRA Skoru hesaplama fonksiyonları
--
-- Ne KURMAZ: örnek/sahte bildirim verisi. Sistem boş bir haritayla açılır.
-- ═══════════════════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════════════════
-- MIGRATION 0001_bootstrap.sql
-- ══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- AYRA · 0001 · Bootstrap
-- Supabase uyumluluk katmanı. Supabase projesinde bu blokların çoğu zaten
-- mevcuttur; hepsi "varsa dokunma" mantığıyla yazılmıştır. Böylece aynı
-- migration hem lokal PostgreSQL'de hem Supabase'de sorunsuz çalışır.
-- =============================================================================

-- Supabase'de eklentiler "extensions" şemasında durur; yerelde public'te.
-- Zaten kuruluysa hiçbir şey yapılmaz.
do $$
declare
  ext text;
  has_ext_schema boolean := exists (select 1 from pg_namespace where nspname = 'extensions');
begin
  foreach ext in array array['pgcrypto', 'pg_trgm', 'unaccent'] loop
    if exists (select 1 from pg_extension where extname = ext) then
      continue;
    end if;
    begin
      if has_ext_schema then
        execute format('create extension if not exists %I with schema extensions', ext);
      else
        execute format('create extension if not exists %I', ext);
      end if;
    exception when insufficient_privilege then
      raise notice '% eklentisi kurulamadı (yetki yok); zaten kurulu olmalı.', ext;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Roller (Supabase'de hazır gelir)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- auth şeması (Supabase'de GoTrue tarafından yönetilir)
-- ---------------------------------------------------------------------------
-- Supabase'de auth şeması GoTrue'ya aittir: ne şemayı ne de içindeki
-- fonksiyonları değiştirebiliriz — zaten hepsi hazır gelir. Yerel PostgreSQL'de
-- ise bu katmanı biz kurarız. Aşağısı iki durumu da idare eder.
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'auth') then
    create schema auth;
  end if;
exception when insufficient_privilege then
  null;
end $$;

do $$
begin
  if to_regclass('auth.users') is null then
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text unique,
      phone text unique,
      encrypted_password text,
      raw_user_meta_data jsonb not null default '{}'::jsonb,
      is_anonymous boolean not null default false,
      created_at timestamptz not null default now(),
      last_sign_in_at timestamptz
    );
  end if;
end $$;

-- auth.jwt() / auth.uid() / auth.role(): yalnızca yoksa oluşturulur.
do $$
begin
  if to_regprocedure('auth.jwt()') is null then
    execute $fn$
      create function auth.jwt() returns jsonb
        language sql stable as $body$
        select coalesce(
          nullif(current_setting('request.jwt.claims', true), '')::jsonb,
          '{}'::jsonb
        )
      $body$
    $fn$;
  end if;

  if to_regprocedure('auth.uid()') is null then
    execute $fn$
      create function auth.uid() returns uuid
        language sql stable as $body$
        select nullif(
          coalesce(
            nullif(current_setting('request.jwt.claim.sub', true), ''),
            (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
          ), ''
        )::uuid
      $body$
    $fn$;
  end if;

  if to_regprocedure('auth.role()') is null then
    execute $fn$
      create function auth.role() returns text
        language sql stable as $body$
        select coalesce(
          nullif(current_setting('request.jwt.claim.role', true), ''),
          (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
          'anon'
        )
      $body$
    $fn$;
  end if;
exception when insufficient_privilege then
  raise notice 'auth şemasına yazılamadı; Supabase bu fonksiyonları zaten sağlıyor.';
end $$;

do $$
begin
  grant usage on schema auth to anon, authenticated, service_role;
exception when insufficient_privilege or undefined_object then
  null;
end $$;

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Türkçe uyumlu slugify
-- ---------------------------------------------------------------------------
create or replace function public.slugify(src text)
returns text
language sql
immutable
strict
as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(
        lower(
          translate(
            src,
            'ıİğĞüÜşŞöÖçÇÂâÎîÛû',
            'iigguussoocCAaIiUu'
          )
        ),
        '[^a-z0-9]+', '-', 'g'
      ),
      '-{2,}', '-', 'g'
    )
  )
$$;

-- ---------------------------------------------------------------------------
-- Ortak yardımcılar
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- İki nokta arası mesafe (metre) — Haversine. PostGIS gerektirmez, her yerde çalışır.
create or replace function public.distance_m(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision
) returns double precision
language sql immutable strict parallel safe as $$
  select 6371000 * 2 * asin(
    sqrt(
      pow(sin(radians(lat2 - lat1) / 2), 2) +
      cos(radians(lat1)) * cos(radians(lat2)) * pow(sin(radians(lon2 - lon1) / 2), 2)
    )
  )
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- MIGRATION 0002_geography.sql
-- ══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- AYRA · 0002 · Konum hiyerarşisi
-- Ülke → İl → İlçe → Mahalle
-- Sistem Ayrancılar ile başlar ama şema Türkiye geneline hazırdır.
-- =============================================================================

create table if not exists public.countries (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,            -- ISO 3166-1 alpha-2, örn. TR
  name        text not null,
  slug        text not null unique,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.cities (
  id          uuid primary key default gen_random_uuid(),
  country_id  uuid not null references public.countries(id) on delete restrict,
  name        text not null,
  slug        text not null,
  plate_code  smallint,                        -- 35 = İzmir
  center_lat  double precision,
  center_lng  double precision,
  is_active   boolean not null default false,  -- yayına açık il
  created_at  timestamptz not null default now(),
  unique (country_id, slug)
);

create table if not exists public.districts (
  id          uuid primary key default gen_random_uuid(),
  city_id     uuid not null references public.cities(id) on delete restrict,
  name        text not null,
  slug        text not null,
  center_lat  double precision,
  center_lng  double precision,
  is_active   boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (city_id, slug)
);

create table if not exists public.neighborhoods (
  id           uuid primary key default gen_random_uuid(),
  district_id  uuid not null references public.districts(id) on delete restrict,
  name         text not null,
  slug         text not null,
  center_lat   double precision,
  center_lng   double precision,
  -- Basit sınır poligonu: [[lng,lat], ...]. PostGIS gerekmeden nokta-içinde testi
  -- için kullanılır; ileride PostGIS'e taşınabilir.
  boundary     jsonb,
  population   integer,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (district_id, slug)
);

create index if not exists idx_cities_country on public.cities(country_id);
create index if not exists idx_districts_city on public.districts(city_id);
create index if not exists idx_neighborhoods_district on public.neighborhoods(district_id);
create index if not exists idx_neighborhoods_center on public.neighborhoods(center_lat, center_lng);

-- Ray-casting: nokta poligonun içinde mi? boundary = [[lng,lat], ...]
create or replace function public.point_in_ring(
  p_lat double precision,
  p_lng double precision,
  ring jsonb
) returns boolean
language plpgsql immutable as $$
declare
  n   integer;
  i   integer;
  j   integer;
  xi  double precision; yi double precision;
  xj  double precision; yj double precision;
  inside boolean := false;
begin
  if ring is null or jsonb_typeof(ring) <> 'array' then
    return false;
  end if;
  n := jsonb_array_length(ring);
  if n < 3 then
    return false;
  end if;

  j := n - 1;
  for i in 0 .. n - 1 loop
    xi := (ring -> i ->> 0)::double precision;  -- lng
    yi := (ring -> i ->> 1)::double precision;  -- lat
    xj := (ring -> j ->> 0)::double precision;
    yj := (ring -> j ->> 1)::double precision;

    if ((yi > p_lat) <> (yj > p_lat))
       and (p_lng < (xj - xi) * (p_lat - yi) / nullif(yj - yi, 0) + xi) then
      inside := not inside;
    end if;

    j := i;
  end loop;

  return inside;
end $$;

-- Bir noktanın hangi mahalleye düştüğünü bulur.
-- Önce boundary poligonu (varsa), yoksa en yakın mahalle merkezi.
create or replace function public.resolve_neighborhood(
  p_lat double precision,
  p_lng double precision
) returns uuid
language plpgsql stable as $$
declare
  v_id uuid;
begin
  select n.id into v_id
  from public.neighborhoods n
  where n.is_active
    and n.boundary is not null
    and public.point_in_ring(p_lat, p_lng, n.boundary)
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  select n.id into v_id
  from public.neighborhoods n
  where n.is_active and n.center_lat is not null
  order by public.distance_m(p_lat, p_lng, n.center_lat, n.center_lng) asc
  limit 1;

  return v_id;
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- MIGRATION 0003_identity.sql
-- ══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- AYRA · 0003 · Kimlik ve profiller
-- Kullanıcı gerçek adını göstermeden katılabilir. Kamusal yüzey her zaman
-- display_name'dir; e-posta hiçbir zaman public değildir.
-- =============================================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('citizen', 'moderator', 'admin');
  end if;
end $$;

create table if not exists public.profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  display_name         text not null,
  handle               text unique,
  avatar_url           text,
  role                 public.user_role not null default 'citizen',
  home_neighborhood_id uuid references public.neighborhoods(id) on delete set null,
  is_anonymous         boolean not null default false,
  is_banned            boolean not null default false,
  banned_reason        text,
  -- Kötüye kullanım kontrolü için hafif itibar sinyali (0-100)
  trust_score          smallint not null default 50 check (trust_score between 0 and 100),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_profiles_role on public.profiles(role) where role <> 'citizen';

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- Yeni auth.users kaydı için otomatik profil
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare
  v_name text;
begin
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    case when new.is_anonymous then 'Ayrancılar sakini' else split_part(coalesce(new.email, 'katılımcı'), '@', 1) end
  );

  insert into public.profiles (id, display_name, is_anonymous)
  values (new.id, v_name, coalesce(new.is_anonymous, false))
  on conflict (id) do nothing;

  return new;
end $$;

-- Supabase'de auth.users GoTrue'ya aittir; tetikleyici kurma yetkisi
-- projeden projeye değişir. Kuramazsak profil, uygulama tarafında
-- (src/lib/auth) ilk oturumda oluşturulur — yani sistem yine çalışır.
do $$
begin
  drop trigger if exists trg_auth_user_created on auth.users;
  create trigger trg_auth_user_created after insert on auth.users
    for each row execute function public.handle_new_user();
exception when insufficient_privilege then
  raise notice 'auth.users tetikleyicisi kurulamadı; profiller uygulama tarafında oluşturulacak.';
end $$;

-- Yetki yardımcıları (RLS politikalarında kullanılır)
create or replace function public.current_role_level()
returns public.user_role
language sql stable security definer set search_path = public as $$
  select coalesce((select p.role from public.profiles p where p.id = auth.uid()), 'citizen'::public.user_role)
$$;

create or replace function public.is_moderator()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_role_level() in ('moderator', 'admin')
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_role_level() = 'admin'
$$;

create or replace function public.is_banned()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_banned from public.profiles p where p.id = auth.uid()), false)
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- MIGRATION 0004_categories.sql
-- ══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- AYRA · 0004 · Kategori mimarisi
-- İki seviyeli, yönetim panelinden düzenlenebilir.
-- weight: AYRA Skor hesabında kategorinin ağırlığı (1.0 = nötr)
-- =============================================================================

create table if not exists public.report_categories (
  id           uuid primary key default gen_random_uuid(),
  parent_id    uuid references public.report_categories(id) on delete cascade,
  name         text not null,
  slug         text not null unique,
  description  text,
  icon         text not null default 'dot',      -- ikon anahtarı (SVG seti)
  color        text not null default '#0E7C86',  -- harita pin rengi
  weight       numeric(3,2) not null default 1.00 check (weight between 0.10 and 3.00),
  -- Bu kategori için varsayılan hedef çözüm süresi (gün) — sessizlik sayacı eşiği
  sla_days     smallint not null default 30 check (sla_days > 0),
  sort_order   smallint not null default 100,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_categories_parent on public.report_categories(parent_id);
create index if not exists idx_categories_active on public.report_categories(is_active, sort_order);

drop trigger if exists trg_categories_touch on public.report_categories;
create trigger trg_categories_touch before update on public.report_categories
  for each row execute function public.touch_updated_at();

-- ══════════════════════════════════════════════════════════════════════════
-- MIGRATION 0005_reports.sql
-- ══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- AYRA · 0005 · Sorun bildirimleri
-- =============================================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'report_status') then
    create type public.report_status as enum (
      'new',                  -- Yeni
      'verified',             -- Doğrulandı
      'forwarded',            -- Yetkili Kuruma İletildi
      'in_review',            -- İnceleniyor
      'awaiting_resolution',  -- Çözüm Bekliyor
      'resolved',             -- Çözüldü
      'unresolved',           -- Çözülemedi
      'duplicate',            -- Mükerrer (birleştirildi)
      'rejected'              -- Moderasyon: yayından kaldırıldı
    );
  end if;
end $$;

create table if not exists public.reports (
  id               uuid primary key default gen_random_uuid(),
  ref_code         text not null unique,            -- AYRA-000123, kamuya açık referans
  slug             text not null unique,            -- SEO: /sorun/<slug>
  user_id          uuid references public.profiles(id) on delete set null,
  title            text not null check (char_length(btrim(title)) between 8 and 120),
  description      text check (char_length(description) <= 2000),
  category_id      uuid not null references public.report_categories(id) on delete restrict,

  latitude         double precision not null check (latitude between -90 and 90),
  longitude        double precision not null check (longitude between -180 and 180),
  address          text,
  neighborhood_id  uuid references public.neighborhoods(id) on delete set null,
  district_id      uuid references public.districts(id) on delete set null,
  city_id          uuid references public.cities(id) on delete set null,

  status           public.report_status not null default 'new',
  status_note      text,
  duplicate_of_id  uuid references public.reports(id) on delete set null,

  support_count    integer not null default 0 check (support_count >= 0),
  view_count       integer not null default 0 check (view_count >= 0),
  comment_count    integer not null default 0 check (comment_count >= 0),

  is_hidden        boolean not null default false,  -- moderasyon
  hidden_reason    text,

  first_forwarded_at timestamptz,                   -- sessizlik sayacının başlangıcı
  first_response_at  timestamptz,                   -- kurumdan ilk yanıt
  resolved_at        timestamptz,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  search_tsv       tsvector,

  constraint reports_duplicate_consistency
    check ((status = 'duplicate') = (duplicate_of_id is not null)),
  constraint reports_no_self_duplicate
    check (duplicate_of_id is null or duplicate_of_id <> id)
);

-- Kamuya açık referans kodu
create sequence if not exists public.report_ref_seq start 1000;

create or replace function public.reports_before_write()
returns trigger language plpgsql as $$
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

    -- Konum hiyerarşisini otomatik çöz
    if new.neighborhood_id is null then
      new.neighborhood_id := public.resolve_neighborhood(new.latitude, new.longitude);
    end if;
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

drop trigger if exists trg_reports_before_write on public.reports;
create trigger trg_reports_before_write before insert or update on public.reports
  for each row execute function public.reports_before_write();

-- Harita viewport sorguları için bileşik indeks
create index if not exists idx_reports_geo      on public.reports(latitude, longitude) where not is_hidden;
create index if not exists idx_reports_status   on public.reports(status);
create index if not exists idx_reports_category on public.reports(category_id);
create index if not exists idx_reports_nbhd     on public.reports(neighborhood_id);
create index if not exists idx_reports_created  on public.reports(created_at desc);
create index if not exists idx_reports_support  on public.reports(support_count desc);
create index if not exists idx_reports_user     on public.reports(user_id);
create index if not exists idx_reports_search   on public.reports using gin(search_tsv);
-- pg_trgm yerelde public'te, Supabase'de extensions şemasındadır.
-- Operatör sınıfını bulunduğu şemayla nitelendiriyoruz ki her ikisinde de çalışsın.
do $$
declare
  v_schema text;
begin
  select n.nspname into v_schema
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'pg_trgm';

  if v_schema is null then
    raise notice 'pg_trgm kurulu değil; başlık arama indeksi atlandı.';
    return;
  end if;

  execute format(
    'create index if not exists idx_reports_title_trgm on public.reports using gin (title %I.gin_trgm_ops)',
    v_schema
  );
end $$;

-- ---------------------------------------------------------------------------
-- Medya
-- ---------------------------------------------------------------------------
create table if not exists public.report_media (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.reports(id) on delete cascade,
  storage_path text not null,
  mime_type   text not null,
  width       integer,
  height      integer,
  byte_size   integer not null check (byte_size > 0),
  -- 'issue' = sorunun kendisi, 'resolution' = çözüm sonrası kanıt
  kind        text not null default 'issue' check (kind in ('issue', 'resolution', 'document')),
  blurhash    text,
  sort_order  smallint not null default 0,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_media_report on public.report_media(report_id, kind, sort_order);

-- ---------------------------------------------------------------------------
-- Destekler — bir kullanıcı bir sorunu yalnızca bir kez destekleyebilir
-- ---------------------------------------------------------------------------
create table if not exists public.report_supports (
  report_id  uuid not null references public.reports(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (report_id, user_id)
);
create index if not exists idx_supports_user on public.report_supports(user_id, created_at desc);

create or replace function public.sync_support_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.reports set support_count = support_count + 1 where id = new.report_id;
    return new;
  else
    update public.reports set support_count = greatest(0, support_count - 1) where id = old.report_id;
    return old;
  end if;
end $$;

drop trigger if exists trg_supports_count on public.report_supports;
create trigger trg_supports_count after insert or delete on public.report_supports
  for each row execute function public.sync_support_count();

-- ---------------------------------------------------------------------------
-- Görüntülenme — gerçek veriye dayanır, günde bir kez tekilleştirilir
-- ---------------------------------------------------------------------------
create table if not exists public.report_views (
  report_id   uuid not null references public.reports(id) on delete cascade,
  viewer_hash text not null,          -- sha256(ip + ua + günlük tuz) — kişisel veri saklamaz
  viewed_on   date not null default current_date,
  primary key (report_id, viewer_hash, viewed_on)
);

-- ══════════════════════════════════════════════════════════════════════════
-- MIGRATION 0006_lifecycle.sql
-- ══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- AYRA · 0006 · Yaşam döngüsü, kurumlar, kanıt zinciri
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Yetkili kurumlar
-- ---------------------------------------------------------------------------
create table if not exists public.authorities (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  short_name    text,
  kind          text not null default 'municipality'
                check (kind in ('municipality','utility','transport','governorate','ministry','police','other')),
  city_id       uuid references public.cities(id) on delete set null,
  district_id   uuid references public.districts(id) on delete set null,
  website       text,
  contact_email text,
  contact_phone text,
  cimer_code    text,                 -- CİMER / e-Devlet birim kodu
  -- Kurumun yanıt vermesi beklenen süre (gün). Sessizlik sayacı eşiği.
  response_sla_days smallint not null default 30 check (response_sla_days > 0),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
drop trigger if exists trg_authorities_touch on public.authorities;
create trigger trg_authorities_touch before update on public.authorities
  for each row execute function public.touch_updated_at();

-- Kategori → varsayılan yetkili kurum eşlemesi (ilçe bazlı)
create table if not exists public.category_authorities (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references public.report_categories(id) on delete cascade,
  authority_id uuid not null references public.authorities(id) on delete cascade,
  district_id  uuid references public.districts(id) on delete cascade,
  is_primary   boolean not null default true
);
create unique index if not exists uq_category_authority
  on public.category_authorities(category_id, authority_id, coalesce(district_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ---------------------------------------------------------------------------
-- Resmî başvurular
-- ---------------------------------------------------------------------------
create table if not exists public.authority_submissions (
  id              uuid primary key default gen_random_uuid(),
  report_id       uuid not null references public.reports(id) on delete cascade,
  authority_id    uuid not null references public.authorities(id) on delete restrict,
  channel         text not null default 'cimer'
                  check (channel in ('cimer','email','petition','phone','portal','in_person','other')),
  reference_no    text,                 -- başvuru numarası
  submitted_at    timestamptz not null default now(),
  submitted_by    uuid references public.profiles(id) on delete set null,
  document_path   text,                 -- başvuru belgesi (storage)
  response_at     timestamptz,
  response_text   text,
  response_document_path text,
  outcome         text check (outcome in ('pending','acknowledged','in_progress','resolved','rejected','no_response')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_submissions_report on public.authority_submissions(report_id, submitted_at desc);
create index if not exists idx_submissions_authority on public.authority_submissions(authority_id);

drop trigger if exists trg_submissions_touch on public.authority_submissions;
create trigger trg_submissions_touch before update on public.authority_submissions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Durum geçmişi
-- ---------------------------------------------------------------------------
create table if not exists public.report_status_history (
  id          uuid primary key default gen_random_uuid(),
  report_id   uuid not null references public.reports(id) on delete cascade,
  from_status public.report_status,
  to_status   public.report_status not null,
  note        text,
  actor_id    uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_status_history_report on public.report_status_history(report_id, created_at);

-- ---------------------------------------------------------------------------
-- KANIT ZİNCİRİ
-- Append-only, hash ile birbirine bağlı olay kaydı. Bir kaydın sonradan
-- değiştirilmesi zinciri kırar; verify_report_chain() bunu tespit eder.
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'report_event_type') then
    create type public.report_event_type as enum (
      'created',
      'media_added',
      'support_milestone',
      'status_changed',
      'authority_submitted',
      'authority_reference_added',
      'authority_responded',
      'resolution_evidence',
      'merged',
      'moderated',
      'note'
    );
  end if;
end $$;

create table if not exists public.report_events (
  id         bigserial primary key,
  report_id  uuid not null references public.reports(id) on delete cascade,
  seq        integer not null,
  event_type public.report_event_type not null,
  summary    text not null,
  payload    jsonb not null default '{}'::jsonb,
  actor_id   uuid references public.profiles(id) on delete set null,
  actor_label text,                    -- "AYRA Moderasyon", "Vatandaş", kurum adı
  occurred_at timestamptz not null default now(),
  prev_hash  text,
  hash       text not null,
  unique (report_id, seq)
);
create index if not exists idx_events_report on public.report_events(report_id, seq);

-- Zincire olay ekler. Hash = sha256(prev_hash | report_id | seq | type | summary | payload | occurred_at)
create or replace function public.append_report_event(
  p_report_id  uuid,
  p_type       public.report_event_type,
  p_summary    text,
  p_payload    jsonb default '{}'::jsonb,
  p_actor_id   uuid default null,
  p_actor_label text default null,
  p_occurred_at timestamptz default now()
) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_seq  integer;
  v_prev text;
  v_hash text;
  v_id   bigint;
begin
  select e.seq, e.hash into v_seq, v_prev
  from public.report_events e
  where e.report_id = p_report_id
  order by e.seq desc
  limit 1;

  v_seq := coalesce(v_seq, 0) + 1;

  v_hash := encode(sha256(convert_to(
      coalesce(v_prev, '') || '|' || p_report_id::text || '|' || v_seq::text || '|' ||
      p_type::text || '|' || p_summary || '|' || coalesce(p_payload::text, '{}') || '|' ||
      to_char(p_occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    'UTF8')), 'hex');

  insert into public.report_events
    (report_id, seq, event_type, summary, payload, actor_id, actor_label, occurred_at, prev_hash, hash)
  values
    (p_report_id, v_seq, p_type, p_summary, coalesce(p_payload, '{}'::jsonb), p_actor_id, p_actor_label, p_occurred_at, v_prev, v_hash)
  returning id into v_id;

  return v_id;
end $$;

-- Zincir bütünlüğü doğrulaması
create or replace function public.verify_report_chain(p_report_id uuid)
returns table (seq integer, ok boolean)
language plpgsql stable as $$
declare
  r record;
  v_prev text := null;
  v_calc text;
begin
  for r in
    select * from public.report_events e where e.report_id = p_report_id order by e.seq
  loop
    v_calc := encode(sha256(convert_to(
        coalesce(v_prev, '') || '|' || r.report_id::text || '|' || r.seq::text || '|' ||
        r.event_type::text || '|' || r.summary || '|' || coalesce(r.payload::text, '{}') || '|' ||
        to_char(r.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
      'UTF8')), 'hex');
    seq := r.seq;
    ok  := (v_calc = r.hash) and (coalesce(r.prev_hash, '') = coalesce(v_prev, ''));
    v_prev := r.hash;
    return next;
  end loop;
end $$;

-- Kanıt zinciri değiştirilemez: UPDATE/DELETE engellenir
create or replace function public.block_event_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'report_events append-only bir tablodur; kayıtlar değiştirilemez veya silinemez.';
end $$;

drop trigger if exists trg_events_immutable on public.report_events;
create trigger trg_events_immutable before update or delete on public.report_events
  for each row execute function public.block_event_mutation();

-- ---------------------------------------------------------------------------
-- Durum değişimlerini zincire ve rapora yansıt
-- ---------------------------------------------------------------------------
create or replace function public.on_status_history_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_label text;
begin
  v_label := case new.to_status
    when 'new' then 'Sorun bildirildi'
    when 'verified' then 'Sorun doğrulandı'
    when 'forwarded' then 'Yetkili kuruma iletildi'
    when 'in_review' then 'Kurum tarafından inceleniyor'
    when 'awaiting_resolution' then 'Çözüm bekleniyor'
    when 'resolved' then 'Sorun çözüldü'
    when 'unresolved' then 'Çözülemedi olarak kapatıldı'
    when 'duplicate' then 'Mevcut bir bildirimle birleştirildi'
    when 'rejected' then 'Yayından kaldırıldı'
  end;

  perform public.append_report_event(
    new.report_id, 'status_changed', v_label,
    jsonb_build_object('from', new.from_status, 'to', new.to_status, 'note', new.note),
    new.actor_id, null, new.created_at
  );

  update public.reports r set
    status = new.to_status,
    status_note = coalesce(new.note, r.status_note),
    first_forwarded_at = case
      when new.to_status = 'forwarded' and r.first_forwarded_at is null then new.created_at
      else r.first_forwarded_at end,
    resolved_at = case
      when new.to_status = 'resolved' then new.created_at
      when new.to_status in ('new','verified','forwarded','in_review','awaiting_resolution') then null
      else r.resolved_at end
  where r.id = new.report_id and r.status is distinct from new.to_status;

  return new;
end $$;

drop trigger if exists trg_status_history on public.report_status_history;
create trigger trg_status_history after insert on public.report_status_history
  for each row execute function public.on_status_history_insert();

-- Yeni sorun → zincirin ilk halkası
create or replace function public.on_report_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.append_report_event(
    new.id, 'created', 'Sorun oluşturuldu',
    jsonb_build_object('ref_code', new.ref_code, 'category_id', new.category_id,
                       'neighborhood_id', new.neighborhood_id),
    new.user_id, null, new.created_at
  );
  insert into public.report_status_history (report_id, from_status, to_status, actor_id, created_at)
  values (new.id, null, 'new', new.user_id, new.created_at);
  return new;
end $$;

drop trigger if exists trg_report_created on public.reports;
create trigger trg_report_created after insert on public.reports
  for each row execute function public.on_report_created();

-- Başvuru → zincire
create or replace function public.on_submission_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_auth text;
begin
  select coalesce(a.short_name, a.name) into v_auth from public.authorities a where a.id = new.authority_id;

  if tg_op = 'INSERT' then
    perform public.append_report_event(
      new.report_id, 'authority_submitted',
      v_auth || ' kurumuna resmî başvuru yapıldı',
      jsonb_build_object('authority_id', new.authority_id, 'channel', new.channel,
                         'reference_no', new.reference_no),
      new.submitted_by, v_auth, new.submitted_at
    );
  elsif tg_op = 'UPDATE' then
    if new.reference_no is distinct from old.reference_no and new.reference_no is not null then
      perform public.append_report_event(
        new.report_id, 'authority_reference_added',
        'Başvuru numarası eklendi: ' || new.reference_no,
        jsonb_build_object('reference_no', new.reference_no), new.submitted_by, v_auth, now()
      );
    end if;
    if new.response_at is distinct from old.response_at and new.response_at is not null then
      perform public.append_report_event(
        new.report_id, 'authority_responded',
        v_auth || ' yanıt verdi',
        jsonb_build_object('outcome', new.outcome, 'response_text', left(coalesce(new.response_text,''), 500)),
        new.submitted_by, v_auth, new.response_at
      );
      update public.reports set first_response_at = least(coalesce(first_response_at, new.response_at), new.response_at)
      where id = new.report_id;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_submission_write on public.authority_submissions;
create trigger trg_submission_write after insert or update on public.authority_submissions
  for each row execute function public.on_submission_write();

-- Çözüm fotoğrafı → zincire
create or replace function public.on_media_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'resolution' then
    perform public.append_report_event(
      new.report_id, 'resolution_evidence', 'Çözüm görseli yüklendi',
      jsonb_build_object('media_id', new.id), new.uploaded_by, null, new.created_at
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_media_insert on public.report_media;
create trigger trg_media_insert after insert on public.report_media
  for each row execute function public.on_media_insert();

-- Destek kilometre taşları (10, 25, 50, 100, 250, 500, 1000)
create or replace function public.on_support_milestone()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  select support_count into v_count from public.reports where id = new.report_id;
  if v_count in (10, 25, 50, 100, 250, 500, 1000) then
    perform public.append_report_event(
      new.report_id, 'support_milestone', v_count || ' kişi destekledi',
      jsonb_build_object('support_count', v_count), null, null, now()
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_support_milestone on public.report_supports;
create trigger trg_support_milestone after insert on public.report_supports
  for each row execute function public.on_support_milestone();

-- ══════════════════════════════════════════════════════════════════════════
-- MIGRATION 0007_notifications_moderation.sql
-- ══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- AYRA · 0007 · Bildirimler, moderasyon, takip
-- =============================================================================

-- Kullanıcının takip ettiği sorunlar (destek verenler otomatik takipçidir)
create table if not exists public.report_follows (
  report_id  uuid not null references public.reports(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (report_id, user_id)
);
create index if not exists idx_follows_user on public.report_follows(user_id, created_at desc);

-- Destek veren otomatik takip eder
create or replace function public.on_support_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.report_follows (report_id, user_id)
  values (new.report_id, new.user_id)
  on conflict do nothing;
  return new;
end $$;

drop trigger if exists trg_support_follow on public.report_supports;
create trigger trg_support_follow after insert on public.report_supports
  for each row execute function public.on_support_follow();

-- ---------------------------------------------------------------------------
-- Bildirimler
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  report_id  uuid references public.reports(id) on delete cascade,
  kind       text not null check (kind in
              ('status_changed','authority_submitted','authority_responded','resolved','milestone','moderation','system')),
  title      text not null,
  body       text,
  url        text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user on public.notifications(user_id, created_at desc);
create index if not exists idx_notifications_unread on public.notifications(user_id) where read_at is null;

-- Web Push abonelikleri
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth_key   text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

-- Durum değişince takipçilere bildirim
create or replace function public.fanout_status_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_report record;
  v_title  text;
begin
  select r.id, r.title, r.slug into v_report from public.reports r where r.id = new.report_id;
  if v_report.id is null then return new; end if;

  v_title := case new.to_status
    when 'forwarded' then 'Desteklediğiniz sorun yetkili kuruma iletildi'
    when 'in_review' then 'Desteklediğiniz sorun inceleniyor'
    when 'resolved'  then 'Desteklediğiniz sorun çözüldü'
    when 'unresolved' then 'Desteklediğiniz sorun çözülemedi olarak kapatıldı'
    when 'verified'  then 'Desteklediğiniz sorun doğrulandı'
    else null
  end;

  if v_title is null then return new; end if;

  insert into public.notifications (user_id, report_id, kind, title, body, url)
  select f.user_id, v_report.id,
         case when new.to_status = 'resolved' then 'resolved' else 'status_changed' end,
         v_title, v_report.title, '/sorun/' || v_report.slug
  from public.report_follows f
  where f.user_id is not null;

  return new;
end $$;

drop trigger if exists trg_status_notify on public.report_status_history;
create trigger trg_status_notify after insert on public.report_status_history
  for each row execute function public.fanout_status_notification();

-- ---------------------------------------------------------------------------
-- Moderasyon
-- ---------------------------------------------------------------------------
create table if not exists public.moderation_reports (
  id           uuid primary key default gen_random_uuid(),
  report_id    uuid not null references public.reports(id) on delete cascade,
  reporter_id  uuid references public.profiles(id) on delete set null,
  reason       text not null check (reason in
                ('spam','duplicate','offensive','personal_data','political','commercial','fake','other')),
  detail       text check (char_length(detail) <= 1000),
  status       text not null default 'open' check (status in ('open','reviewing','actioned','dismissed')),
  resolved_by  uuid references public.profiles(id) on delete set null,
  resolved_at  timestamptz,
  resolution_note text,
  created_at   timestamptz not null default now(),
  unique (report_id, reporter_id)
);
create index if not exists idx_moderation_open on public.moderation_reports(status, created_at desc);

-- Oran sınırlama sayacı (IP/kullanıcı bazlı, sunucu tarafında kullanılır)
create table if not exists public.rate_limits (
  bucket     text not null,
  identity   text not null,
  window_start timestamptz not null,
  count      integer not null default 0,
  primary key (bucket, identity, window_start)
);
create index if not exists idx_rate_limits_window on public.rate_limits(window_start);

-- ══════════════════════════════════════════════════════════════════════════
-- MIGRATION 0008_views_and_rpc.sql
-- ══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- AYRA · 0008 · Görünümler ve sorgu fonksiyonları
-- =============================================================================

-- Kart görünümü: harita, keşfet ve profil ekranlarının tek kaynağı.
create or replace view public.report_cards
with (security_invoker = true) as
select
  r.id,
  r.ref_code,
  r.slug,
  r.title,
  r.description,
  r.status,
  r.latitude,
  r.longitude,
  r.address,
  r.support_count,
  r.view_count,
  r.created_at,
  r.updated_at,
  r.resolved_at,
  r.first_forwarded_at,
  r.first_response_at,
  r.user_id,
  c.id           as category_id,
  c.name         as category_name,
  c.slug         as category_slug,
  c.icon         as category_icon,
  c.color        as category_color,
  coalesce(pc.id, c.id)     as root_category_id,
  coalesce(pc.name, c.name) as root_category_name,
  c.sla_days,
  n.id           as neighborhood_id,
  n.name         as neighborhood_name,
  n.slug         as neighborhood_slug,
  d.name         as district_name,
  d.slug         as district_slug,
  ct.name        as city_name,
  ct.slug        as city_slug,
  (select m.storage_path from public.report_media m
    where m.report_id = r.id and m.kind = 'issue'
    order by m.sort_order, m.created_at limit 1) as cover_path,
  (select m.storage_path from public.report_media m
    where m.report_id = r.id and m.kind = 'resolution'
    order by m.sort_order, m.created_at limit 1) as resolution_path,
  (select count(*) from public.report_media m where m.report_id = r.id) as media_count,
  -- Yetkili sessizlik göstergesi: başvurudan bu yana geçen süre (saat)
  case
    when r.first_forwarded_at is not null and r.first_response_at is null
      and r.status not in ('resolved','unresolved','duplicate','rejected')
    then extract(epoch from (now() - r.first_forwarded_at)) / 3600.0
    else null
  end as awaiting_response_hours,
  case
    when r.resolved_at is not null
    then extract(epoch from (r.resolved_at - r.created_at)) / 86400.0
    else null
  end as resolution_days
from public.reports r
join public.report_categories c on c.id = r.category_id
left join public.report_categories pc on pc.id = c.parent_id
left join public.neighborhoods n on n.id = r.neighborhood_id
left join public.districts d on d.id = r.district_id
left join public.cities ct on ct.id = r.city_id
where not r.is_hidden and r.status <> 'rejected';

-- ---------------------------------------------------------------------------
-- Harita: viewport içindeki bildirimler
-- ---------------------------------------------------------------------------
create or replace function public.reports_in_bbox(
  p_min_lat double precision,
  p_min_lng double precision,
  p_max_lat double precision,
  p_max_lng double precision,
  p_category_ids uuid[] default null,
  p_statuses public.report_status[] default null,
  p_limit integer default 500
)
returns setof public.report_cards
language sql stable as $$
  select *
  from public.report_cards rc
  where rc.latitude between p_min_lat and p_max_lat
    and rc.longitude between p_min_lng and p_max_lng
    and (p_category_ids is null or rc.category_id = any(p_category_ids) or rc.root_category_id = any(p_category_ids))
    and (p_statuses is null or rc.status = any(p_statuses))
    and rc.status <> 'duplicate'
  order by rc.support_count desc, rc.created_at desc
  limit least(greatest(p_limit, 1), 2000)
$$;

-- ---------------------------------------------------------------------------
-- Yakınımda
-- ---------------------------------------------------------------------------
create or replace function public.reports_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_m integer default 500,
  p_limit integer default 50
)
returns setof jsonb
language sql stable as $$
  with box as (
    select
      p_lat - (p_radius_m / 111320.0) as min_lat,
      p_lat + (p_radius_m / 111320.0) as max_lat,
      p_lng - (p_radius_m / (111320.0 * greatest(cos(radians(p_lat)), 0.01))) as min_lng,
      p_lng + (p_radius_m / (111320.0 * greatest(cos(radians(p_lat)), 0.01))) as max_lng
  )
  select to_jsonb(rc) || jsonb_build_object(
           'distance_m', round(public.distance_m(p_lat, p_lng, rc.latitude, rc.longitude)::numeric, 1))
  from public.report_cards rc, box b
  where rc.latitude between b.min_lat and b.max_lat
    and rc.longitude between b.min_lng and b.max_lng
    and public.distance_m(p_lat, p_lng, rc.latitude, rc.longitude) <= p_radius_m
    and rc.status <> 'duplicate'
  order by public.distance_m(p_lat, p_lng, rc.latitude, rc.longitude) asc
  limit least(greatest(p_limit, 1), 200)
$$;

-- ---------------------------------------------------------------------------
-- Mükerrer önleme: bildirim oluştururken benzer sorun önerisi
-- ---------------------------------------------------------------------------
create or replace function public.similar_reports(
  p_lat double precision,
  p_lng double precision,
  p_category_id uuid default null,
  p_radius_m integer default 250,
  p_days integer default 180,
  p_limit integer default 5
)
returns setof jsonb
language sql stable as $$
  select to_jsonb(rc) || jsonb_build_object(
           'distance_m', round(public.distance_m(p_lat, p_lng, rc.latitude, rc.longitude)::numeric, 1))
  from public.report_cards rc
  where rc.status not in ('resolved','unresolved','duplicate')
    and rc.created_at > now() - make_interval(days => greatest(p_days, 1))
    and public.distance_m(p_lat, p_lng, rc.latitude, rc.longitude) <= p_radius_m
    and (
      p_category_id is null
      or rc.category_id = p_category_id
      or rc.root_category_id = (
           select coalesce(c.parent_id, c.id) from public.report_categories c where c.id = p_category_id
         )
    )
  order by public.distance_m(p_lat, p_lng, rc.latitude, rc.longitude) asc
  limit least(greatest(p_limit, 1), 20)
$$;

-- ---------------------------------------------------------------------------
-- Destekleme (tek seferlik, idempotent)
-- ---------------------------------------------------------------------------
create or replace function public.toggle_support(p_report_id uuid)
returns table (supported boolean, support_count integer)
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_exists boolean;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if public.is_banned() then
    raise exception 'ACCOUNT_SUSPENDED' using errcode = '42501';
  end if;
  if not exists (select 1 from public.reports r where r.id = p_report_id and not r.is_hidden and r.status <> 'rejected') then
    raise exception 'REPORT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select exists(select 1 from public.report_supports s where s.report_id = p_report_id and s.user_id = v_user)
    into v_exists;

  if v_exists then
    delete from public.report_supports s where s.report_id = p_report_id and s.user_id = v_user;
    supported := false;
  else
    insert into public.report_supports (report_id, user_id) values (p_report_id, v_user)
      on conflict do nothing;
    supported := true;
  end if;

  select r.support_count into support_count from public.reports r where r.id = p_report_id;
  return next;
end $$;

-- ---------------------------------------------------------------------------
-- Görüntülenme kaydı (günlük tekilleştirme)
-- ---------------------------------------------------------------------------
create or replace function public.register_view(p_report_id uuid, p_viewer_hash text)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_new boolean := false;
  v_count integer;
begin
  insert into public.report_views (report_id, viewer_hash)
  values (p_report_id, p_viewer_hash)
  on conflict do nothing;

  get diagnostics v_new = row_count;

  if v_new then
    update public.reports set view_count = view_count + 1 where id = p_report_id;
  end if;

  select view_count into v_count from public.reports where id = p_report_id;
  return coalesce(v_count, 0);
end $$;

-- ---------------------------------------------------------------------------
-- Platform istatistikleri (ana sayfa) — gerçek veriden
-- ---------------------------------------------------------------------------
create or replace function public.platform_stats(p_city_slug text default null)
returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'total_reports',    count(*),
    'open_reports',     count(*) filter (where status in ('new','verified','forwarded','in_review','awaiting_resolution')),
    'resolved_reports', count(*) filter (where status = 'resolved'),
    'resolved_this_month', count(*) filter (where status = 'resolved' and resolved_at >= date_trunc('month', now())),
    'total_supports',   coalesce(sum(support_count), 0),
    'forwarded_reports', count(*) filter (where first_forwarded_at is not null),
    'avg_resolution_days', round(avg(resolution_days) filter (where resolution_days is not null)::numeric, 1)
  )
  from public.report_cards
  where (p_city_slug is null or city_slug = p_city_slug)
    and status <> 'duplicate'
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- MIGRATION 0009_ayra_score.sql
-- ══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- AYRA · 0009 · AYRA Skoru
--
-- METODOLOJİ (şeffaf, rastgele değil)
-- ---------------------------------------------------------------------------
-- Skor bir mahallenin "iyi/kötü" yargısı değil; o mahallede bildirilen
-- sorunların ne kadarının çözüme kavuştuğunun ve ne hızda kavuştuğunun
-- ölçüsüdür. Yalnızca platform üzerindeki doğrulanabilir veriden hesaplanır.
--
-- Her kategori için 0-100 arası bir alt skor üretilir:
--
--   alt_skor = 40 × yük_bileşeni + 35 × çözüm_oranı + 25 × hız_bileşeni
--
--   yük_bileşeni  = 1 − min(1, etkin_açık_sorun / (nüfus/1000 × REF))
--                   REF = 1000 kişi başına 5 açık sorun → doygunluk noktası
--                   etkin_açık_sorun = Σ (1 + ln(1+destek)/ln(50))
--                   Yani çok desteklenen bir sorun, tek bir bildirimden
--                   daha ağır sayılır. Toplumsal öncelik skora yansır.
--
--   çözüm_oranı   = çözülen / (çözülen + açık)
--
--   hız_bileşeni  = 1 − min(1, medyan_çözüm_günü / (2 × kategori_sla))
--                   SLA'nın iki katında sıfırlanır.
--
-- Genel AYRA Skoru = kategori ağırlıklarıyla (report_categories.weight)
-- ağırlıklandırılmış alt skorların ortalaması. Verisi olmayan kategori
-- hesaba katılmaz; "veri yok" olarak gösterilir (sahte 100 üretilmez).
--
-- Güven düzeyi (confidence) örneklem büyüklüğüne bağlıdır:
--   < 10 bildirim  → 'low', < 40 → 'medium', aksi halde 'high'
-- =============================================================================

create table if not exists public.score_settings (
  key   text primary key,
  value numeric not null,
  note  text
);

insert into public.score_settings (key, value, note) values
  ('ref_open_per_1k', 5,    '1000 kişi başına doygunluk noktası (açık sorun)'),
  ('w_burden',        0.40, 'Yük bileşeninin ağırlığı'),
  ('w_resolution',    0.35, 'Çözüm oranının ağırlığı'),
  ('w_speed',         0.25, 'Hız bileşeninin ağırlığı'),
  ('support_log_base',50,   'Destek logaritma tabanı'),
  ('window_days',     365,  'Değerlendirme penceresi (gün)'),
  ('default_population', 5000, 'Nüfus verisi yoksa varsayılan')
on conflict (key) do nothing;

create or replace function public.score_setting(p_key text)
returns numeric language sql stable as $$
  select value from public.score_settings where key = p_key
$$;

create or replace function public.compute_neighborhood_score(
  p_neighborhood_id uuid,
  p_window_days integer default null
) returns jsonb
language plpgsql stable as $$
declare
  v_window      integer := coalesce(p_window_days, public.score_setting('window_days')::int, 365);
  v_ref         numeric := coalesce(public.score_setting('ref_open_per_1k'), 5);
  v_w_burden    numeric := coalesce(public.score_setting('w_burden'), 0.40);
  v_w_res       numeric := coalesce(public.score_setting('w_resolution'), 0.35);
  v_w_speed     numeric := coalesce(public.score_setting('w_speed'), 0.25);
  v_log_base    numeric := coalesce(public.score_setting('support_log_base'), 50);
  v_pop         numeric;
  v_categories  jsonb := '[]'::jsonb;
  v_num         numeric := 0;
  v_den         numeric := 0;
  v_total       integer := 0;
  r             record;
  v_capacity    numeric;
  v_burden      numeric;
  v_res_rate    numeric;
  v_speed       numeric;
  v_sub         numeric;
begin
  select coalesce(nullif(n.population, 0), public.score_setting('default_population'))
    into v_pop
  from public.neighborhoods n where n.id = p_neighborhood_id;

  if v_pop is null then
    return jsonb_build_object('available', false, 'reason', 'neighborhood_not_found');
  end if;

  v_capacity := greatest((v_pop / 1000.0) * v_ref, 1);

  for r in
    select
      c.id, c.name, c.slug, c.icon, c.color, c.weight, c.sla_days,
      count(*) filter (where rc.status in ('new','verified','forwarded','in_review','awaiting_resolution')) as open_count,
      count(*) filter (where rc.status = 'resolved') as resolved_count,
      count(*) filter (where rc.status = 'unresolved') as unresolved_count,
      coalesce(sum(
        case when rc.status in ('new','verified','forwarded','in_review','awaiting_resolution')
             then 1 + ln(1 + rc.support_count) / ln(v_log_base)
             else 0 end
      ), 0) as effective_open,
      percentile_cont(0.5) within group (
        order by rc.resolution_days
      ) filter (where rc.resolution_days is not null) as median_days
    from public.report_categories c
    left join public.report_cards rc
      on coalesce(rc.root_category_id, rc.category_id) = c.id
     and rc.neighborhood_id = p_neighborhood_id
     and rc.status <> 'duplicate'
     and rc.created_at > now() - make_interval(days => v_window)
    where c.parent_id is null and c.is_active
    group by c.id, c.name, c.slug, c.icon, c.color, c.weight, c.sla_days
    order by c.sort_order
  loop
    if (r.open_count + r.resolved_count + r.unresolved_count) = 0 then
      v_categories := v_categories || jsonb_build_object(
        'category_id', r.id, 'name', r.name, 'slug', r.slug,
        'icon', r.icon, 'color', r.color,
        'score', null, 'available', false,
        'open_count', 0, 'resolved_count', 0
      );
      continue;
    end if;

    v_burden   := 1 - least(1, r.effective_open / v_capacity);
    v_res_rate := r.resolved_count::numeric
                  / nullif(r.resolved_count + r.unresolved_count + r.open_count, 0);
    v_speed    := case
                    when r.median_days is null then v_res_rate  -- henüz çözüm yok: oranı taşı
                    else 1 - least(1, r.median_days / (2.0 * r.sla_days))
                  end;

    v_sub := 100 * (v_w_burden * v_burden + v_w_res * coalesce(v_res_rate, 0) + v_w_speed * coalesce(v_speed, 0));
    v_sub := greatest(0, least(100, v_sub));

    v_num   := v_num + v_sub * r.weight;
    v_den   := v_den + r.weight;
    v_total := v_total + r.open_count + r.resolved_count + r.unresolved_count;

    v_categories := v_categories || jsonb_build_object(
      'category_id', r.id, 'name', r.name, 'slug', r.slug,
      'icon', r.icon, 'color', r.color,
      'available', true,
      'score', round(v_sub, 0),
      'open_count', r.open_count,
      'resolved_count', r.resolved_count,
      'unresolved_count', r.unresolved_count,
      'median_resolution_days', round(coalesce(r.median_days, 0)::numeric, 1),
      'components', jsonb_build_object(
        'burden', round(v_burden * 100, 0),
        'resolution_rate', round(coalesce(v_res_rate, 0) * 100, 0),
        'speed', round(coalesce(v_speed, 0) * 100, 0)
      )
    );
  end loop;

  if v_den = 0 then
    return jsonb_build_object(
      'available', false, 'reason', 'no_data',
      'neighborhood_id', p_neighborhood_id,
      'categories', v_categories, 'window_days', v_window
    );
  end if;

  return jsonb_build_object(
    'available', true,
    'neighborhood_id', p_neighborhood_id,
    'score', round(v_num / v_den, 0),
    'total_reports', v_total,
    'confidence', case when v_total < 10 then 'low' when v_total < 40 then 'medium' else 'high' end,
    'window_days', v_window,
    'population', v_pop,
    'categories', v_categories,
    'computed_at', now()
  );
end $$;

-- Anlık görüntü tablosu (ana sayfa ve liste ekranları hızlı okusun diye)
create table if not exists public.neighborhood_scores (
  neighborhood_id uuid primary key references public.neighborhoods(id) on delete cascade,
  score           smallint,
  confidence      text,
  total_reports   integer not null default 0,
  breakdown       jsonb not null default '{}'::jsonb,
  computed_at     timestamptz not null default now()
);

create or replace function public.refresh_neighborhood_scores()
returns integer language plpgsql security definer set search_path = public as $$
declare
  n record;
  v_result jsonb;
  v_count integer := 0;
begin
  for n in select id from public.neighborhoods where is_active loop
    v_result := public.compute_neighborhood_score(n.id);
    insert into public.neighborhood_scores (neighborhood_id, score, confidence, total_reports, breakdown, computed_at)
    values (
      n.id,
      case when (v_result ->> 'available')::boolean then (v_result ->> 'score')::smallint else null end,
      v_result ->> 'confidence',
      coalesce((v_result ->> 'total_reports')::integer, 0),
      v_result,
      now()
    )
    on conflict (neighborhood_id) do update set
      score = excluded.score,
      confidence = excluded.confidence,
      total_reports = excluded.total_reports,
      breakdown = excluded.breakdown,
      computed_at = excluded.computed_at;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- MIGRATION 0010_rls.sql
-- ══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- AYRA · 0010 · Row Level Security
-- Varsayılan: her şey kapalı. Politikalar yalnızca gerekli olanı açar.
-- =============================================================================

alter table public.countries              enable row level security;
alter table public.cities                 enable row level security;
alter table public.districts              enable row level security;
alter table public.neighborhoods          enable row level security;
alter table public.report_categories      enable row level security;
alter table public.profiles               enable row level security;
alter table public.reports                enable row level security;
alter table public.report_media           enable row level security;
alter table public.report_supports        enable row level security;
alter table public.report_follows         enable row level security;
alter table public.report_status_history  enable row level security;
alter table public.report_events          enable row level security;
alter table public.report_views           enable row level security;
alter table public.authorities            enable row level security;
alter table public.category_authorities   enable row level security;
alter table public.authority_submissions  enable row level security;
alter table public.notifications          enable row level security;
alter table public.push_subscriptions     enable row level security;
alter table public.moderation_reports     enable row level security;
alter table public.neighborhood_scores    enable row level security;
alter table public.score_settings         enable row level security;
alter table public.rate_limits            enable row level security;

-- ---------------------------------------------------------------------------
-- Referans veri: herkes okur, yalnızca admin yazar
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'countries','cities','districts','neighborhoods','report_categories',
    'authorities','category_authorities','neighborhood_scores','score_settings'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select using (true)', t || '_read', t);

    execute format('drop policy if exists %I on public.%I', t || '_admin_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
                   t || '_admin_write', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Profiller
-- ---------------------------------------------------------------------------
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    -- Kullanıcı kendi rolünü veya ban durumunu değiştiremez
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and is_banned = (select p.is_banned from public.profiles p where p.id = auth.uid())
  );

drop policy if exists profiles_moderate on public.profiles;
create policy profiles_moderate on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Bildirimler (reports)
-- ---------------------------------------------------------------------------
drop policy if exists reports_public_read on public.reports;
create policy reports_public_read on public.reports
  for select using (
    (not is_hidden and status <> 'rejected')
    or user_id = auth.uid()
    or public.is_moderator()
  );

drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and not public.is_banned()
    and status = 'new'
    and duplicate_of_id is null
    and not is_hidden
  );

-- Sahibi yalnızca 'new' durumundayken ve ilk 60 dakika içinde metin düzeltebilir
drop policy if exists reports_update_own on public.reports;
create policy reports_update_own on public.reports
  for update to authenticated
  using (
    user_id = auth.uid()
    and status = 'new'
    and created_at > now() - interval '60 minutes'
    and not public.is_banned()
  )
  with check (
    user_id = auth.uid()
    and status = 'new'
    and not is_hidden
    and duplicate_of_id is null
  );

drop policy if exists reports_moderate on public.reports;
create policy reports_moderate on public.reports
  for all to authenticated
  using (public.is_moderator()) with check (public.is_moderator());

-- ---------------------------------------------------------------------------
-- Medya
-- ---------------------------------------------------------------------------
drop policy if exists media_read on public.report_media;
create policy media_read on public.report_media
  for select using (
    exists (select 1 from public.reports r where r.id = report_id
            and ((not r.is_hidden and r.status <> 'rejected') or r.user_id = auth.uid() or public.is_moderator()))
  );

drop policy if exists media_insert on public.report_media;
create policy media_insert on public.report_media
  for insert to authenticated
  with check (
    not public.is_banned()
    and (
      -- Sorun görseli: yalnızca sorunun sahibi, ilk 60 dakika içinde
      (kind = 'issue' and exists (
        select 1 from public.reports r
        where r.id = report_id and r.user_id = auth.uid()
          and r.created_at > now() - interval '60 minutes'))
      -- Çözüm görseli / belge: yalnızca moderatör
      or (kind in ('resolution','document') and public.is_moderator())
    )
  );

drop policy if exists media_moderate on public.report_media;
create policy media_moderate on public.report_media
  for all to authenticated using (public.is_moderator()) with check (public.is_moderator());

-- ---------------------------------------------------------------------------
-- Destekler
-- ---------------------------------------------------------------------------
drop policy if exists supports_read on public.report_supports;
create policy supports_read on public.report_supports for select using (true);

drop policy if exists supports_write_own on public.report_supports;
create policy supports_write_own on public.report_supports
  for insert to authenticated with check (user_id = auth.uid() and not public.is_banned());

drop policy if exists supports_delete_own on public.report_supports;
create policy supports_delete_own on public.report_supports
  for delete to authenticated using (user_id = auth.uid());

-- Takipler yalnızca sahibine görünür
drop policy if exists follows_own on public.report_follows;
create policy follows_own on public.report_follows
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Durum geçmişi ve kanıt zinciri: herkes okur, yalnızca moderatör yazar
-- ---------------------------------------------------------------------------
drop policy if exists status_history_read on public.report_status_history;
create policy status_history_read on public.report_status_history for select using (true);

drop policy if exists status_history_write on public.report_status_history;
create policy status_history_write on public.report_status_history
  for insert to authenticated with check (public.is_moderator());

drop policy if exists events_read on public.report_events;
create policy events_read on public.report_events for select using (true);
-- INSERT yalnızca SECURITY DEFINER fonksiyonu üzerinden; doğrudan yazma politikası yok.

drop policy if exists views_no_read on public.report_views;
-- report_views tamamen kapalı; yalnızca SECURITY DEFINER register_view() yazar.

-- ---------------------------------------------------------------------------
-- Başvurular: kamuya açık şeffaflık kaydıdır
-- ---------------------------------------------------------------------------
drop policy if exists submissions_read on public.authority_submissions;
create policy submissions_read on public.authority_submissions for select using (true);

drop policy if exists submissions_write on public.authority_submissions;
create policy submissions_write on public.authority_submissions
  for all to authenticated using (public.is_moderator()) with check (public.is_moderator());

-- ---------------------------------------------------------------------------
-- Bildirimler / push
-- ---------------------------------------------------------------------------
drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications
  for select to authenticated using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Moderasyon ihbarları: kullanıcı kendi ihbarını görür, moderatör hepsini
-- ---------------------------------------------------------------------------
drop policy if exists moderation_insert on public.moderation_reports;
create policy moderation_insert on public.moderation_reports
  for insert to authenticated with check (reporter_id = auth.uid() and not public.is_banned());

drop policy if exists moderation_read on public.moderation_reports;
create policy moderation_read on public.moderation_reports
  for select to authenticated using (reporter_id = auth.uid() or public.is_moderator());

drop policy if exists moderation_manage on public.moderation_reports;
create policy moderation_manage on public.moderation_reports
  for update to authenticated using (public.is_moderator()) with check (public.is_moderator());

-- ---------------------------------------------------------------------------
-- Yetkiler
-- ---------------------------------------------------------------------------
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on
  public.reports, public.report_media, public.report_supports, public.report_follows,
  public.report_status_history, public.moderation_reports, public.notifications,
  public.push_subscriptions, public.profiles, public.authority_submissions,
  public.report_categories, public.authorities, public.category_authorities,
  public.neighborhoods, public.districts, public.cities, public.countries,
  public.score_settings, public.neighborhood_scores
to authenticated;

grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;

-- report_views ve rate_limits doğrudan erişime kapalı
revoke all on public.report_views, public.rate_limits from anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- MIGRATION 0011_score_refinement.sql
-- ══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- AYRA · 0011 · Skor metodolojisi düzeltmesi + zincir sadeleştirmesi
--
-- Sorun: İlk sürümde henüz çözülmemiş ama SLA süresi dolmamış bir bildirim,
-- "çözüm oranı 0" ve "hız 0" olarak sayılıyordu. Bu, yeni açılmış tek bir
-- bildirimi olan bir mahalleye haksız biçimde düşük skor veriyordu.
--
-- Düzeltme: Bileşenler yalnızca gerçek sinyal varsa hesaba katılır ve
-- ağırlıklar mevcut bileşenler arasında yeniden normalize edilir.
--   · SLA süresi içindeki açık bildirim  → nötr (başarısızlık sayılmaz)
--   · SLA süresi geçmiş açık bildirim    → başarısızlık
--   · Hiç çözüm yoksa hız bileşeni       → sinyal yok, dışarıda bırakılır
-- =============================================================================

-- Zincirde "Sorun oluşturuldu" ve "Sorun bildirildi" tekrarını kaldır.
create or replace function public.on_status_history_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_label text;
begin
  if new.from_status is not null then
    v_label := case new.to_status
      when 'new' then 'Sorun yeniden açıldı'
      when 'verified' then 'Sorun doğrulandı'
      when 'forwarded' then 'Yetkili kuruma iletildi'
      when 'in_review' then 'Kurum tarafından inceleniyor'
      when 'awaiting_resolution' then 'Çözüm bekleniyor'
      when 'resolved' then 'Sorun çözüldü'
      when 'unresolved' then 'Çözülemedi olarak kapatıldı'
      when 'duplicate' then 'Mevcut bir bildirimle birleştirildi'
      when 'rejected' then 'Yayından kaldırıldı'
    end;

    perform public.append_report_event(
      new.report_id, 'status_changed', v_label,
      jsonb_build_object('from', new.from_status, 'to', new.to_status, 'note', new.note),
      new.actor_id, null, new.created_at
    );
  end if;

  update public.reports r set
    status = new.to_status,
    status_note = coalesce(new.note, r.status_note),
    first_forwarded_at = case
      when new.to_status = 'forwarded' and r.first_forwarded_at is null then new.created_at
      else r.first_forwarded_at end,
    resolved_at = case
      when new.to_status = 'resolved' then new.created_at
      when new.to_status in ('new','verified','forwarded','in_review','awaiting_resolution') then null
      else r.resolved_at end
  where r.id = new.report_id and r.status is distinct from new.to_status;

  return new;
end $$;

-- ---------------------------------------------------------------------------
create or replace function public.compute_neighborhood_score(
  p_neighborhood_id uuid,
  p_window_days integer default null
) returns jsonb
language plpgsql stable as $$
declare
  v_window   integer := coalesce(p_window_days, public.score_setting('window_days')::int, 365);
  v_ref      numeric := coalesce(public.score_setting('ref_open_per_1k'), 5);
  v_w        numeric[] := array[
                coalesce(public.score_setting('w_burden'), 0.40),
                coalesce(public.score_setting('w_resolution'), 0.35),
                coalesce(public.score_setting('w_speed'), 0.25)
              ];
  v_log_base numeric := coalesce(public.score_setting('support_log_base'), 50);
  v_pop           numeric;
  v_pop_estimated boolean := false;
  v_categories jsonb := '[]'::jsonb;
  v_num numeric := 0;
  v_den numeric := 0;
  v_total integer := 0;
  r record;
  v_capacity numeric;
  v_burden numeric;
  v_res_rate numeric;
  v_speed numeric;
  v_sub numeric;
  v_wsum numeric;
begin
  select n.population into v_pop from public.neighborhoods n where n.id = p_neighborhood_id;
  if not found then
    return jsonb_build_object('available', false, 'reason', 'neighborhood_not_found');
  end if;
  if v_pop is null or v_pop = 0 then
    v_pop := coalesce(public.score_setting('default_population'), 5000);
    v_pop_estimated := true;
  end if;

  v_capacity := greatest((v_pop / 1000.0) * v_ref, 1);

  for r in
    select
      c.id, c.name, c.slug, c.icon, c.color, c.weight, c.sla_days,
      count(*) filter (where rc.status in ('new','verified','forwarded','in_review','awaiting_resolution')) as open_count,
      count(*) filter (where rc.status = 'resolved')   as resolved_count,
      count(*) filter (where rc.status = 'unresolved') as unresolved_count,
      -- SLA süresi dolmuş, hâlâ açık bildirimler
      count(*) filter (
        where rc.status in ('new','verified','forwarded','in_review','awaiting_resolution')
          and rc.created_at < now() - make_interval(days => c.sla_days)
      ) as overdue_count,
      coalesce(sum(
        case when rc.status in ('new','verified','forwarded','in_review','awaiting_resolution')
             then 1 + ln(1 + rc.support_count) / ln(v_log_base) else 0 end
      ), 0) as effective_open,
      percentile_cont(0.5) within group (order by rc.resolution_days)
        filter (where rc.resolution_days is not null) as median_days
    from public.report_categories c
    left join public.report_cards rc
      on coalesce(rc.root_category_id, rc.category_id) = c.id
     and rc.neighborhood_id = p_neighborhood_id
     and rc.status <> 'duplicate'
     and rc.created_at > now() - make_interval(days => v_window)
    where c.parent_id is null and c.is_active
    group by c.id, c.name, c.slug, c.icon, c.color, c.weight, c.sla_days
    order by c.sort_order
  loop
    if (r.open_count + r.resolved_count + r.unresolved_count) = 0 then
      v_categories := v_categories || jsonb_build_object(
        'category_id', r.id, 'name', r.name, 'slug', r.slug, 'icon', r.icon, 'color', r.color,
        'available', false, 'score', null, 'open_count', 0, 'resolved_count', 0
      );
      continue;
    end if;

    -- 1) Yük: her zaman sinyal taşır
    v_burden := 1 - least(1, r.effective_open / v_capacity);

    -- 2) Çözüm oranı: yalnızca sonuçlanmış veya süresi geçmiş işler sayılır
    if (r.resolved_count + r.unresolved_count + r.overdue_count) > 0 then
      v_res_rate := r.resolved_count::numeric / (r.resolved_count + r.unresolved_count + r.overdue_count);
    else
      v_res_rate := null;   -- henüz sinyal yok
    end if;

    -- 3) Hız: yalnızca gerçekten çözülmüş iş varsa
    if r.median_days is not null then
      v_speed := 1 - least(1, r.median_days / (2.0 * r.sla_days));
    else
      v_speed := null;
    end if;

    -- Mevcut bileşenler arasında ağırlıkları yeniden normalize et
    v_wsum := v_w[1]
            + case when v_res_rate is null then 0 else v_w[2] end
            + case when v_speed    is null then 0 else v_w[3] end;

    v_sub := 100 * (
        v_w[1] * v_burden
      + coalesce(v_w[2] * v_res_rate, 0)
      + coalesce(v_w[3] * v_speed, 0)
    ) / v_wsum;
    v_sub := greatest(0, least(100, v_sub));

    v_num   := v_num + v_sub * r.weight;
    v_den   := v_den + r.weight;
    v_total := v_total + r.open_count + r.resolved_count + r.unresolved_count;

    v_categories := v_categories || jsonb_build_object(
      'category_id', r.id, 'name', r.name, 'slug', r.slug, 'icon', r.icon, 'color', r.color,
      'available', true,
      'score', round(v_sub, 0),
      'open_count', r.open_count,
      'overdue_count', r.overdue_count,
      'resolved_count', r.resolved_count,
      'unresolved_count', r.unresolved_count,
      'median_resolution_days', case when r.median_days is null then null else round(r.median_days::numeric, 1) end,
      'sla_days', r.sla_days,
      'components', jsonb_build_object(
        'burden',          round(v_burden * 100, 0),
        'resolution_rate', case when v_res_rate is null then null else round(v_res_rate * 100, 0) end,
        'speed',           case when v_speed    is null then null else round(v_speed * 100, 0) end
      )
    );
  end loop;

  if v_den = 0 then
    return jsonb_build_object(
      'available', false, 'reason', 'no_data',
      'neighborhood_id', p_neighborhood_id,
      'categories', v_categories, 'window_days', v_window
    );
  end if;

  return jsonb_build_object(
    'available', true,
    'neighborhood_id', p_neighborhood_id,
    'score', round(v_num / v_den, 0),
    'total_reports', v_total,
    'confidence', case when v_total < 10 then 'low' when v_total < 40 then 'medium' else 'high' end,
    'window_days', v_window,
    'population', v_pop,
    'population_estimated', v_pop_estimated,
    'categories', v_categories,
    'computed_at', now()
  );
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- MIGRATION 0012_notification_fix.sql
-- ══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- AYRA · 0012 · Bildirim dağıtımı düzeltmesi
--
-- Hata: fanout_status_notification() takipçileri seçerken bildirimi
-- filtrelemiyordu; bir sorunun durumu değiştiğinde platformdaki TÜM takipçilere
-- bildirim gidiyordu. Aşağıda takip kaydı doğru bildirime bağlanır, işlemi
-- yapan moderatörün kendisi hariç tutulur ve aynı olay için mükerrer bildirim
-- üretilmesi engellenir.
-- =============================================================================

create or replace function public.fanout_status_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_report record;
  v_title  text;
  v_kind   text;
begin
  select r.id, r.title, r.slug into v_report
  from public.reports r where r.id = new.report_id;

  if v_report.id is null then
    return new;
  end if;

  v_title := case new.to_status
    when 'forwarded'   then 'Desteklediğiniz sorun yetkili kuruma iletildi'
    when 'in_review'   then 'Desteklediğiniz sorun inceleniyor'
    when 'awaiting_resolution' then 'Desteklediğiniz sorun için çözüm bekleniyor'
    when 'resolved'    then 'Desteklediğiniz sorun çözüldü'
    when 'unresolved'  then 'Desteklediğiniz sorun çözülemedi olarak kapatıldı'
    when 'verified'    then 'Desteklediğiniz sorun doğrulandı'
    else null
  end;

  if v_title is null then
    return new;
  end if;

  v_kind := case new.to_status
    when 'resolved' then 'resolved'
    when 'forwarded' then 'authority_submitted'
    else 'status_changed'
  end;

  insert into public.notifications (user_id, report_id, kind, title, body, url)
  select f.user_id, v_report.id, v_kind, v_title, v_report.title, '/sorun/' || v_report.slug
    from public.report_follows f
   where f.report_id = new.report_id           -- ← eksik olan koşul
     and f.user_id is distinct from new.actor_id;

  return new;
end $$;

-- Yanlış dağıtılmış geçmiş bildirimleri temizle: kullanıcının takip etmediği
-- bir sorun için üretilmiş kayıtlar silinir.
delete from public.notifications n
 where n.report_id is not null
   and not exists (
     select 1 from public.report_follows f
      where f.report_id = n.report_id and f.user_id = n.user_id
   );

-- Not: burada mükerrer engelleyici bir benzersiz indeks bilinçli olarak
-- kullanılmadı. Tetikleyici her durum değişiminde bir kez çalışır; indeks
-- ihlali ise durum değişikliği işlemini tümden geri alır — bildirimi
-- tekrarlamak, durumu kaydedememekten iyidir.

-- ══════════════════════════════════════════════════════════════════════════
-- MIGRATION 0013_chain_cascade.sql
-- ══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- AYRA · 0013 · Kanıt zinciri silme davranışı
--
-- Sorun: report_events tablosundaki değiştirilemezlik tetikleyicisi DELETE'i
-- koşulsuz engelliyordu. Bu, bir bildirimin tümden silinmesini de imkânsız
-- kılıyordu — oysa KVKK kapsamında bir kaydın silinmesi talep edilebilir ve
-- yönetim panelinden mükerrer/hatalı kayıtların temizlenmesi gerekebilir.
--
-- Çözüm: Zincir hâlâ değiştirilemez. Tek istisna, bildirimin kendisinin
-- silinmesidir: bu durumda üst kayıt artık mevcut olmadığı için zincir de
-- birlikte gider. Zincirden tek bir halkayı çekip almak hâlâ imkânsızdır.
-- =============================================================================

create or replace function public.block_event_mutation()
returns trigger language plpgsql as $$
begin
  -- Bildirimin kendisi silinirken (ON DELETE CASCADE) üst kayıt artık yoktur;
  -- yalnızca bu durumda zincirin de silinmesine izin verilir.
  if tg_op = 'DELETE'
     and not exists (select 1 from public.reports r where r.id = old.report_id) then
    return old;
  end if;

  raise exception
    'report_events append-only bir tablodur; kayıtlar değiştirilemez ve tek tek silinemez.';
end $$;

comment on function public.block_event_mutation() is
  'Kanıt zincirini korur: UPDATE her zaman, DELETE ise yalnızca üst bildirim silinmediyse engellenir.';

-- ══════════════════════════════════════════════════════════════════════════
-- MIGRATION 0014_search_path.sql
-- ══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- AYRA · 0014 · Uzantı arama yolu sağlamlaştırması
--
-- Supabase, uzantıları `extensions` şemasına kurar; kendi kurduğumuz bir
-- PostgreSQL'de ise `public` şemasına kurulurlar. `unaccent()` çağrısı yapan
-- tetikleyici, hangi ortamda çalıştığından bağımsız olarak fonksiyonu
-- bulabilmelidir — bu yüzden arama yolu fonksiyona açıkça yazılır.
--
-- Ayrıca search_path'in fonksiyon üzerinde sabitlenmesi, oturum ayarıyla
-- oynayarak fonksiyonun davranışını değiştirmeye karşı da koruma sağlar.
-- =============================================================================

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

-- Slugify da aynı nedenle sabitlenir (translate/regexp yerleşiktir ama
-- fonksiyonun davranışı oturum ayarından etkilenmemelidir).
create or replace function public.slugify(src text)
returns text
language sql
immutable
strict
set search_path = pg_catalog, public
as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(
        lower(translate(src, 'ıİğĞüÜşŞöÖçÇÂâÎîÛû', 'iigguussoocCAaIiUu')),
        '[^a-z0-9]+', '-', 'g'
      ),
      '-{2,}', '-', 'g'
    )
  )
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- MIGRATION 0015_moderation_notice.sql
-- ══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- AYRA · 0015 · Moderasyon kararının bildirimi
--
-- Eksik: bir bildirim reddedildiğinde ya da mükerrer sayılıp birleştirildiğinde
-- sahibine hiçbir şey söylenmiyordu. Gerekçe report_status_history.note içine
-- yazılıyor ama kimseye gösterilmiyordu; kişi bir gün bakıp bildiriminin
-- kaybolduğunu görüyordu.
--
-- AYRA kurumlardan kararlarını açıklamasını istiyor; kendi kararını
-- açıklamaması tutarsız olurdu. Aşağıdaki sürüm, takipçilere giden
-- bildirimlere ek olarak, moderasyon kararlarını bildirim sahibine
-- gerekçesiyle iletir.
--
-- Sahibi takipçi listesinde de olabilir; bu yüzden takipçi dağıtımı
-- moderasyon durumlarını kapsamaz (zaten kapsamıyordu) ve mükerrer
-- bildirim oluşmaz.
-- =============================================================================

create or replace function public.fanout_status_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_report record;
  v_title  text;
  v_kind   text;
  v_govde  text;
begin
  select r.id, r.title, r.slug, r.user_id into v_report
  from public.reports r where r.id = new.report_id;

  if v_report.id is null then
    return new;
  end if;

  -- ── Moderasyon kararları: yalnızca bildirimin sahibine ───────────────────
  if new.to_status in ('rejected', 'duplicate') then
    if v_report.user_id is not null then
      v_govde := case
        when new.to_status = 'rejected'
          then coalesce(
            nullif(btrim(new.note), ''),
            'Topluluk kurallarına uymadığı için yayımlanmadı.')
        else coalesce(
            nullif(btrim(new.note), ''),
            'Aynı sorun için daha önce açılmış bir bildirimle birleştirildi.')
      end;

      insert into public.notifications (user_id, report_id, kind, title, body, url)
      values (
        v_report.user_id,
        v_report.id,
        'moderation',
        case new.to_status
          when 'rejected' then 'Bildiriminiz yayımlanmadı'
          else 'Bildiriminiz mükerrer olarak birleştirildi'
        end,
        v_govde,
        '/sorun/' || v_report.slug
      );
    end if;
    return new;
  end if;

  -- ── Diğer durumlar: takipçilere ──────────────────────────────────────────
  v_title := case new.to_status
    when 'forwarded'   then 'Desteklediğiniz sorun yetkili kuruma iletildi'
    when 'in_review'   then 'Desteklediğiniz sorun inceleniyor'
    when 'awaiting_resolution' then 'Desteklediğiniz sorun için çözüm bekleniyor'
    when 'resolved'    then 'Desteklediğiniz sorun çözüldü'
    when 'unresolved'  then 'Desteklediğiniz sorun çözülemedi olarak kapatıldı'
    when 'verified'    then 'Desteklediğiniz sorun doğrulandı'
    else null
  end;

  if v_title is null then
    return new;
  end if;

  v_kind := case new.to_status
    when 'resolved' then 'resolved'
    when 'forwarded' then 'authority_submitted'
    else 'status_changed'
  end;

  insert into public.notifications (user_id, report_id, kind, title, body, url)
  select f.user_id, v_report.id, v_kind, v_title, v_report.title, '/sorun/' || v_report.slug
    from public.report_follows f
   where f.report_id = new.report_id
     and f.user_id is distinct from new.actor_id;

  return new;
end $$;

-- ══════════════════════════════════════════════════════════════════════════
-- SEED 001_geography.sql
-- ══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- AYRA · Seed 001 · Konum hiyerarşisi
-- Kaynak: Torbalı ilçesine bağlı 60 mahalle (resmî mahalle listesi).
-- NOT: Mahalle merkez koordinatları yaklaşıktır ve yönetim panelinden
-- düzeltilebilir. Nüfus alanı bilinçli olarak boş bırakılmıştır; AYRA Skoru
-- nüfus girilene kadar varsayılan değeri kullanır ve bunu arayüzde belirtir.
-- =============================================================================

insert into public.countries (code, name, slug, is_active)
values ('TR', 'Türkiye', 'turkiye', true)
on conflict (code) do update set name = excluded.name;

insert into public.cities (country_id, name, slug, plate_code, center_lat, center_lng, is_active)
select c.id, 'İzmir', 'izmir', 35, 38.4237, 27.1428, true
from public.countries c where c.code = 'TR'
on conflict (country_id, slug) do update
  set center_lat = excluded.center_lat, center_lng = excluded.center_lng, is_active = true;

insert into public.districts (city_id, name, slug, center_lat, center_lng, is_active)
select ct.id, 'Torbalı', 'torbali', 38.1553, 27.3617, true
from public.cities ct join public.countries co on co.id = ct.country_id
where ct.slug = 'izmir' and co.code = 'TR'
on conflict (city_id, slug) do update
  set center_lat = excluded.center_lat, center_lng = excluded.center_lng, is_active = true;

-- Ayrancılar semtini oluşturan beş mahalle (posta kodu 35870).
-- Platform bu beş mahalle ile yayına başlar.
with d as (
  select dd.id from public.districts dd
  join public.cities cc on cc.id = dd.city_id
  where dd.slug = 'torbali' and cc.slug = 'izmir'
)
insert into public.neighborhoods (district_id, name, slug, center_lat, center_lng, is_active)
select d.id, v.name, v.slug, v.lat, v.lng, true
from d, (values
  -- Koordinatlar OpenStreetMap mahalle sınırlarından alındı (Ağustos 2026).
  ('Ayrancılar',    'ayrancilar',    38.24936, 27.27584),
  ('Fevzi Çakmak',  'fevzi-cakmak',  38.24064, 27.28910),
  ('İnönü',         'inonu',         38.23534, 27.27423),
  ('Türkmenköy',    'turkmenkoy',    38.24847, 27.26240),
  ('Bahçelievler',  'bahcelievler',  38.23036, 27.29150)
) as v(name, slug, lat, lng)
on conflict (district_id, slug) do update
  set center_lat = excluded.center_lat, center_lng = excluded.center_lng, is_active = true;

-- Torbalı'nın diğer mahalleleri. Koordinat ve nüfus yönetim panelinden girilir;
-- koordinat girilene kadar bu mahallelere otomatik konum ataması yapılmaz.
with d as (
  select dd.id from public.districts dd
  join public.cities cc on cc.id = dd.city_id
  where dd.slug = 'torbali' and cc.slug = 'izmir'
)
insert into public.neighborhoods (district_id, name, slug, is_active)
select d.id, v.name, public.slugify(v.name), true
from d, (values
  ('19 Mayıs'), ('Ahmetli'), ('Alpkent'), ('Arslanlar'), ('Atalan'), ('Atatürk'),
  ('Bozköy'), ('Bülbüldere'), ('Çakırbeyli'), ('Çamlıca'), ('Çapak'),
  ('Çaybaşı'), ('Cumhuriyet'), ('Dağkızılca'), ('Dağteke'), ('Demirci'), ('Dirmil'),
  ('Düverlik'), ('Eğerci'), ('Ertuğrul'), ('Gazi Mustafa Kemal'), ('Göllüce'), ('Helvacı'),
  ('İstiklal'), ('Kaplancık'), ('Karakızlar'), ('Karakuyu'), ('Karaot'), ('Karşıyaka'),
  ('Kazım Karabekir'), ('Kırbaş'), ('Kuşçuburun'), ('Muratbey'), ('Mustafa Kemal Atatürk'),
  ('Naime'), ('Ormanköy'), ('Ortaköy'), ('Özbey'), ('Pamukyazı'), ('Pancar'), ('Sağlık'),
  ('Saipler'), ('Şehitler'), ('Subaşı'), ('Taşkesik'), ('Tepeköy'), ('Torbalı'), ('Tulum'),
  ('Yazıbaşı'), ('Yedi Eylül'), ('Yemişlik'), ('Yeni'), ('Yeniköy'), ('Yeşilköy'),
  ('Yoğurtçular')
) as v(name)
on conflict (district_id, slug) do nothing;

-- ══════════════════════════════════════════════════════════════════════════
-- SEED 002_categories.sql
-- ══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- AYRA · Seed 002 · Kategoriler
-- weight  : AYRA Skorundaki ağırlık (kamu güvenliğini doğrudan etkileyenler ağır)
-- sla_days: Bu kategoride makul kabul edilen çözüm süresi (sessizlik eşiği)
-- =============================================================================

insert into public.report_categories (name, slug, icon, color, weight, sla_days, sort_order, description) values
  ('Ulaşım',                    'ulasim',            'bus',           '#2563A8', 1.20, 30,  10, 'Toplu ulaşım, duraklar, trafik akışı ve kavşaklar'),
  ('Yol ve Altyapı',            'yol-altyapi',       'road',          '#B4531F', 1.30, 45,  20, 'Çukur, asfalt, kaldırım, kanalizasyon ve yağmur suyu'),
  ('Temizlik',                  'temizlik',          'trash',         '#4B7A3F', 1.00, 7,   30, 'Çöp toplama, konteyner ve çevre kirliliği'),
  ('Aydınlatma',                'aydinlatma',        'lamp',          '#9A7B1F', 1.10, 14,  40, 'Sokak lambaları ve karanlık alanlar'),
  ('Park ve Yeşil Alan',        'park-yesil-alan',   'tree',          '#2F7D5E', 0.80, 30,  50, 'Parklar, oyun alanları, ağaçlandırma ve bakım'),
  ('Güvenlik',                  'guvenlik',          'shield',        '#8E3B46', 1.40, 14,  60, 'Kamusal alanda güvenlik riski oluşturan durumlar'),
  ('Erişilebilirlik',           'erisilebilirlik',   'accessibility', '#5B4B96', 1.20, 45,  70, 'Engelli erişimi, rampa ve kaldırım işgalleri'),
  ('Sağlık',                    'saglik',            'health',        '#A8455E', 1.20, 21,  80, 'Sağlık hizmetlerine erişim ve halk sağlığı riskleri'),
  ('Eğitim',                    'egitim',            'school',        '#35618E', 1.00, 45,  90, 'Okul çevresi, ulaşım ve eğitim altyapısı'),
  ('İnternet ve Telekom',       'internet-telekom',  'wifi',          '#4A6572', 0.70, 21, 100, 'İnternet, telefon ve şebeke altyapısı'),
  ('Sokak Hayvanları',          'sokak-hayvanlari',  'paw',           '#7A5C3E', 0.80, 14, 110, 'Beslenme, barınma, kısırlaştırma ve müdahale ihtiyacı'),
  ('Diğer',                     'diger',             'dots',          '#64748B', 0.60, 30, 120, 'Yukarıdaki başlıklara girmeyen konular')
on conflict (slug) do update set
  name = excluded.name, icon = excluded.icon, color = excluded.color,
  weight = excluded.weight, sla_days = excluded.sla_days,
  sort_order = excluded.sort_order, description = excluded.description;

-- Alt kategoriler
insert into public.report_categories (parent_id, name, slug, icon, color, sla_days, sort_order)
select p.id, v.name, v.slug, p.icon, p.color, p.sla_days, v.ord
from (values
  ('ulasim',          'Toplu Ulaşım',        'toplu-ulasim',        1),
  ('ulasim',          'Durak',               'durak',               2),
  ('ulasim',          'Trafik',              'trafik',              3),
  ('ulasim',          'Kavşak',              'kavsak',              4),
  ('yol-altyapi',     'Yol Çukuru',          'yol-cukuru',          1),
  ('yol-altyapi',     'Asfalt',              'asfalt',              2),
  ('yol-altyapi',     'Kaldırım',            'kaldirim',            3),
  ('yol-altyapi',     'Kanalizasyon',        'kanalizasyon',        4),
  ('yol-altyapi',     'Yağmur Suyu',         'yagmur-suyu',         5),
  ('yol-altyapi',     'Su Arızası',          'su-arizasi',          6),
  ('temizlik',        'Çöp',                 'cop',                 1),
  ('temizlik',        'Konteyner',           'konteyner',           2),
  ('temizlik',        'Çevre Kirliliği',     'cevre-kirliligi',     3),
  ('aydinlatma',      'Sokak Lambası',       'sokak-lambasi',       1),
  ('aydinlatma',      'Karanlık Alan',       'karanlik-alan',       2),
  ('park-yesil-alan', 'Park ve Oyun Alanı',  'park-oyun-alani',     1),
  ('park-yesil-alan', 'Ağaç ve Bakım',       'agac-bakim',          2),
  ('erisilebilirlik', 'Rampa',               'rampa',               1),
  ('erisilebilirlik', 'Kaldırım İşgali',     'kaldirim-isgali',     2),
  ('sokak-hayvanlari','Besleme ve Barınma',  'besleme-barinma',     1),
  ('sokak-hayvanlari','Acil Müdahale',       'acil-mudahale',       2)
) as v(parent_slug, name, slug, ord)
join public.report_categories p on p.slug = v.parent_slug
on conflict (slug) do nothing;

-- ══════════════════════════════════════════════════════════════════════════
-- SEED 003_authorities.sql
-- ══════════════════════════════════════════════════════════════════════════

-- =============================================================================
-- AYRA · Seed 003 · Yetkili kurumlar ve kategori eşlemesi
-- İletişim bilgileri yönetim panelinden güncellenir.
-- =============================================================================

with ct as (select id from public.cities where slug = 'izmir'),
     d  as (select dd.id from public.districts dd join public.cities cc on cc.id = dd.city_id
            where dd.slug = 'torbali' and cc.slug = 'izmir')
insert into public.authorities (name, slug, short_name, kind, city_id, district_id, website, response_sla_days)
select v.name, v.slug, v.short_name, v.kind,
       (select id from ct),
       case when v.district_scoped then (select id from d) else null end,
       v.website, v.sla
from (values
  ('İzmir Büyükşehir Belediyesi',        'izmir-buyuksehir-belediyesi', 'İzBB',       'municipality', false, 'https://www.izmir.bel.tr', 30),
  ('Torbalı Belediyesi',                  'torbali-belediyesi',          'Torbalı Bel.','municipality', true,  'https://www.torbali.bel.tr', 30),
  ('ESHOT Genel Müdürlüğü',               'eshot',                       'ESHOT',      'transport',    false, 'https://www.eshot.gov.tr', 21),
  ('İZSU Genel Müdürlüğü',                'izsu',                        'İZSU',       'utility',      false, 'https://www.izsu.gov.tr', 21),
  ('GDZ Elektrik Dağıtım A.Ş.',           'gdz-elektrik',                'GDZ',        'utility',      false, 'https://www.gdzelektrik.com.tr', 14),
  ('Türk Telekom',                        'turk-telekom',                'Türk Telekom','utility',     false, 'https://www.turktelekom.com.tr', 21),
  ('Karayolları 2. Bölge Müdürlüğü',      'kgm-2-bolge',                 'KGM 2. Bölge','other',       false, 'https://www.kgm.gov.tr', 45),
  ('Torbalı Kaymakamlığı',                'torbali-kaymakamligi',        'Kaymakamlık','governorate',  true,  null, 30),
  ('İzmir Valiliği',                      'izmir-valiligi',              'Valilik',    'governorate',  false, 'http://www.izmir.gov.tr', 30),
  ('Torbalı İlçe Emniyet Müdürlüğü',      'torbali-emniyet',             'İlçe Emniyet','police',      true,  null, 14),
  ('İzmir İl Sağlık Müdürlüğü',           'izmir-il-saglik',             'İl Sağlık',  'ministry',     false, null, 21),
  ('İzmir İl Millî Eğitim Müdürlüğü',     'izmir-il-mem',                'İl MEM',     'ministry',     false, null, 45)
) as v(name, slug, short_name, kind, district_scoped, website, sla)
on conflict (slug) do update set
  name = excluded.name, short_name = excluded.short_name,
  website = excluded.website, response_sla_days = excluded.response_sla_days;

-- Kategori → birincil yetkili kurum
insert into public.category_authorities (category_id, authority_id, district_id, is_primary)
select c.id, a.id,
       (select dd.id from public.districts dd join public.cities cc on cc.id = dd.city_id
        where dd.slug = 'torbali' and cc.slug = 'izmir'),
       v.is_primary
from (values
  ('ulasim',            'eshot',                        true),
  ('ulasim',            'izmir-buyuksehir-belediyesi',  false),
  ('yol-altyapi',       'torbali-belediyesi',           true),
  ('yol-altyapi',       'izsu',                         false),
  ('yol-altyapi',       'izmir-buyuksehir-belediyesi',  false),
  ('temizlik',          'torbali-belediyesi',           true),
  ('aydinlatma',        'gdz-elektrik',                 true),
  ('aydinlatma',        'torbali-belediyesi',           false),
  ('park-yesil-alan',   'torbali-belediyesi',           true),
  ('guvenlik',          'torbali-emniyet',              true),
  ('erisilebilirlik',   'torbali-belediyesi',           true),
  ('saglik',            'izmir-il-saglik',              true),
  ('egitim',            'izmir-il-mem',                 true),
  ('internet-telekom',  'turk-telekom',                 true),
  ('sokak-hayvanlari',  'torbali-belediyesi',           true),
  ('diger',             'torbali-belediyesi',           true)
) as v(category_slug, authority_slug, is_primary)
join public.report_categories c on c.slug = v.category_slug
join public.authorities a on a.slug = v.authority_slug
on conflict do nothing;

-- ══════════════════════════════════════════════════════════════════════════
-- MIGRATION DEFTERİ — bunlar uygulandı olarak işaretlenir
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists public.schema_migrations (
  filename text primary key,
  applied_at timestamptz not null default now()
);

insert into public.schema_migrations (filename) values
  ('0001_bootstrap.sql'),
  ('0002_geography.sql'),
  ('0003_identity.sql'),
  ('0004_categories.sql'),
  ('0005_reports.sql'),
  ('0006_lifecycle.sql'),
  ('0007_notifications_moderation.sql'),
  ('0008_views_and_rpc.sql'),
  ('0009_ayra_score.sql'),
  ('0010_rls.sql'),
  ('0011_score_refinement.sql'),
  ('0012_notification_fix.sql'),
  ('0013_chain_cascade.sql'),
  ('0014_search_path.sql'),
  ('0015_moderation_notice.sql')
on conflict (filename) do nothing;

-- ══════════════════════════════════════════════════════════════════════════
-- KURULUM TAMAMLANDI
-- ══════════════════════════════════════════════════════════════════════════

do $$
declare
  v_nbhd int;
  v_cat  int;
  v_auth int;
begin
  select count(*) into v_nbhd from public.neighborhoods;
  select count(*) into v_cat  from public.report_categories;
  select count(*) into v_auth from public.authorities;
  raise notice 'AYRA kurulumu tamam: % mahalle, % kategori, % kurum.', v_nbhd, v_cat, v_auth;
end $$;

select
  (select count(*) from public.neighborhoods)     as mahalle,
  (select count(*) from public.report_categories) as kategori,
  (select count(*) from public.authorities)       as kurum,
  (select count(*) from public.schema_migrations) as migration;
