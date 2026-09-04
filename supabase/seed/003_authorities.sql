-- =============================================================================
-- AYRA · Seed 003 · Yetkili kurumlar ve kategori eşlemesi
-- İletişim bilgileri yönetim panelinden güncellenir.
-- =============================================================================

with ct as (select id from public.cities where slug = 'izmir'),
     d  as (select dd.id from public.districts dd join public.cities cc on cc.id = dd.city_id
            where dd.slug = 'torbali' and cc.slug = 'izmir')
insert into public.authorities (name, slug, short_name, kind, city_id, district_id, website, response_sla_days)
select v.name, v.slug, v.short_name, v.kind,
       (select id from ct),
       case when v.district_scoped then (select id from d) else null end,
       v.website, v.sla
from (values
  ('İzmir Büyükşehir Belediyesi',        'izmir-buyuksehir-belediyesi', 'İzBB',       'municipality', false, 'https://www.izmir.bel.tr', 30),
  ('Torbalı Belediyesi',                  'torbali-belediyesi',          'Torbalı Bel.','municipality', true,  'https://www.torbali.bel.tr', 30),
  ('ESHOT Genel Müdürlüğü',               'eshot',                       'ESHOT',      'transport',    false, 'https://www.eshot.gov.tr', 21),
  ('İZSU Genel Müdürlüğü',                'izsu',                        'İZSU',       'utility',      false, 'https://www.izsu.gov.tr', 21),
  ('GDZ Elektrik Dağıtım A.Ş.',           'gdz-elektrik',                'GDZ',        'utility',      false, 'https://www.gdzelektrik.com.tr', 14),
  ('Türk Telekom',                        'turk-telekom',                'Türk Telekom','utility',     false, 'https://www.turktelekom.com.tr', 21),
  ('Karayolları 2. Bölge Müdürlüğü',      'kgm-2-bolge',                 'KGM 2. Bölge','other',       false, 'https://www.kgm.gov.tr', 45),
  ('Torbalı Kaymakamlığı',                'torbali-kaymakamligi',        'Kaymakamlık','governorate',  true,  null, 30),
  ('İzmir Valiliği',                      'izmir-valiligi',              'Valilik',    'governorate',  false, 'http://www.izmir.gov.tr', 30),
  ('Torbalı İlçe Emniyet Müdürlüğü',      'torbali-emniyet',             'İlçe Emniyet','police',      true,  null, 14),
  ('İzmir İl Sağlık Müdürlüğü',           'izmir-il-saglik',             'İl Sağlık',  'ministry',     false, null, 21),
  ('İzmir İl Millî Eğitim Müdürlüğü',     'izmir-il-mem',                'İl MEM',     'ministry',     false, null, 45)
) as v(name, slug, short_name, kind, district_scoped, website, sla)
on conflict (slug) do update set
  name = excluded.name, short_name = excluded.short_name,
  website = excluded.website, response_sla_days = excluded.response_sla_days;

-- Kategori → birincil yetkili kurum
insert into public.category_authorities (category_id, authority_id, district_id, is_primary)
select c.id, a.id,
       (select dd.id from public.districts dd join public.cities cc on cc.id = dd.city_id
        where dd.slug = 'torbali' and cc.slug = 'izmir'),
       v.is_primary
from (values
  ('ulasim',            'eshot',                        true),
  ('ulasim',            'izmir-buyuksehir-belediyesi',  false),
  ('yol-altyapi',       'torbali-belediyesi',           true),
  ('yol-altyapi',       'izsu',                         false),
  ('yol-altyapi',       'izmir-buyuksehir-belediyesi',  false),
  ('temizlik',          'torbali-belediyesi',           true),
  ('aydinlatma',        'gdz-elektrik',                 true),
  ('aydinlatma',        'torbali-belediyesi',           false),
  ('park-yesil-alan',   'torbali-belediyesi',           true),
  ('guvenlik',          'torbali-emniyet',              true),
  ('erisilebilirlik',   'torbali-belediyesi',           true),
  ('saglik',            'izmir-il-saglik',              true),
  ('egitim',            'izmir-il-mem',                 true),
  ('internet-telekom',  'turk-telekom',                 true),
  ('sokak-hayvanlari',  'torbali-belediyesi',           true),
  ('diger',             'torbali-belediyesi',           true)
) as v(category_slug, authority_slug, is_primary)
join public.report_categories c on c.slug = v.category_slug
join public.authorities a on a.slug = v.authority_slug
on conflict do nothing;

-- =============================================================================
-- Kategori → kurum istisnaları
--
-- Alt kategorilerin çoğu üst kategorisiyle aynı kuruma gider; kurum_bul()
-- bulamadığında üst kategoriye düşer. Burada yalnızca bu kuralın yanlış
-- sonuç verdiği durumlar tanımlanır:
--   · su, kanalizasyon ve yağmur suyu belediyenin değil İZSU'nundur,
--   · trafik ve kavşak düzenlemesi ilçede belediyenindir (üst kategori ESHOT).
-- =============================================================================
insert into public.category_authorities (category_id, authority_id, is_primary)
select c.id, a.id, true
  from (values
    ('su-arizasi',   'izsu'),
    ('kanalizasyon', 'izsu'),
    ('yagmur-suyu',  'izsu'),
    ('trafik',       'torbali-belediyesi'),
    ('kavsak',       'torbali-belediyesi')
  ) as v(kategori, kurum)
  join public.report_categories c on c.slug = v.kategori
  join public.authorities a on a.slug = v.kurum
on conflict do nothing;
