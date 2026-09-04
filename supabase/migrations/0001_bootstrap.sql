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
