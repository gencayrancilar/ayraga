-- =============================================================================
-- AYRA · 0021 · Kuruma gönderim kaydı
--
-- Gönderilen her e-posta buraya yazılır: kime, ne zaman, hangi bildirim için,
-- başarılı mı. Şeffaflık iddiası olan bir platformda "biz bunu şu tarihte şu
-- kuruma ilettik" cümlesinin arkasında bir kayıt durmalı; ayrıca gönderim
-- başarısız olduğunda bunu görebilmek gerekir.
--
-- Tablo yalnızca moderasyona açıktır: kurum e-posta adresleri ve gönderim
-- ayrıntıları kamusal veri değildir.
-- =============================================================================

create table if not exists public.outbound_messages (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null check (kind in ('acil', 'haftalik', 'test')),
  authority_id uuid references public.authorities(id) on delete set null,
  report_id    uuid references public.reports(id) on delete set null,
  recipients   text[] not null default '{}',
  subject      text not null,
  body         text not null,
  status       text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  provider_id  text,
  error        text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);

create index if not exists idx_outbound_created on public.outbound_messages(created_at desc);
create index if not exists idx_outbound_authority on public.outbound_messages(authority_id, created_at desc);
create index if not exists idx_outbound_report on public.outbound_messages(report_id);

alter table public.outbound_messages enable row level security;

drop policy if exists outbound_read on public.outbound_messages;
create policy outbound_read on public.outbound_messages
  for select to authenticated using (public.is_moderator());

drop policy if exists outbound_write on public.outbound_messages;
create policy outbound_write on public.outbound_messages
  for all to authenticated using (public.is_moderator()) with check (public.is_moderator());

grant select, insert, update on public.outbound_messages to authenticated;

/**
 * Bir kuruma haftalık raporda hangi bildirimlerin gideceği.
 *
 * Daha önce aynı bildirim aynı kuruma iletilmişse tekrar gönderilmez:
 * authority_submissions kaydı, "bu kuruma bu sorunu ilettik" demektir.
 */
create or replace function public.kuruma_bekleyenler(p_authority uuid)
returns table (
  report_id uuid, ref_code text, slug text, title text, address text,
  latitude double precision, longitude double precision,
  category text, neighborhood text, support_count integer,
  urgency public.report_urgency, created_at timestamptz
)
language sql stable set search_path = public as $$
  select r.id, r.ref_code, r.slug, r.title, r.address, r.latitude, r.longitude,
         c.name, coalesce(n.name, '—'), r.support_count, r.urgency, r.created_at
    from public.reports r
    join public.report_categories c on c.id = r.category_id
    left join public.neighborhoods n on n.id = r.neighborhood_id
   where not r.is_hidden
     and r.status in ('new', 'verified')
     and public.kurum_bul(r.category_id) = p_authority
     and not exists (
       select 1 from public.authority_submissions s
        where s.report_id = r.id and s.authority_id = p_authority
     )
   order by case r.urgency when 'acil' then 1 when 'hizli' then 2 else 3 end,
            r.support_count desc, r.created_at
$$;

grant execute on function public.kuruma_bekleyenler(uuid) to authenticated;
