-- =============================================================================
-- AYRA · 0015 · Moderasyon kararının bildirimi
--
-- Eksik: bir bildirim reddedildiğinde ya da mükerrer sayılıp birleştirildiğinde
-- sahibine hiçbir şey söylenmiyordu. Gerekçe report_status_history.note içine
-- yazılıyor ama kimseye gösterilmiyordu; kişi bir gün bakıp bildiriminin
-- kaybolduğunu görüyordu.
--
-- AYRA kurumlardan kararlarını açıklamasını istiyor; kendi kararını
-- açıklamaması tutarsız olurdu. Aşağıdaki sürüm, takipçilere giden
-- bildirimlere ek olarak, moderasyon kararlarını bildirim sahibine
-- gerekçesiyle iletir.
--
-- Sahibi takipçi listesinde de olabilir; bu yüzden takipçi dağıtımı
-- moderasyon durumlarını kapsamaz (zaten kapsamıyordu) ve mükerrer
-- bildirim oluşmaz.
-- =============================================================================

create or replace function public.fanout_status_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_report record;
  v_title  text;
  v_kind   text;
  v_govde  text;
begin
  select r.id, r.title, r.slug, r.user_id into v_report
  from public.reports r where r.id = new.report_id;

  if v_report.id is null then
    return new;
  end if;

  -- ── Moderasyon kararları: yalnızca bildirimin sahibine ───────────────────
  if new.to_status in ('rejected', 'duplicate') then
    if v_report.user_id is not null then
      v_govde := case
        when new.to_status = 'rejected'
          then coalesce(
            nullif(btrim(new.note), ''),
            'Topluluk kurallarına uymadığı için yayımlanmadı.')
        else coalesce(
            nullif(btrim(new.note), ''),
            'Aynı sorun için daha önce açılmış bir bildirimle birleştirildi.')
      end;

      insert into public.notifications (user_id, report_id, kind, title, body, url)
      values (
        v_report.user_id,
        v_report.id,
        'moderation',
        case new.to_status
          when 'rejected' then 'Bildiriminiz yayımlanmadı'
          else 'Bildiriminiz mükerrer olarak birleştirildi'
        end,
        v_govde,
        '/sorun/' || v_report.slug
      );
    end if;
    return new;
  end if;

  -- ── Diğer durumlar: takipçilere ──────────────────────────────────────────
  v_title := case new.to_status
    when 'forwarded'   then 'Desteklediğiniz sorun yetkili kuruma iletildi'
    when 'in_review'   then 'Desteklediğiniz sorun inceleniyor'
    when 'awaiting_resolution' then 'Desteklediğiniz sorun için çözüm bekleniyor'
    when 'resolved'    then 'Desteklediğiniz sorun çözüldü'
    when 'unresolved'  then 'Desteklediğiniz sorun çözülemedi olarak kapatıldı'
    when 'verified'    then 'Desteklediğiniz sorun doğrulandı'
    else null
  end;

  if v_title is null then
    return new;
  end if;

  v_kind := case new.to_status
    when 'resolved' then 'resolved'
    when 'forwarded' then 'authority_submitted'
    else 'status_changed'
  end;

  insert into public.notifications (user_id, report_id, kind, title, body, url)
  select f.user_id, v_report.id, v_kind, v_title, v_report.title, '/sorun/' || v_report.slug
    from public.report_follows f
   where f.report_id = new.report_id
     and f.user_id is distinct from new.actor_id;

  return new;
end $$;
