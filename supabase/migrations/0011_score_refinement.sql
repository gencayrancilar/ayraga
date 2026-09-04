-- =============================================================================
-- AYRA · 0011 · Skor metodolojisi düzeltmesi + zincir sadeleştirmesi
--
-- Sorun: İlk sürümde henüz çözülmemiş ama SLA süresi dolmamış bir bildirim,
-- "çözüm oranı 0" ve "hız 0" olarak sayılıyordu. Bu, yeni açılmış tek bir
-- bildirimi olan bir mahalleye haksız biçimde düşük skor veriyordu.
--
-- Düzeltme: Bileşenler yalnızca gerçek sinyal varsa hesaba katılır ve
-- ağırlıklar mevcut bileşenler arasında yeniden normalize edilir.
--   · SLA süresi içindeki açık bildirim  → nötr (başarısızlık sayılmaz)
--   · SLA süresi geçmiş açık bildirim    → başarısızlık
--   · Hiç çözüm yoksa hız bileşeni       → sinyal yok, dışarıda bırakılır
-- =============================================================================

-- Zincirde "Sorun oluşturuldu" ve "Sorun bildirildi" tekrarını kaldır.
create or replace function public.on_status_history_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_label text;
begin
  if new.from_status is not null then
    v_label := case new.to_status
      when 'new' then 'Sorun yeniden açıldı'
      when 'verified' then 'Sorun doğrulandı'
      when 'forwarded' then 'Yetkili kuruma iletildi'
      when 'in_review' then 'Kurum tarafından inceleniyor'
      when 'awaiting_resolution' then 'Çözüm bekleniyor'
      when 'resolved' then 'Sorun çözüldü'
      when 'unresolved' then 'Çözülemedi olarak kapatıldı'
      when 'duplicate' then 'Mevcut bir bildirimle birleştirildi'
      when 'rejected' then 'Yayından kaldırıldı'
    end;

    perform public.append_report_event(
      new.report_id, 'status_changed', v_label,
      jsonb_build_object('from', new.from_status, 'to', new.to_status, 'note', new.note),
      new.actor_id, null, new.created_at
    );
  end if;

  update public.reports r set
    status = new.to_status,
    status_note = coalesce(new.note, r.status_note),
    first_forwarded_at = case
      when new.to_status = 'forwarded' and r.first_forwarded_at is null then new.created_at
      else r.first_forwarded_at end,
    resolved_at = case
      when new.to_status = 'resolved' then new.created_at
      when new.to_status in ('new','verified','forwarded','in_review','awaiting_resolution') then null
      else r.resolved_at end
  where r.id = new.report_id and r.status is distinct from new.to_status;

  return new;
end $$;

-- ---------------------------------------------------------------------------
create or replace function public.compute_neighborhood_score(
  p_neighborhood_id uuid,
  p_window_days integer default null
) returns jsonb
language plpgsql stable as $$
declare
  v_window   integer := coalesce(p_window_days, public.score_setting('window_days')::int, 365);
  v_ref      numeric := coalesce(public.score_setting('ref_open_per_1k'), 5);
  v_w        numeric[] := array[
                coalesce(public.score_setting('w_burden'), 0.40),
                coalesce(public.score_setting('w_resolution'), 0.35),
                coalesce(public.score_setting('w_speed'), 0.25)
              ];
  v_log_base numeric := coalesce(public.score_setting('support_log_base'), 50);
  v_pop           numeric;
  v_pop_estimated boolean := false;
  v_categories jsonb := '[]'::jsonb;
  v_num numeric := 0;
  v_den numeric := 0;
  v_total integer := 0;
  r record;
  v_capacity numeric;
  v_burden numeric;
  v_res_rate numeric;
  v_speed numeric;
  v_sub numeric;
  v_wsum numeric;
begin
  select n.population into v_pop from public.neighborhoods n where n.id = p_neighborhood_id;
  if not found then
    return jsonb_build_object('available', false, 'reason', 'neighborhood_not_found');
  end if;
  if v_pop is null or v_pop = 0 then
    v_pop := coalesce(public.score_setting('default_population'), 5000);
    v_pop_estimated := true;
  end if;

  v_capacity := greatest((v_pop / 1000.0) * v_ref, 1);

  for r in
    select
      c.id, c.name, c.slug, c.icon, c.color, c.weight, c.sla_days,
      count(*) filter (where rc.status in ('new','verified','forwarded','in_review','awaiting_resolution')) as open_count,
      count(*) filter (where rc.status = 'resolved')   as resolved_count,
      count(*) filter (where rc.status = 'unresolved') as unresolved_count,
      -- SLA süresi dolmuş, hâlâ açık bildirimler
      count(*) filter (
        where rc.status in ('new','verified','forwarded','in_review','awaiting_resolution')
          and rc.created_at < now() - make_interval(days => c.sla_days)
      ) as overdue_count,
      coalesce(sum(
        case when rc.status in ('new','verified','forwarded','in_review','awaiting_resolution')
             then 1 + ln(1 + rc.support_count) / ln(v_log_base) else 0 end
      ), 0) as effective_open,
      percentile_cont(0.5) within group (order by rc.resolution_days)
        filter (where rc.resolution_days is not null) as median_days
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
        'category_id', r.id, 'name', r.name, 'slug', r.slug, 'icon', r.icon, 'color', r.color,
        'available', false, 'score', null, 'open_count', 0, 'resolved_count', 0
      );
      continue;
    end if;

    -- 1) Yük: her zaman sinyal taşır
    v_burden := 1 - least(1, r.effective_open / v_capacity);

    -- 2) Çözüm oranı: yalnızca sonuçlanmış veya süresi geçmiş işler sayılır
    if (r.resolved_count + r.unresolved_count + r.overdue_count) > 0 then
      v_res_rate := r.resolved_count::numeric / (r.resolved_count + r.unresolved_count + r.overdue_count);
    else
      v_res_rate := null;   -- henüz sinyal yok
    end if;

    -- 3) Hız: yalnızca gerçekten çözülmüş iş varsa
    if r.median_days is not null then
      v_speed := 1 - least(1, r.median_days / (2.0 * r.sla_days));
    else
      v_speed := null;
    end if;

    -- Mevcut bileşenler arasında ağırlıkları yeniden normalize et
    v_wsum := v_w[1]
            + case when v_res_rate is null then 0 else v_w[2] end
            + case when v_speed    is null then 0 else v_w[3] end;

    v_sub := 100 * (
        v_w[1] * v_burden
      + coalesce(v_w[2] * v_res_rate, 0)
      + coalesce(v_w[3] * v_speed, 0)
    ) / v_wsum;
    v_sub := greatest(0, least(100, v_sub));

    v_num   := v_num + v_sub * r.weight;
    v_den   := v_den + r.weight;
    v_total := v_total + r.open_count + r.resolved_count + r.unresolved_count;

    v_categories := v_categories || jsonb_build_object(
      'category_id', r.id, 'name', r.name, 'slug', r.slug, 'icon', r.icon, 'color', r.color,
      'available', true,
      'score', round(v_sub, 0),
      'open_count', r.open_count,
      'overdue_count', r.overdue_count,
      'resolved_count', r.resolved_count,
      'unresolved_count', r.unresolved_count,
      'median_resolution_days', case when r.median_days is null then null else round(r.median_days::numeric, 1) end,
      'sla_days', r.sla_days,
      'components', jsonb_build_object(
        'burden',          round(v_burden * 100, 0),
        'resolution_rate', case when v_res_rate is null then null else round(v_res_rate * 100, 0) end,
        'speed',           case when v_speed    is null then null else round(v_speed * 100, 0) end
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
    'population_estimated', v_pop_estimated,
    'categories', v_categories,
    'computed_at', now()
  );
end $$;
