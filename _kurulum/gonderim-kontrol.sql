-- =============================================================================
-- AYRA · Gönderim kontrolü  (Supabase → SQL Editor'de çalıştır, salt okuma)
-- İki cron çalışmasının kurumlara ne bıraktığını gösterir. Hiçbir şeyi değiştirmez.
-- =============================================================================

-- 1) Bugün hangi kuruma kaç e-posta gitti?
select a.name                        as kurum,
       o.status,
       count(*)                      as eposta_sayisi,
       min(o.sent_at)                as ilk,
       max(o.sent_at)                as son
  from public.outbound_messages o
  left join public.authorities a on a.id = o.authority_id
 where o.created_at > now() - interval '2 days'
 group by 1, 2
 order by 1;

-- 2) Aynı sorun aynı kuruma birden çok kez mi iletilmiş?
select a.name as kurum, r.ref_code, r.title, count(*) as kayit_sayisi,
       min(s.submitted_at) as ilk, max(s.submitted_at) as son
  from public.authority_submissions s
  join public.reports r     on r.id = s.report_id
  join public.authorities a on a.id = s.authority_id
 group by 1, 2, 3
having count(*) > 1
 order by count(*) desc, 1;

-- 3) Her kurumda hâlâ kuyrukta bekleyen sorun sayısı
select a.name as kurum,
       (select count(*) from public.kuruma_bekleyenler(a.id)) as bekleyen
  from public.authorities a
 where a.is_active
 order by bekleyen desc, a.name;

-- 4) Torbalı Belediyesi'ne bugün gönderilen iki e-postanın konuları aynı mı?
select o.sent_at, o.subject, left(o.body, 400) as govde_basi
  from public.outbound_messages o
  join public.authorities a on a.id = o.authority_id
 where a.name ilike '%torbalı%' and o.created_at > now() - interval '2 days'
 order by o.sent_at;
