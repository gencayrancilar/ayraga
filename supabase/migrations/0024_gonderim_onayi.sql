-- =============================================================================
-- AYRA · 0024 · Kuruma gönderim onayı
--
-- Buraya kadar haftalık liste kendiliğinden gidiyordu: kuruma düşen her açık
-- bildirim sıraya giriyor, pazartesi postalanıyordu. Kuruma resmî bir yazı
-- göndermek geri alınamayan bir iştir; ne gönderildiğine bir insanın karar
-- vermesi gerekir. Bu göç, araya o kararı koyar.
--
-- Her (bildirim, kurum) çifti için üç hâl vardır:
--   karar yok  — aday listesinde bekler, gönderilmez
--   approved   — ilk haftalık gönderimde yola çıkar
--   excluded   — bir daha o kuruma önerilmez (sebebiyle birlikte)
--
-- Karar kaydı kalıcıdır: "bunu neden göndermedik" sorusunun cevabı durur.
-- =============================================================================

create table if not exists public.dispatch_decisions (
  report_id    uuid not null references public.reports(id) on delete cascade,
  authority_id uuid not null references public.authorities(id) on delete cascade,
  decision     text not null check (decision in ('approved', 'excluded')),
  note         text,
  decided_by   uuid references public.profiles(id) on delete set null,
  decided_at   timestamptz not null default now(),
  primary key (report_id, authority_id)
);

create index if not exists idx_dispatch_decisions_authority
  on public.dispatch_decisions(authority_id, decision);

alter table public.dispatch_decisions enable row level security;

drop policy if exists dispatch_decisions_read on public.dispatch_decisions;
create policy dispatch_decisions_read on public.dispatch_decisions
  for select to authenticated using (public.is_moderator());

drop policy if exists dispatch_decisions_write on public.dispatch_decisions;
create policy dispatch_decisions_write on public.dispatch_decisions
  for all to authenticated using (public.is_moderator()) with check (public.is_moderator());

grant select, insert, update, delete on public.dispatch_decisions to authenticated;

/**
 * Bir kuruma gönderilmeyi bekleyen adaylar — kararı verilmiş olsun olmasın.
 *
 * Yönetim ekranı bunu gösterir. Daha önce o kuruma iletilmiş bildirimler
 * listede yer almaz; kapanmış bildirimler de öyle.
 */
create or replace function public.kuruma_adaylar(p_authority uuid)
returns table (
  report_id uuid, ref_code text, slug text, title text, address text,
  latitude double precision, longitude double precision,
  category text, neighborhood text, support_count integer,
  urgency public.report_urgency, created_at timestamptz,
  decision text, decision_note text, decided_at timestamptz
)
language sql stable set search_path = public as $$
  select r.id, r.ref_code, r.slug, r.title, r.address, r.latitude, r.longitude,
         c.name, coalesce(n.name, '—'), r.support_count, r.urgency, r.created_at,
         d.decision, d.note, d.decided_at
    from public.reports r
    join public.report_categories c on c.id = r.category_id
    left join public.neighborhoods n on n.id = r.neighborhood_id
    left join public.dispatch_decisions d
           on d.report_id = r.id and d.authority_id = p_authority
   where not r.is_hidden
     and r.status in ('new', 'verified')
     and public.kurum_bul(r.category_id) = p_authority
     and not exists (
       select 1 from public.authority_submissions s
        where s.report_id = r.id and s.authority_id = p_authority
     )
   order by case when d.decision = 'approved' then 0
                 when d.decision is null then 1 else 2 end,
            case r.urgency when 'acil' then 1 when 'hizli' then 2 else 3 end,
            r.support_count desc, r.created_at
$$;

grant execute on function public.kuruma_adaylar(uuid) to authenticated;

/**
 * Gönderime hazır olanlar: yalnızca bir moderatörün onayladıkları.
 *
 * kuruma_bekleyenler() artık doğrudan kullanılmıyor; haftalık gönderim bunu
 * okur. Onay yoksa hiçbir şey gitmez — sessiz kalmak, istenmeyen bir yazı
 * göndermekten iyidir.
 */
create or replace function public.kuruma_onaylilar(p_authority uuid)
returns table (
  report_id uuid, ref_code text, slug text, title text, address text,
  latitude double precision, longitude double precision,
  category text, neighborhood text, support_count integer,
  urgency public.report_urgency, created_at timestamptz
)
language sql stable set search_path = public as $$
  select a.report_id, a.ref_code, a.slug, a.title, a.address, a.latitude, a.longitude,
         a.category, a.neighborhood, a.support_count, a.urgency, a.created_at
    from public.kuruma_adaylar(p_authority) a
   where a.decision = 'approved'
$$;

grant execute on function public.kuruma_onaylilar(uuid) to authenticated;

/** Yönetim ekranının üst şeridi: kurum başına aday / onaylı / hariç sayıları. */
create or replace function public.gonderim_ozeti()
returns table (
  authority_id uuid, authority_name text, contact_email text,
  bekleyen integer, onayli integer, haric integer
)
language sql stable set search_path = public as $$
  -- left join lateral, adayı olmayan kuruma tek bir boş satır üretir; o satır
  -- "kararı yok" gibi görünüp sayıyı 1 yapardı. k.report_id ile eleniyor.
  select a.id, a.name, a.contact_email,
         count(*) filter (where k.report_id is not null and k.decision is null)::int,
         count(*) filter (where k.decision = 'approved')::int,
         count(*) filter (where k.decision = 'excluded')::int
    from public.authorities a
    left join lateral public.kuruma_adaylar(a.id) k on true
   where a.is_active
   group by a.id, a.name, a.contact_email
   order by a.name
$$;

grant execute on function public.gonderim_ozeti() to authenticated;
