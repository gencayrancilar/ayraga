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
