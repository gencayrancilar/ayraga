-- =============================================================================
-- AYRA · 0025 · Kurum yönlendirmesi
--
-- Bildirimin hangi kuruma gideceği bugüne kadar yalnızca kategorisinden
-- hesaplanıyordu: kurum_bul(). Kategorinin kendi eşlemesi yoksa üst
-- kategoriye düşüyor, o da çoğu durumda belediye olduğu için elektrik
-- kesintisi de, telekom arızası da belediyeye gidiyordu. Yanlış kuruma
-- gönderilen yazı, cevapsız kalmakla kalmaz; platformun ciddiyetini de
-- aşındırır.
--
-- İki kapı açılıyor:
--   1. Tek bildirim için elle atama (report_authority_overrides) — istisnalar
--      ve yanlış kategori seçilmiş bildirimler için.
--   2. Kategori eşlemesini panelden düzeltmek — kalıcı çözüm; bir kez
--      düzeltilince o kategorinin bütün gelecek bildirimleri doğru gider.
-- =============================================================================

create table if not exists public.report_authority_overrides (
  report_id    uuid primary key references public.reports(id) on delete cascade,
  authority_id uuid not null references public.authorities(id) on delete cascade,
  note         text,
  decided_by   uuid references public.profiles(id) on delete set null,
  decided_at   timestamptz not null default now()
);

create index if not exists idx_report_overrides_authority
  on public.report_authority_overrides(authority_id);

alter table public.report_authority_overrides enable row level security;

drop policy if exists overrides_read on public.report_authority_overrides;
create policy overrides_read on public.report_authority_overrides
  for select to authenticated using (public.is_moderator());

drop policy if exists overrides_write on public.report_authority_overrides;
create policy overrides_write on public.report_authority_overrides
  for all to authenticated using (public.is_moderator()) with check (public.is_moderator());

grant select, insert, update, delete on public.report_authority_overrides to authenticated;

/** Bildirimin gerçek muhatabı: elle atama varsa o, yoksa kategoriden hesaplanan. */
create or replace function public.bildirim_kurumu(p_report uuid)
returns uuid language sql stable set search_path = public as $$
  select coalesce(
    (select o.authority_id from public.report_authority_overrides o where o.report_id = p_report),
    (select public.kurum_bul(r.category_id) from public.reports r where r.id = p_report)
  )
$$;

grant execute on function public.bildirim_kurumu(uuid) to authenticated;

-- Aday listesi artık elle atamayı da hesaba katıyor ve bildirimin nereden
-- geldiğini (kategori eşlemesi mi, elle atama mı) ekrana taşıyor.
drop function if exists public.kuruma_adaylar(uuid);
create function public.kuruma_adaylar(p_authority uuid)
returns table (
  report_id uuid, ref_code text, slug text, title text, address text,
  latitude double precision, longitude double precision,
  category text, category_id uuid, neighborhood text, support_count integer,
  urgency public.report_urgency, created_at timestamptz,
  decision text, decision_note text, decided_at timestamptz,
  elle_atandi boolean, atama_notu text
)
language sql stable set search_path = public as $$
  select r.id, r.ref_code, r.slug, r.title, r.address, r.latitude, r.longitude,
         c.name, c.id, coalesce(n.name, '—'), r.support_count, r.urgency, r.created_at,
         d.decision, d.note, d.decided_at,
         o.report_id is not null, o.note
    from public.reports r
    join public.report_categories c on c.id = r.category_id
    left join public.neighborhoods n on n.id = r.neighborhood_id
    left join public.report_authority_overrides o on o.report_id = r.id
    left join public.dispatch_decisions d
           on d.report_id = r.id and d.authority_id = p_authority
   where not r.is_hidden
     and r.status in ('new', 'verified')
     and coalesce(o.authority_id, public.kurum_bul(r.category_id)) = p_authority
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

/**
 * Yönlendirme tablosu: her kategori hangi kuruma gidiyor ve bu eşleme
 * kategorinin kendisinde mi tanımlı, yoksa üst kategoriden mi devralınmış.
 *
 * Devralınmış satırlar, yanlış yönlendirmenin en sık kaynağıdır: alt kategori
 * kendi kurumunu tanımlamadığında üstünkine düşer.
 */
create or replace function public.kategori_yonlendirme()
returns table (
  category_id uuid, category_name text, category_slug text, parent_name text,
  authority_id uuid, authority_name text, dogrudan boolean, acik_bildirim integer
)
language sql stable set search_path = public as $$
  select c.id, c.name, c.slug, p.name,
         public.kurum_bul(c.id),
         (select a.name from public.authorities a where a.id = public.kurum_bul(c.id)),
         exists (select 1 from public.category_authorities ca
                  where ca.category_id = c.id and ca.is_primary),
         (select count(*)::int from public.reports r
           where r.category_id = c.id and not r.is_hidden
             and r.status in ('new', 'verified'))
    from public.report_categories c
    left join public.report_categories p on p.id = c.parent_id
   where c.is_active
   order by coalesce(p.sort_order, c.sort_order), coalesce(p.name, c.name), c.parent_id nulls first, c.sort_order, c.name
$$;

grant execute on function public.kategori_yonlendirme() to authenticated;

/** Bir kategorinin birincil kurumunu değiştirir. Eski birincil yedeğe düşer. */
create or replace function public.kategori_kurumu_ata(p_category uuid, p_authority uuid)
returns void language plpgsql set search_path = public as $$
begin
  update public.category_authorities set is_primary = false
   where category_id = p_category and is_primary;

  update public.category_authorities set is_primary = true
   where category_id = p_category and authority_id = p_authority;

  if not found then
    insert into public.category_authorities (category_id, authority_id, is_primary)
    values (p_category, p_authority, true);
  end if;
end;
$$;

grant execute on function public.kategori_kurumu_ata(uuid, uuid) to authenticated;

-- Özet, elle atamalar yüzünden değişen dağılımı da göstersin.
create or replace function public.gonderim_ozeti()
returns table (
  authority_id uuid, authority_name text, contact_email text,
  bekleyen integer, onayli integer, haric integer
)
language sql stable set search_path = public as $$
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
