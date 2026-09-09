-- =============================================================================
-- AYRA · 7 Eylül Pazartesi gönderimi — ne oldu?
-- Supabase → SQL Editor. Salt okuma, hiçbir şeyi değiştirmez.
-- =============================================================================

-- 1) O gün hangi kuruma ne gitti?
select o.sent_at, a.name as kurum, o.kind, o.status, o.subject
  from public.outbound_messages o
  left join public.authorities a on a.id = o.authority_id
 where o.created_at >= date '2026-09-07' and o.created_at < date '2026-09-09'
 order by o.created_at;

-- 2) O gün iletilen bildirimlerin onayı var mıydı?
--    "onay yok" yazan satırlar, onaysız gitmiş demektir.
select a.name as kurum, r.ref_code, r.title,
       coalesce(d.decision, 'ONAY YOK') as karar,
       d.decided_at, p.display_name as karari_veren
  from public.authority_submissions s
  join public.reports r     on r.id = s.report_id
  join public.authorities a on a.id = s.authority_id
  left join public.dispatch_decisions d
         on d.report_id = s.report_id and d.authority_id = s.authority_id
  left join public.profiles p on p.id = d.decided_by
 where s.submitted_at >= date '2026-09-07' and s.submitted_at < date '2026-09-09'
 order by a.name, r.ref_code;

-- 3) Onay altyapısı o an veritabanında var mıydı?
select to_regclass('public.dispatch_decisions')          as onay_tablosu,
       to_regproc('public.kuruma_onaylilar(uuid)')       as onayli_fonksiyonu,
       (select count(*) from public.dispatch_decisions)  as toplam_karar;

-- 4) Şu an kaç bildirim onaylı bekliyor?
select authority_name, bekleyen as karar_bekleyen, onayli, haric
  from public.gonderim_ozeti()
 order by authority_name;
