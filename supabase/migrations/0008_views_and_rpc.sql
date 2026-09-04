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
