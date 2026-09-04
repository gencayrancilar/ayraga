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
