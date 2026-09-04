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
