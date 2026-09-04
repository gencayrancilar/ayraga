-- =============================================================================
-- AYRA · Seed 002 · Kategoriler
-- weight  : AYRA Skorundaki ağırlık (kamu güvenliğini doğrudan etkileyenler ağır)
-- sla_days: Bu kategoride makul kabul edilen çözüm süresi (sessizlik eşiği)
-- =============================================================================

insert into public.report_categories (name, slug, icon, color, weight, sla_days, sort_order, description) values
  ('Ulaşım',                    'ulasim',            'bus',           '#2563A8', 1.20, 30,  10, 'Toplu ulaşım, duraklar, trafik akışı ve kavşaklar'),
  ('Yol ve Altyapı',            'yol-altyapi',       'road',          '#B4531F', 1.30, 45,  20, 'Çukur, asfalt, kaldırım, kanalizasyon ve yağmur suyu'),
  ('Temizlik',                  'temizlik',          'trash',         '#4B7A3F', 1.00, 7,   30, 'Çöp toplama, konteyner ve çevre kirliliği'),
  ('Aydınlatma',                'aydinlatma',        'lamp',          '#9A7B1F', 1.10, 14,  40, 'Sokak lambaları ve karanlık alanlar'),
  ('Park ve Yeşil Alan',        'park-yesil-alan',   'tree',          '#2F7D5E', 0.80, 30,  50, 'Parklar, oyun alanları, ağaçlandırma ve bakım'),
  ('Güvenlik',                  'guvenlik',          'shield',        '#8E3B46', 1.40, 14,  60, 'Kamusal alanda güvenlik riski oluşturan durumlar'),
  ('Erişilebilirlik',           'erisilebilirlik',   'accessibility', '#5B4B96', 1.20, 45,  70, 'Engelli erişimi, rampa ve kaldırım işgalleri'),
  ('Sağlık',                    'saglik',            'health',        '#A8455E', 1.20, 21,  80, 'Sağlık hizmetlerine erişim ve halk sağlığı riskleri'),
  ('Eğitim',                    'egitim',            'school',        '#35618E', 1.00, 45,  90, 'Okul çevresi, ulaşım ve eğitim altyapısı'),
  ('İnternet ve Telekom',       'internet-telekom',  'wifi',          '#4A6572', 0.70, 21, 100, 'İnternet, telefon ve şebeke altyapısı'),
  ('Sokak Hayvanları',          'sokak-hayvanlari',  'paw',           '#7A5C3E', 0.80, 14, 110, 'Beslenme, barınma, kısırlaştırma ve müdahale ihtiyacı'),
  ('Diğer',                     'diger',             'dots',          '#64748B', 0.60, 30, 120, 'Yukarıdaki başlıklara girmeyen konular')
on conflict (slug) do update set
  name = excluded.name, icon = excluded.icon, color = excluded.color,
  weight = excluded.weight, sla_days = excluded.sla_days,
  sort_order = excluded.sort_order, description = excluded.description;

-- Alt kategoriler
insert into public.report_categories (parent_id, name, slug, icon, color, sla_days, sort_order)
select p.id, v.name, v.slug, p.icon, p.color, p.sla_days, v.ord
from (values
  ('ulasim',          'Toplu Ulaşım',        'toplu-ulasim',        1),
  ('ulasim',          'Durak',               'durak',               2),
  ('ulasim',          'Trafik',              'trafik',              3),
  ('ulasim',          'Kavşak',              'kavsak',              4),
  ('yol-altyapi',     'Yol Çukuru',          'yol-cukuru',          1),
  ('yol-altyapi',     'Asfalt',              'asfalt',              2),
  ('yol-altyapi',     'Kaldırım',            'kaldirim',            3),
  ('yol-altyapi',     'Kanalizasyon',        'kanalizasyon',        4),
  ('yol-altyapi',     'Yağmur Suyu',         'yagmur-suyu',         5),
  ('yol-altyapi',     'Su Arızası',          'su-arizasi',          6),
  ('temizlik',        'Çöp',                 'cop',                 1),
  ('temizlik',        'Konteyner',           'konteyner',           2),
  ('temizlik',        'Çevre Kirliliği',     'cevre-kirliligi',     3),
  ('aydinlatma',      'Sokak Lambası',       'sokak-lambasi',       1),
  ('aydinlatma',      'Karanlık Alan',       'karanlik-alan',       2),
  ('park-yesil-alan', 'Park ve Oyun Alanı',  'park-oyun-alani',     1),
  ('park-yesil-alan', 'Ağaç ve Bakım',       'agac-bakim',          2),
  ('erisilebilirlik', 'Rampa',               'rampa',               1),
  ('erisilebilirlik', 'Kaldırım İşgali',     'kaldirim-isgali',     2),
  ('sokak-hayvanlari','Besleme ve Barınma',  'besleme-barinma',     1),
  ('sokak-hayvanlari','Acil Müdahale',       'acil-mudahale',       2)
) as v(parent_slug, name, slug, ord)
join public.report_categories p on p.slug = v.parent_slug
on conflict (slug) do nothing;
