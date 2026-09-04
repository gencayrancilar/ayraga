-- =============================================================================
-- AYRA · 0009 · AYRA Skoru
--
-- METODOLOJİ (şeffaf, rastgele değil)
-- ---------------------------------------------------------------------------
-- Skor bir mahallenin "iyi/kötü" yargısı değil; o mahallede bildirilen
-- sorunların ne kadarının çözüme kavuştuğunun ve ne hızda kavuştuğunun
-- ölçüsüdür. Yalnızca platform üzerindeki doğrulanabilir veriden hesaplanır.
--
-- Her kategori için 0-100 arası bir alt skor üretilir:
--
--   alt_skor = 40 × yük_bileşeni + 35 × çözüm_oranı + 25 × hız_bileşeni
--
--   yük_bileşeni  = 1 − min(1, etkin_açık_sorun / (nüfus/1000 × REF))
--                   REF = 1000 kişi başına 5 açık sorun → doygunluk noktası
--                   etkin_açık_sorun = Σ (1 + ln(1+destek)/ln(50))
--                   Yani çok desteklenen bir sorun, tek bir bildirimden
--                   daha ağır sayılır. Toplumsal öncelik skora yansır.
--
--   çözüm_oranı   = çözülen / (çözülen + açık)
--
--   hız_bileşeni  = 1 − min(1, medyan_çözüm_günü / (2 × kategori_sla))
--                   SLA'nın iki katında sıfırlanır.
--
-- Genel AYRA Skoru = kategori ağırlıklarıyla (report_categories.weight)
-- ağırlıklandırılmış alt skorların ortalaması. Verisi olmayan kategori
-- hesaba katılmaz; "veri yok" olarak gösterilir (sahte 100 üretilmez).
--
-- Güven düzeyi (confidence) örneklem büyüklüğüne bağlıdır:
--   < 10 bildirim  → 'low', < 40 → 'medium', aksi halde 'high'
-- =============================================================================

create table if not exists public.score_settings (
  key   text primary key,
  value numeric not null,
  note  text
);

insert into public.score_settings (key, value, note) values
  ('ref_open_per_1k', 5,    '1000 kişi başına doygunluk noktası (açık sorun)'),
  ('w_burden',        0.40, 'Yük bileşeninin ağırlığı'),
  ('w_resolution',    0.35, 'Çözüm oranının ağırlığı'),
  ('w_speed',         0.25, 'Hız bileşeninin ağırlığı'),
  ('support_log_base',50,   'Destek logaritma tabanı'),
  ('window_days',     365,  'Değerlendirme penceresi (gün)'),
  ('default_population', 5000, 'Nüfus verisi yoksa varsayılan')
on conflict (key) do nothing;

create or replace function public.score_setting(p_key text)
returns numeric language sql stable as $$
  select value from public.score_settings where key = p_key
$$;

create or replace function public.compute_neighborhood_score(
  p_neighborhood_id uuid,
  p_window_days integer default null
) returns jsonb
language plpgsql stable as $$
declare
  v_window      integer := coalesce(p_window_days, public.score_setting('window_days')::int, 365);
  v_ref         numeric := coalesce(public.score_setting('ref_open_per_1k'), 5);
  v_w_burden    numeric := coalesce(public.score_setting('w_burden'), 0.40);
  v_w_res       numeric := coalesce(public.score_setting('w_resolution'), 0.35);
  v_w_speed     numeric := coalesce(public.score_setting('w_speed'), 0.25);
  v_log_base    numeric := coalesce(public.score_setting('support_log_base'), 50);
  v_pop         numeric;
  v_categories  jsonb := '[]'::jsonb;
  v_num         numeric := 0;
  v_den         numeric := 0;
  v_total       integer := 0;
  r             record;
  v_capacity    numeric;
  v_burden      numeric;
  v_res_rate    numeric;
  v_speed       numeric;
  v_sub         numeric;
begin
  select coalesce(nullif(n.population, 0), public.score_setting('default_population'))
    into v_pop
  from public.neighborhoods n where n.id = p_neighborhood_id;

  if v_pop is null then
    return jsonb_build_object('available', false, 'reason', 'neighborhood_not_found');
  end if;

  v_capacity := greatest((v_pop / 1000.0) * v_ref, 1);

  for r in
    select
      c.id, c.name, c.slug, c.icon, c.color, c.weight, c.sla_days,
      count(*) filter (where rc.status in ('new','verified','forwarded','in_review','awaiting_resolution')) as open_count,
      count(*) filter (where rc.status = 'resolved') as resolved_count,
      count(*) filter (where rc.status = 'unresolved') as unresolved_count,
      coalesce(sum(
        case when rc.status in ('new','verified','forwarded','in_review','awaiting_resolution')
             then 1 + ln(1 + rc.support_count) / ln(v_log_base)
             else 0 end
      ), 0) as effective_open,
      percentile_cont(0.5) within group (
        order by rc.resolution_days
      ) filter (where rc.resolution_days is not null) as median_days
    from public.report_categories c
    left join public.report_cards rc
      on coalesce(rc.root_category_id, rc.category_id) = c.id
     and rc.neighborhood_id = p_neighborhood_id
     and rc.status <> 'duplicate'
     and rc.created_at > now() - make_interval(days => v_window)
    where c.parent_id is null and c.is_active
    group by c.id, c.name, c.slug, c.icon, c.color, c.weight, c.sla_days
    order by c.sort_order
  loop
    if (r.open_count + r.resolved_count + r.unresolved_count) = 0 then
      v_categories := v_categories || jsonb_build_object(
        'category_id', r.id, 'name', r.name, 'slug', r.slug,
        'icon', r.icon, 'color', r.color,
        'score', null, 'available', false,
        'open_count', 0, 'resolved_count', 0
      );
      continue;
    end if;

    v_burden   := 1 - least(1, r.effective_open / v_capacity);
    v_res_rate := r.resolved_count::numeric
                  / nullif(r.resolved_count + r.unresolved_count + r.open_count, 0);
    v_speed    := case
                    when r.median_days is null then v_res_rate  -- henüz çözüm yok: oranı taşı
                    else 1 - least(1, r.median_days / (2.0 * r.sla_days))
                  end;

    v_sub := 100 * (v_w_burden * v_burden + v_w_res * coalesce(v_res_rate, 0) + v_w_speed * coalesce(v_speed, 0));
    v_sub := greatest(0, least(100, v_sub));

    v_num   := v_num + v_sub * r.weight;
    v_den   := v_den + r.weight;
    v_total := v_total + r.open_count + r.resolved_count + r.unresolved_count;

    v_categories := v_categories || jsonb_build_object(
      'category_id', r.id, 'name', r.name, 'slug', r.slug,
      'icon', r.icon, 'color', r.color,
      'available', true,
      'score', round(v_sub, 0),
      'open_count', r.open_count,
      'resolved_count', r.resolved_count,
      'unresolved_count', r.unresolved_count,
      'median_resolution_days', round(coalesce(r.median_days, 0)::numeric, 1),
      'components', jsonb_build_object(
        'burden', round(v_burden * 100, 0),
        'resolution_rate', round(coalesce(v_res_rate, 0) * 100, 0),
        'speed', round(coalesce(v_speed, 0) * 100, 0)
      )
    );
  end loop;

  if v_den = 0 then
    return jsonb_build_object(
      'available', false, 'reason', 'no_data',
      'neighborhood_id', p_neighborhood_id,
      'categories', v_categories, 'window_days', v_window
    );
  end if;

  return jsonb_build_object(
    'available', true,
    'neighborhood_id', p_neighborhood_id,
    'score', round(v_num / v_den, 0),
    'total_reports', v_total,
    'confidence', case when v_total < 10 then 'low' when v_total < 40 then 'medium' else 'high' end,
    'window_days', v_window,
    'population', v_pop,
    'categories', v_categories,
    'computed_at', now()
  );
end $$;

-- Anlık görüntü tablosu (ana sayfa ve liste ekranları hızlı okusun diye)
create table if not exists public.neighborhood_scores (
  neighborhood_id uuid primary key references public.neighborhoods(id) on delete cascade,
  score           smallint,
  confidence      text,
  total_reports   integer not null default 0,
  breakdown       jsonb not null default '{}'::jsonb,
  computed_at     timestamptz not null default now()
);

create or replace function public.refresh_neighborhood_scores()
returns integer language plpgsql security definer set search_path = public as $$
declare
  n record;
  v_result jsonb;
  v_count integer := 0;
begin
  for n in select id from public.neighborhoods where is_active loop
    v_result := public.compute_neighborhood_score(n.id);
    insert into public.neighborhood_scores (neighborhood_id, score, confidence, total_reports, breakdown, computed_at)
    values (
      n.id,
      case when (v_result ->> 'available')::boolean then (v_result ->> 'score')::smallint else null end,
      v_result ->> 'confidence',
      coalesce((v_result ->> 'total_reports')::integer, 0),
      v_result,
      now()
    )
    on conflict (neighborhood_id) do update set
      score = excluded.score,
      confidence = excluded.confidence,
      total_reports = excluded.total_reports,
      breakdown = excluded.breakdown,
      computed_at = excluded.computed_at;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
