-- =============================================================================
-- AYRA · Seed 001 · Konum hiyerarşisi
-- Kaynak: Torbalı ilçesine bağlı 60 mahalle (resmî mahalle listesi).
-- NOT: Mahalle merkez koordinatları yaklaşıktır ve yönetim panelinden
-- düzeltilebilir. Nüfus alanı bilinçli olarak boş bırakılmıştır; AYRA Skoru
-- nüfus girilene kadar varsayılan değeri kullanır ve bunu arayüzde belirtir.
-- =============================================================================

insert into public.countries (code, name, slug, is_active)
values ('TR', 'Türkiye', 'turkiye', true)
on conflict (code) do update set name = excluded.name;

insert into public.cities (country_id, name, slug, plate_code, center_lat, center_lng, is_active)
select c.id, 'İzmir', 'izmir', 35, 38.4237, 27.1428, true
from public.countries c where c.code = 'TR'
on conflict (country_id, slug) do update
  set center_lat = excluded.center_lat, center_lng = excluded.center_lng, is_active = true;

insert into public.districts (city_id, name, slug, center_lat, center_lng, is_active)
select ct.id, 'Torbalı', 'torbali', 38.1553, 27.3617, true
from public.cities ct join public.countries co on co.id = ct.country_id
where ct.slug = 'izmir' and co.code = 'TR'
on conflict (city_id, slug) do update
  set center_lat = excluded.center_lat, center_lng = excluded.center_lng, is_active = true;

-- Ayrancılar semtini oluşturan beş mahalle (posta kodu 35870).
-- Platform bu beş mahalle ile yayına başlar.
with d as (
  select dd.id from public.districts dd
  join public.cities cc on cc.id = dd.city_id
  where dd.slug = 'torbali' and cc.slug = 'izmir'
)
insert into public.neighborhoods (district_id, name, slug, center_lat, center_lng, is_active)
select d.id, v.name, v.slug, v.lat, v.lng, true
from d, (values
  -- Koordinatlar OpenStreetMap mahalle sınırlarından alındı (Ağustos 2026).
  ('Ayrancılar',    'ayrancilar',    38.24936, 27.27584),
  ('Fevzi Çakmak',  'fevzi-cakmak',  38.24064, 27.28910),
  ('İnönü',         'inonu',         38.23534, 27.27423),
  ('Türkmenköy',    'turkmenkoy',    38.24847, 27.26240),
  ('Bahçelievler',  'bahcelievler',  38.23036, 27.29150)
) as v(name, slug, lat, lng)
on conflict (district_id, slug) do update
  set center_lat = excluded.center_lat, center_lng = excluded.center_lng, is_active = true;

-- Torbalı'nın diğer mahalleleri. Koordinat ve nüfus yönetim panelinden girilir;
-- koordinat girilene kadar bu mahallelere otomatik konum ataması yapılmaz.
with d as (
  select dd.id from public.districts dd
  join public.cities cc on cc.id = dd.city_id
  where dd.slug = 'torbali' and cc.slug = 'izmir'
)
insert into public.neighborhoods (district_id, name, slug, is_active)
select d.id, v.name, public.slugify(v.name), true
from d, (values
  ('19 Mayıs'), ('Ahmetli'), ('Alpkent'), ('Arslanlar'), ('Atalan'), ('Atatürk'),
  ('Bozköy'), ('Bülbüldere'), ('Çakırbeyli'), ('Çamlıca'), ('Çapak'),
  ('Çaybaşı'), ('Cumhuriyet'), ('Dağkızılca'), ('Dağteke'), ('Demirci'), ('Dirmil'),
  ('Düverlik'), ('Eğerci'), ('Ertuğrul'), ('Gazi Mustafa Kemal'), ('Göllüce'), ('Helvacı'),
  ('İstiklal'), ('Kaplancık'), ('Karakızlar'), ('Karakuyu'), ('Karaot'), ('Karşıyaka'),
  ('Kazım Karabekir'), ('Kırbaş'), ('Kuşçuburun'), ('Muratbey'), ('Mustafa Kemal Atatürk'),
  ('Naime'), ('Ormanköy'), ('Ortaköy'), ('Özbey'), ('Pamukyazı'), ('Pancar'), ('Sağlık'),
  ('Saipler'), ('Şehitler'), ('Subaşı'), ('Taşkesik'), ('Tepeköy'), ('Torbalı'), ('Tulum'),
  ('Yazıbaşı'), ('Yedi Eylül'), ('Yemişlik'), ('Yeni'), ('Yeniköy'), ('Yeşilköy'),
  ('Yoğurtçular')
) as v(name)
on conflict (district_id, slug) do nothing;
