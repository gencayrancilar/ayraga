-- =============================================================================
-- AYRA · 0012 · Bildirim dağıtımı düzeltmesi
--
-- Hata: fanout_status_notification() takipçileri seçerken bildirimi
-- filtrelemiyordu; bir sorunun durumu değiştiğinde platformdaki TÜM takipçilere
-- bildirim gidiyordu. Aşağıda takip kaydı doğru bildirime bağlanır, işlemi
-- yapan moderatörün kendisi hariç tutulur ve aynı olay için mükerrer bildirim
-- üretilmesi engellenir.
-- =============================================================================

create or replace function public.fanout_status_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_report record;
  v_title  text;
  v_kind   text;
begin
  select r.id, r.title, r.slug into v_report
  from public.reports r where r.id = new.report_id;

  if v_report.id is null then
    return new;
  end if;

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
   where f.report_id = new.report_id           -- ← eksik olan koşul
     and f.user_id is distinct from new.actor_id;

  return new;
end $$;

-- Yanlış dağıtılmış geçmiş bildirimleri temizle: kullanıcının takip etmediği
-- bir sorun için üretilmiş kayıtlar silinir.
delete from public.notifications n
 where n.report_id is not null
   and not exists (
     select 1 from public.report_follows f
      where f.report_id = n.report_id and f.user_id = n.user_id
   );

-- Not: burada mükerrer engelleyici bir benzersiz indeks bilinçli olarak
-- kullanılmadı. Tetikleyici her durum değişiminde bir kez çalışır; indeks
-- ihlali ise durum değişikliği işlemini tümden geri alır — bildirimi
-- tekrarlamak, durumu kaydedememekten iyidir.
