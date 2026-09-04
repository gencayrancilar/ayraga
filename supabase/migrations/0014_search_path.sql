-- =============================================================================
-- AYRA · 0014 · Uzantı arama yolu sağlamlaştırması
--
-- Supabase, uzantıları `extensions` şemasına kurar; kendi kurduğumuz bir
-- PostgreSQL'de ise `public` şemasına kurulurlar. `unaccent()` çağrısı yapan
-- tetikleyici, hangi ortamda çalıştığından bağımsız olarak fonksiyonu
-- bulabilmelidir — bu yüzden arama yolu fonksiyona açıkça yazılır.
--
-- Ayrıca search_path'in fonksiyon üzerinde sabitlenmesi, oturum ayarıyla
-- oynayarak fonksiyonun davranışını değiştirmeye karşı da koruma sağlar.
-- =============================================================================

create or replace function public.reports_before_write()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
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

-- Slugify da aynı nedenle sabitlenir (translate/regexp yerleşiktir ama
-- fonksiyonun davranışı oturum ayarından etkilenmemelidir).
create or replace function public.slugify(src text)
returns text
language sql
immutable
strict
set search_path = pg_catalog, public
as $$
  select trim(both '-' from
    regexp_replace(
      regexp_replace(
        lower(translate(src, 'ıİğĞüÜşŞöÖçÇÂâÎîÛû', 'iigguussoocCAaIiUu')),
        '[^a-z0-9]+', '-', 'g'
      ),
      '-{2,}', '-', 'g'
    )
  )
$$;
