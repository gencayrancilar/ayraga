-- =============================================================================
-- AYRA · Önceki sistemden aktarım
-- Genç Ayrancılar sorun haritasındaki 52 kayıt AYRA'ya taşınır.
--
-- Supabase → SQL Editor'da tek seferde çalıştırılır.
-- Tekrar çalıştırmak güvenlidir: aktarılmış kayıtlar atlanır.
--
-- Üç iş yapar:
--   1. 0015 (moderasyon kararının bildirimi) — bekleyen migration
--   2. 0016 (aktarım künyesi tablosu)        — bekleyen migration
--   3. 52 kaydın aktarımı
-- =============================================================================

-- ── 1. Bekleyen migration: 0015 ─────────────────────────────────────────────
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


-- ── 2. Bekleyen migration: 0016 ─────────────────────────────────────────────
-- =============================================================================
-- AYRA · 0016 · Önceki sistemden aktarılan kayıtların künyesi
--
-- Genç Ayrancılar Derneği'nin Replit üzerinde tuttuğu sorun haritasındaki
-- kayıtlar AYRA'ya taşınıyor. Taşınan her kaydın kaynağını ve özgün numarasını
-- burada tutuyoruz ki:
--   1) aktarım scripti iki kez çalıştırılırsa kayıtlar ikizlenmesin,
--   2) "bu bildirim nereden geldi" sorusunun cevabı veride dursun; sadece
--      açıklama metnine yazılmış bir cümle olarak kalmasın.
--
-- Bu tablo kamuya açık okunur: bildirimin künyesi de bildirimin kendisi kadar
-- şeffaf olmalı. Yazma yetkisi yalnızca moderatör/yöneticide.
-- =============================================================================

create table if not exists public.legacy_reports (
  source_system text        not null,             -- 'gencayrancilar-replit'
  source_no     integer     not null,             -- özgün sistemdeki kayıt no
  report_id     uuid        not null references public.reports(id) on delete cascade,
  source_date   date,                             -- özgün kayıt tarihi (bilinmiyorsa null)
  source_note   text,                             -- ör. tarih okunamadı, başlık uzatıldı
  imported_at   timestamptz not null default now(),
  primary key (source_system, source_no)
);

create index if not exists idx_legacy_reports_report on public.legacy_reports(report_id);

alter table public.legacy_reports enable row level security;

drop policy if exists legacy_reports_read on public.legacy_reports;
create policy legacy_reports_read on public.legacy_reports
  for select using (true);

drop policy if exists legacy_reports_write on public.legacy_reports;
create policy legacy_reports_write on public.legacy_reports
  for all to authenticated
  using (public.is_moderator()) with check (public.is_moderator());


-- Migration defterine işle (npm run db:migrate bunları tekrar denemesin)
insert into public.schema_migrations (filename) values
  ('0015_moderation_notice.sql'), ('0016_legacy_import.sql')
on conflict (filename) do nothing;

-- ── 3. Aktarım ──────────────────────────────────────────────────────────────
do $ayra$
declare
  v_user    uuid;
  v_rep     uuid;
  v_ref     text;
  v_cat     uuid;
  v_desc    text;
  v_zaman   timestamptz;
  v_n       integer := 0;
  v_atlanan integer := 0;
  r         record;
begin
  -- Aktarım hesabı. Parolası yok: bu hesapla giriş yapılamaz, yalnızca
  -- taşınan kayıtların sahibi olarak görünür.
  select id into v_user from auth.users where email = 'aktarim@gencayrancilar.org';
  if v_user is null then
    v_user := gen_random_uuid();
    insert into auth.users (id, email, raw_user_meta_data, created_at)
    values (v_user, 'aktarim@gencayrancilar.org',
            jsonb_build_object('display_name', 'Genç Ayrancılar Derneği (önceki sistem)'),
            now());
    -- Supabase'in auth.users tablosunda aud/role sütunları var, yereldekinde yok.
    if exists (select 1 from information_schema.columns
                where table_schema = 'auth' and table_name = 'users' and column_name = 'aud') then
      execute 'update auth.users set aud = coalesce(aud, ''authenticated''),
                                     role = coalesce(role, ''authenticated'')
                where id = $1' using v_user;
    end if;
  end if;

  -- Profil tetikleyicisi Supabase'de kurulamamış olabilir; garantiye alıyoruz.
  insert into public.profiles (id, display_name, is_anonymous)
  values (v_user, 'Genç Ayrancılar Derneği (önceki sistem)', false)
  on conflict (id) do update set display_name = excluded.display_name;

  for r in
    select * from (values
      (1, null::date, 'Kaldırım', 'Medifema', 38.2399, 27.2767, 'kaldirim', 'verified', 'özgün tarih kaynakta okunamadı; listedeki en eski tarih (23.03.2026) üst sınır olarak alındı; kategori: kaynakta “Diğer” idi, içeriğine göre taşındı'),
      (3, date '2026-03-23', 'Park Kötü Durumda', 'Ayrancılar', 38.24263, 27.27436, 'park-oyun-alani', 'verified', 'kategori: kaynakta “Diğer” idi, içeriğine göre taşındı'),
      (13, date '2026-03-23', 'Eshot durağı lazım', 'İzmar önü', 38.23781, 27.28325, 'durak', 'verified', 'kategori: kaynakta “Diğer” idi, içeriğine göre taşındı'),
      (14, date '2026-03-23', 'yol bozuk', 'Değirmen caddesi', 38.24019, 27.28051, 'asfalt', 'verified', 'kategori: kaynakta “Diğer” idi, içeriğine göre taşındı'),
      (18, date '2026-03-27', 'sokak aydınlatması', 'Ayrancılar', 38.24134, 27.27455, 'sokak-lambasi', 'verified', 'kategori: kaynakta “Diğer” idi, içeriğine göre taşındı'),
      (19, date '2026-04-20', 'Kaldırımlar', null, 38.2442, 27.28375, 'kaldirim', 'verified', 'kaynakta adres alanı boştu; kategori: kaynakta “Diğer” idi, içeriğine göre taşındı'),
      (20, date '2026-04-24', 'Yaya Geçiti Lazım', 'Ayrancılar Mah. 85. Sokak', 38.24282, 27.27553, 'trafik', 'verified', 'kategori: kaynakta “Diğer” idi, içeriğine göre taşındı'),
      (22, date '2026-04-24', 'Çöpler toplanmiyor', 'Ayrancılar', 38.23965, 27.28049, 'cop', 'verified', 'kategori: kaynakta “Diğer” idi, içeriğine göre taşındı'),
      (23, date '2026-04-24', 'Yol sorunu', 'Ayrancılar', 38.23963, 27.28048, 'yol-altyapi', 'verified', 'başlık 3 karakterdi ("Yol"), en az sekiz karakter kuralı için genişletildi'),
      (24, date '2026-04-24', 'Orta refüj ağaçlandırma', 'İzmir-Aydın caddesi orta refüj üzeri ağaç dikimi', 38.23854, 27.27848, 'agac-bakim', 'verified', null),
      (25, date '2026-04-25', 'Musluk kapanmıyor', 'Ayrancılar, Şevket Kıvılcım Caddesi', 38.24094, 27.27737, 'su-arizasi', 'verified', 'adres sokak seviyesine kısaltıldı (kapı/daire bilgisi taşınmadı); kategori: kaynakta “Diğer” idi, içeriğine göre taşındı'),
      (26, date '2026-04-25', 'Elektirik', 'Ayrancılar Mahallesi 93. Sokak (Egekent)', 38.23985, 27.27624, 'aydinlatma', 'verified', 'adres sokak seviyesine kısaltıldı (kapı/daire bilgisi taşınmadı)'),
      (27, date '2026-04-26', 'Yol bozuk', 'İzmir Torbalı Bahçelievler TOKİ muhtarlık yolu', 38.23096, 27.29257, 'asfalt', 'verified', null),
      (28, date '2026-05-09', 'Basketbol sahası futbol sahasına dönüştürülsün', 'İzmir Torbalı Ayrancılar 104. Sokak basket sahası', 38.24055, 27.27945, 'park-oyun-alani', 'verified', 'başlık 120 karakter sınırına göre kısaltıldı'),
      (29, date '2026-05-12', 'Su Patlağı Var', 'Suyunbaşı Cafe karşısındaki çöp kovasının olduğu alanda su patlamış yola akıyor', 38.25227, 27.28122, 'su-arizasi', 'resolved', null),
      (30, date '2026-05-12', 'Su patlağı var dereye akıyor', 'Suyunbaşı civarı', 38.24429, 27.28373, 'su-arizasi', 'resolved', 'kategori: kaynakta “Diğer” idi, içeriğine göre taşındı'),
      (31, date '2026-05-19', 'İnternet altyapısı yok', 'Ayrancılar Mahallesi 70. Sokak', 38.24283, 27.27642, 'internet-telekom', 'verified', 'adres sokak seviyesine kısaltıldı (kapı/daire bilgisi taşınmadı); kategori: kaynakta “Diğer” idi, içeriğine göre taşındı'),
      (33, date '2026-05-19', 'Tarla yolunda su patlağı ve çamur', 'Egekent sucunun orası', 38.24446, 27.2766, 'su-arizasi', 'verified', 'kategori: kaynakta “Diğer” idi, içeriğine göre taşındı'),
      (35, date '2026-05-20', 'Bahçelievler mh. Sağlık Ocağı Eksikliği', 'Zafer caddesi', 38.23509, 27.29471, 'saglik', 'verified', '35 ve 43 aynı konuda; ikisi de ayrı bırakıldı'),
      (36, date '2026-05-20', '705 no''lu HAT GÜZERGAHI', 'Fevzi çakmak mah. 84. Sokak — en yakın 705 durağı 800 m uzaklıkta', 38.24539, 27.28046, 'toplu-ulasim', 'verified', null),
      (37, date '2026-05-20', '705 No''lu hat GÜZERGAHI burdan da geçmiyor', 'Fevzi çakmak mah. Barış Manço caddesi', 38.24346, 27.28264, 'toplu-ulasim', 'verified', null),
      (38, date '2026-05-20', '705 Neden burdan geçmiyor', 'Ayrancılar', 38.2405, 27.28173, 'toplu-ulasim', 'verified', null),
      (39, date '2026-05-21', 'Alt veya Üst Geçit Eksikliği', 'Bahçelievler mh. Milangaz (Moil) ışıklarına, Okul yolu, çocuklar ve yayalar karşıya geçmek tehlikeli', 38.23292, 27.29389, 'trafik', 'verified', null),
      (40, date '2026-05-21', '705 Eshot Semt G. veya Konağa kadar gitsin', '705 Eshot Güzergahı', 38.23328, 27.29346, 'toplu-ulasim', 'verified', null),
      (41, date '2026-05-22', 'Yaya geçidi', 'Yaya geçidi lazım yıllardır buradayım fakat yaya geçidi yok', 38.24403, 27.27284, 'trafik', 'verified', 'kategori: yaya geçidi talebi olduğu için Trafik'),
      (43, date '2026-05-22', 'Bahçelievler Sağlık Ocağı Eksikliği', 'Zafer caddesindeki temeli atılıp ama 3 yıldır yapılmayan Sağlık Ocağının tamamlanmasını istiyoruz.', 38.23503, 27.29496, 'saglik', 'verified', '35 ve 43 aynı konuda; ikisi de ayrı bırakıldı'),
      (44, date '2026-05-23', 'Evimin yakınlarında toplu taşıma yok', 'Ayrancılar', 38.23752, 27.27628, 'toplu-ulasim', 'verified', null),
      (45, date '2026-05-27', 'Yolda çukur ve moloz var', 'İhlas camii 500 metre ilerisindeki sağ ara sokak girişi', 38.23973, 27.29609, 'yol-cukuru', 'verified', null),
      (46, date '2026-05-28', 'Kuru otlar her yer böcek yangın olma ihtimali var', 'Fevzi Çakmak Mahallesi 21. Sokak', 38.23989, 27.29106, 'cevre-kirliligi', 'verified', 'adres sokak seviyesine kısaltıldı (kapı/daire bilgisi taşınmadı)'),
      (47, date '2026-05-29', 'Park alanı toprak, oyuncaklar yetersiz, yeşil alan bakımsız', 'Fevzi çakmak mahallesi 50. Sokak', 38.24756, 27.28354, 'park-oyun-alani', 'verified', 'başlık 120 karakter sınırına göre kısaltıldı'),
      (48, date '2026-05-31', 'Yolda deformasyon var. Araçlar hızlı geçerse sorun oluşabilir', 'Egekentte çama çıkan ara sokak', 38.24633, 27.27568, 'asfalt', 'verified', null),
      (49, date '2026-05-31', 'Yoldan geçen bir yayanın ayağı kaydı düşecekti acil düzeltilmesi lazım', 'Egekent 705''in kalkış durağının orası', 38.24561, 27.27503, 'asfalt', 'verified', null),
      (50, date '2026-05-31', 'Işıklar gece yanmiyor vatandaşlar bakkala gidemiyor', 'Ayrancılar', 38.23465, 27.28578, 'sokak-lambasi', 'verified', null),
      (51, date '2026-06-01', 'İlaçlama yapılmıyor yapılması nı istiyorum eve sinek geliyor', 'Ayrancılar Mahallesi 71/1. Sokak', 38.2403, 27.279, 'cevre-kirliligi', 'verified', 'adres sokak seviyesine kısaltıldı (kapı/daire bilgisi taşınmadı); kategori: kaynakta “Diğer” idi, içeriğine göre taşındı'),
      (52, date '2026-06-11', 'İşletmeler kaldırımları işgal ediyor', 'Ayrancılar', 38.24338, 27.28253, 'kaldirim-isgali', 'verified', 'başlık kaynakta kesik görünüyordu'),
      (53, date '2026-06-12', 'binamıza internet altyapısı istiyoruz', 'İnönü Mahallesi 112. Sokak', 38.23588, 27.27926, 'internet-telekom', 'verified', 'adres sokak seviyesine kısaltıldı (kapı/daire bilgisi taşınmadı)'),
      (54, date '2026-06-12', 'Yol kaldırım ve temizlik yol kenarına mazgal yapılması talep ediyoruz', 'Ayrancılar mahallesi değırmen cadesi', 38.24193, 27.28163, 'yagmur-suyu', 'verified', 'kategori: mazgal talebi olduğu için Yağmur Suyu'),
      (55, date '2026-06-13', 'Trafik levhasi eksikliği', 'Ahmet Özkan caddesi trafik levhasi eksikliği', 38.24097, 27.26182, 'trafik', 'verified', 'kategori: trafik levhası olduğu için Trafik'),
      (56, date '2026-06-15', 'Otobüs sorunu', 'Ayrancılar', 38.24144, 27.27696, 'toplu-ulasim', 'verified', 'başlık 6 karakterdi ("Otobüs"), en az sekiz karakter kuralı için genişletildi'),
      (57, date '2026-06-22', 'İlaçlama yapılması nı istiyorum acil', 'Ayrancılar Mahallesi 71/1. Sokak', 38.26325, 27.27571, 'cevre-kirliligi', 'verified', 'adres sokak seviyesine kısaltıldı (kapı/daire bilgisi taşınmadı); kategori: kaynakta “Diğer” idi, içeriğine göre taşındı'),
      (58, date '2026-06-29', 'İnternet arızası', 'Ayrancılar Mahallesi 71/1. Sokak', 38.26325, 27.2739, 'internet-telekom', 'verified', 'adres sokak seviyesine kısaltıldı (kapı/daire bilgisi taşınmadı)'),
      (60, date '2026-07-10', 'trafik ışıkları çok uzun süre yanıyor çok trafik oluyor', 'Ayrancılar', 38.23801, 27.28072, 'trafik', 'verified', null),
      (61, date '2026-07-18', 'Alan çok pis yangın ihtimali var', 'Eski çeşmenin orada baz istasyonu arkası', 38.24896, 27.26143, 'cevre-kirliligi', 'verified', null),
      (66, date '2026-08-19', 'ATM İstiyoruz', 'Bahçelievler tokide hiçbir bankanın atmsi yok', 38.2298, 27.2918, 'diger', 'verified', null),
      (67, date '2026-08-19', 'Yollar karanlık sabahları yürüyemiyoruz ışık istiyoruz', 'bahçelievler tokiden caddeye çıkan sokaklar çok karanlık oluyor', 38.22872, 27.29349, 'karanlik-alan', 'verified', null),
      (68, date '2026-08-19', 'Pancar Otoban Çıkışını Bekliyoruz', 'Ayrancılar', 38.21948, 27.2589, 'ulasim', 'verified', 'kategori: kaynakta “Diğer” idi, içeriğine göre taşındı'),
      (69, date '2026-08-19', 'Motorculara bir çözüm lazım çok ses oluyor', 'bahçelievler toki içi', 38.22805, 27.29094, 'diger', 'verified', 'kategori: gürültü için ayrı başlık yok, Diğer altında'),
      (70, date '2026-08-19', 'Yaya geçidi yok', 'Benzinlikteki durağa gitmek için koyuncuoğlundan karşıya geçemiyoruz', 38.23758, 27.28393, 'trafik', 'verified', 'kategori: yaya geçidi talebi olduğu için Trafik'),
      (71, date '2026-08-19', 'Alt geçit istiyoz', 'Ayrancılar', 38.23501, 27.29046, 'trafik', 'verified', 'kategori: kaynakta “Diğer” idi, içeriğine göre taşındı'),
      (72, date '2026-08-21', 'Düğün Salonu Yapılsın.', 'Ayrancılar Jandarma Arkası', 38.24813, 27.26406, 'park-yesil-alan', 'verified', null),
      (73, date '2026-08-25', 'Yangın riski', 'Elmalık yolu üzerinde kırık şişeler var', 38.25148, 27.26464, 'cevre-kirliligi', 'verified', null),
      (74, date '2026-08-25', 'Yol bozuk ışık yok', 'Fabrikanın yanından caddeye çıkan yol', 38.23184, 27.28805, 'asfalt', 'verified', null)
    ) as t(no, tarih, baslik, adres, lat, lng, kategori, durum, kunye)
    order by no
  loop
    if exists (select 1 from public.legacy_reports
                where source_system = 'gencayrancilar-replit' and source_no = r.no) then
      v_atlanan := v_atlanan + 1;
      continue;
    end if;

    select id into v_cat from public.report_categories where slug = r.kategori;
    if v_cat is null then
      raise exception 'Kategori bulunamadı: %', r.kategori;
    end if;

    -- Tarihi okunamayan tek kayıt (no 1) için listedeki en eski tarih üst
    -- sınır olarak kullanılır; künyesinde bunun tahmin olduğu yazar.
    v_zaman := (coalesce(r.tarih, date '2026-03-23') + time '09:00')
                 at time zone 'Europe/Istanbul';

    v_desc := 'Bu bildirim önceki sistemden (Genç Ayrancılar sorun haritası) aktarıldı. '
           || case when r.tarih is null
                   then 'Özgün kayıt no ' || r.no || '; bildirim tarihi kaynakta okunamadı.'
                   else 'Özgün kayıt no ' || r.no || ', ' || to_char(r.tarih, 'DD.MM.YYYY')
                        || ' tarihinde bildirilmişti.'
              end;

    insert into public.reports
      (user_id, title, description, category_id, latitude, longitude, address, created_at, updated_at)
    values
      (v_user, r.baslik, v_desc, v_cat, r.lat, r.lng, r.adres, v_zaman, v_zaman)
    returning id, ref_code into v_rep, v_ref;

    -- 'new' halkasını insert tetikleyicisi yazdı; üstüne özgün durumu ekliyoruz.
    insert into public.report_status_history
      (report_id, from_status, to_status, actor_id, note, created_at)
    values (v_rep, 'new', 'verified', v_user,
            'Önceki sistemden aktarıldı; kayıt derneğin haritasında doğrulanmıştı.', v_zaman);

    if r.durum = 'resolved' then
      insert into public.report_status_history
        (report_id, from_status, to_status, actor_id, note, created_at)
      values (v_rep, 'verified', 'resolved', v_user,
              'Önceki sistemde çözüldü olarak kapatılmıştı.', v_zaman);
    end if;

    insert into public.legacy_reports
      (source_system, source_no, report_id, source_date, source_note)
    values ('gencayrancilar-replit', r.no, v_rep, r.tarih, r.kunye);

    v_n := v_n + 1;
  end loop;

  -- Durum geçmişi eklenince reports.updated_at tetikleyici tarafından now()
  -- yapılıyor; oysa bu kayıtlar aktarımdan ibaret, içerikleri bugün değişmedi.
  -- Sitemap lastModified ve schema.org dateModified bu alandan besleniyor.
  if v_n > 0 then
    alter table public.reports disable trigger trg_reports_before_write;
    -- Takma ad rep: döngü değişkeni r ile çakışmasın.
    update public.reports rep set updated_at = rep.created_at
      from public.legacy_reports l
     where l.report_id = rep.id
       and l.source_system = 'gencayrancilar-replit'
       and rep.updated_at <> rep.created_at;
    alter table public.reports enable trigger trg_reports_before_write;
  end if;

  perform public.refresh_neighborhood_scores();

  raise notice 'Aktarılan: %, daha önce aktarılmış (atlandı): %', v_n, v_atlanan;
end $ayra$;

-- ── Sonuç ───────────────────────────────────────────────────────────────────
select count(*)                                        as aktarilan_kayit,
       count(*) filter (where r.status = 'resolved')    as cozuldu,
       min(r.created_at)::date                          as en_eski,
       max(r.created_at)::date                          as en_yeni
  from public.legacy_reports l
  join public.reports r on r.id = l.report_id
 where l.source_system = 'gencayrancilar-replit';
