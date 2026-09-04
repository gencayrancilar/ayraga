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
