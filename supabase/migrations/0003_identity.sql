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
