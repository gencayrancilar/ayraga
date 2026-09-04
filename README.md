# AYRA<sup>GA</sup>

**Gör. Bildir. Destekle. Takip et.**

AYRA, vatandaşların yaşadıkları bölgedeki sorunları harita üzerinde bildirebildiği,
diğer bildirimleri görüp destekleyebildiği ve çözüm sürecini şeffaf biçimde takip
edebildiği bağımsız bir kent platformudur. Genç Ayrancılar Derneği tarafından
geliştirilmektedir.

İlk yayın bölgesi: **Ayrancılar — Torbalı — İzmir**.
Veri modeli Ülke → İl → İlçe → Mahalle hiyerarşisi üzerine kuruludur; başka şehirlerin
eklenmesi için kod değişikliği gerekmez.

---

> **Kuruluma buradan başlayın:** [KURULUM.md](KURULUM.md) — Supabase, tamamen yerel
> ve Vercel yayını için adım adım kılavuz, yayın öncesi kontrol listesiyle.

## Hızlı başlangıç

```bash
npm install
cp .env.example .env.local          # değerleri kendinize göre düzenleyin
npm run db:reset                    # şema + seed
npm run db:demo                     # (isteğe bağlı) geliştirme verisi
npm run dev
```

`http://localhost:3000` adresinde açılır.
`scripts/demo.mjs` çalıştırıldıysa yönetici hesabı: `yonetim@ayra.local` / `ayra-yonetim-2026`.

### Gerekli ortam değişkenleri

| Değişken | Açıklama |
| --- | --- |
| `DATABASE_URL` | PostgreSQL bağlantısı. Supabase'de "Connection string → URI". |
| `AUTH_JWT_SECRET` | Oturum imzalama anahtarı (≥32 karakter). `openssl rand -base64 48` ile üretin. |
| `AUTH_PROVIDER` | `local` \| `supabase` |
| `STORAGE_PROVIDER` | `local` \| `supabase` |
| `NEXT_PUBLIC_SITE_URL` | Kanonik adres. SEO ve paylaşım kartları için gereklidir. |
| `NEXT_PUBLIC_DEFAULT_LAT/LNG/ZOOM` | Haritanın açılış konumu. |
| `NEXT_PUBLIC_MAP_STYLE` | (isteğe bağlı) MapLibre stil URL'i. Varsayılan: OpenFreeMap. |

---

## Teknik mimari

| Katman | Seçim | Gerekçe |
| --- | --- | --- |
| Uygulama | Next.js 15 (App Router), React 19, TypeScript | Sunucu bileşenleri sayesinde ilk boyama hızlı, SEO doğal. |
| Stil | Tailwind CSS v4 | Tasarım tokenları `src/styles/globals.css` içinde tek kaynakta. |
| Veritabanı | PostgreSQL (Supabase uyumlu) | Tüm iş kuralları ve güvenlik veritabanında. |
| Veri erişimi | `postgres` sürücüsü + Row Level Security | Uygulama katmanı atlansa bile veritabanı kendini savunur. |
| Kimlik | Supabase Auth claim şemasıyla uyumlu JWT | Sağlayıcı değişse de RLS politikaları aynı kalır. |
| Depolama | Yerel dosya sistemi veya Supabase Storage | Tek arayüz, iki uygulama. |
| Harita | MapLibre GL + OpenFreeMap (OSM) | Anahtar gerektirmez, başlangıç maliyeti sıfır. |
| Görsel işleme | sharp | EXIF temizliği, yeniden boyutlandırma, paylaşım kartı üretimi. |

### Neden doğrudan PostgreSQL sürücüsü?

Supabase'in kendisi PostgreSQL'dir. Sorgular `withRls()` içinde,
`request.jwt.claims` ayarlanıp rol `authenticated`/`anon` olarak değiştirilerek
çalıştırılır — PostgREST'in yaptığının aynısı. Sonuç: **tek kod yolu**, lokal
geliştirmede de gerçek RLS, ve Supabase'e geçişte davranış değişmemesi.

### Dizin düzeni

```
src/
  app/
    (app)/           Harita, Keşfet, Bildir, Takip, Profil, Mahalle, statik sayfalar
    sorun/[slug]/    Kamuya açık, indekslenebilir sorun sayfası
    yonetim/         Dernek yönetim paneli (moderatör + admin)
    api/             Harita, medya, adres, benzer bildirim, paylaşım kartı
  components/        Tasarım sistemi ve ekran bileşenleri
  lib/
    actions/         Server action'lar (yazma işlemleri)
    queries/         Okuma katmanı
    auth/            Oturum ve hesap yönetimi
    storage/         Görsel işleme ve depolama
supabase/
  migrations/        Sıralı, idempotent SQL migration'ları
  seed/              Coğrafya, kategori ve kurum başlangıç verisi
scripts/
  db.mjs             migrate / seed / reset
  demo.mjs           Geliştirme verisi (üretimde çalışmaz)
  make-admin.mjs     Bir hesaba yönetici/moderatör yetkisi verir
  icons.mjs          Uygulama ikonlarını marka işaretinden üretir
  test-rls.mjs       Güvenlik ve iş kuralı testleri
```

---

## Veri modeli

Ana tablolar: `countries · cities · districts · neighborhoods · report_categories ·
profiles · reports · report_media · report_supports · report_follows ·
report_status_history · report_events · authorities · category_authorities ·
authority_submissions · notifications · push_subscriptions · moderation_reports ·
neighborhood_scores · score_settings · rate_limits`

### Sorun yaşam döngüsü

```
Yeni → Doğrulandı → Yetkili Kuruma İletildi → İnceleniyor → Çözüm Bekliyor → Çözüldü
                                                                          ↘ Çözülemedi
                                          (Mükerrer / Yayından kaldırıldı)
```

Geçişler `src/lib/status.ts` içindeki `TRANSITIONS` tablosuyla sınırlıdır; geçersiz
bir geçiş hem sunucu eyleminde hem de veritabanında reddedilir.

### Kanıt zinciri

`report_events` **append-only** bir tablodur: `UPDATE` ve `DELETE` tetikleyiciyle
engellenir. Her olay, kendinden önceki olayın özetiyle birlikte SHA-256 ile
imzalanır:

```
hash = sha256(prev_hash | report_id | seq | type | summary | payload | occurred_at)
```

`verify_report_chain(report_id)` zinciri baştan yeniden hesaplar; bir kayıt
sonradan değiştirilmiş veya araya kayıt sıkıştırılmışsa doğrulama başarısız olur ve
bu, sorun sayfasında rozet olarak görünür. Gerçek bir blok zinciri değildir; amaç
merkeziyetsizlik değil, "bu sorun için ne yapıldığı kayıt altında" güvenidir.

### AYRA Skoru

Bir mahallenin "iyi/kötü" yargısı değil, **bildirilen sorunların ne kadarının ve ne
hızda çözüldüğünün** ölçüsüdür. Her ana kategori için üç bileşen hesaplanır:

| Bileşen | Ağırlık | Tanım |
| --- | --- | --- |
| Yük | %40 | `1 − min(1, etkin_açık / (nüfus/1000 × 5))`. Etkin açık = `Σ (1 + ln(1+destek)/ln(50))` — çok desteklenen sorun daha ağır sayılır. |
| Çözüm oranı | %35 | `çözülen / (çözülen + çözülemeyen + süresi geçmiş açık)`. Süresi dolmamış açık bir sorun başarısızlık sayılmaz. |
| Hız | %25 | `1 − min(1, medyan_çözüm_günü / (2 × kategori_hedefi))` |

Bileşenler yalnızca **gerçek sinyal varsa** hesaba katılır; eksik bileşen varsa
ağırlıklar kalanlar arasında yeniden normalize edilir. Verisi olmayan kategori
"veri yok" olarak gösterilir — yapay olarak 100 verilmez. Genel skor, kategori
ağırlıklarıyla (`report_categories.weight`) ağırlıklandırılmış ortalamadır.
Katsayılar `score_settings` tablosundan değiştirilebilir.

Nüfus girilmemişse varsayılan kullanılır ve bu durum kamuya açık sayfada açıkça
belirtilir. Doğru skor için yönetim panelindeki **Mahalleler** ekranından TÜİK
nüfusunu girin.

### Yetkili sessizlik sayacı

Bir bildirim resmî olarak kuruma iletildiğinde (`first_forwarded_at`) sayaç başlar,
kurumdan yanıt kaydedildiğinde (`first_response_at`) durur. Arayüzde
**"Başvurudan bu yana geçen süre"** olarak, nesnel bir dille gösterilir. Kurumun
kendi yanıt süresi hedefi (`authorities.response_sla_days`) aşıldığında ton
sertleşmez; yalnızca hedefin aşıldığı bilgisi eklenir.

---

## Güvenlik

- **Row Level Security** tüm tablolarda açıktır; varsayılan olarak her şey kapalıdır.
  Politikalar yalnızca gerekli olanı açar. Doğrulaması `npm run test:rls`.
- Kullanıcı yalnızca kendi adına bildirim oluşturabilir, yalnızca `new` durumundaki
  kendi bildirimini ilk 60 dakika içinde düzeltebilir.
- Durum değişikliği, kurum başvurusu ve çözüm görseli yalnızca moderatör/admin.
- `report_events` ve `report_views` doğrudan yazmaya kapalıdır; yalnızca
  `SECURITY DEFINER` fonksiyonlar üzerinden yazılır.
- Servis anahtarı yalnızca sunucu tarafındadır; istemciye açılan tek yapılandırma
  `src/lib/public-config.ts` içindedir.
- Yüklenen görseller sihirli baytlarla doğrulanır, 1600 px'e küçültülür, WebP'ye
  çevrilir ve **EXIF verisi (GPS dâhil) silinir**.
- Oran sınırlama: bildirim (5/saat), görsel (30/saat), destek (60/10 dk),
  içerik ihbarı (10/saat), kimlik doğrulama (10/15 dk).
- IP adresi ham hâliyle saklanmaz; yalnızca geri döndürülemez özeti tutulur.

## Performans

- Harita verisi **viewport bazlı** çekilir, istekler geciktirilir ve iptal edilir.
- Kümeleme (marker clustering) istemci tarafında MapLibre ile yapılır.
- `reports(latitude, longitude)` bileşik indeksi + bounding-box sorgusu; PostGIS
  gerektirmez.
- Görseller `next/image` ile AVIF/WebP olarak sunulur, medya yanıtları
  `immutable` olarak önbelleklenir.
- Tile servisine ulaşılamazsa harita nötr bir zemine düşer ve pinler görünmeye
  devam eder — uygulama harici bir servise bağımlı kalmaz.

## Erişilebilirlik

Tüm ana ekranlar mobil ve masaüstü genişliklerinde **axe-core (WCAG 2.1 AA)** ile
sıfır ihlalle doğrulanmıştır. Dokunma hedefleri en az 44 px, odak halkaları her
zaman görünür, `prefers-reduced-motion` desteklenir, yatay taşma yoktur.

## PWA

`public/manifest.webmanifest` ve `public/sw.js`. Service worker bilinçli olarak
**network-first** çalışır: kent verisi tazeliği önemlidir, kullanıcı asla eski bir
sorun listesini güncel sanmamalıdır. Yalnızca uygulama kabuğu, statik varlıklar ve
yüklenmiş görseller önbelleklenir; bağlantı yoksa `/cevrimdisi` sayfası gösterilir.

## SEO

- Her sorun için `/sorun/<slug>` — Türkçe, okunabilir, kalıcı.
- Her mahalle için `/mahalle/<slug>`.
- `schema.org/Report` ve `schema.org/Place` yapılandırılmış verisi.
- `robots.txt` ve dinamik `sitemap.xml` (destek sayısına göre öncelik).
- Her sorun için sunucuda üretilen 1200×630 paylaşım kartı: `/api/paylasim/<slug>`.

---

## Supabase'e geçiş

1. supabase.com'da proje oluşturun.
2. Storage'da `report-media` adında **public** bir bucket açın.
3. `.env.local` dosyasını güncelleyin:

   ```bash
   DATABASE_URL="postgresql://postgres:PAROLA@db.PROJE_REF.supabase.co:5432/postgres"
   AUTH_PROVIDER="supabase"
   STORAGE_PROVIDER="supabase"
   AUTH_JWT_SECRET="<projenin JWT Secret değeri>"
   NEXT_PUBLIC_SUPABASE_URL="https://PROJE_REF.supabase.co"
   NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."
   SUPABASE_SERVICE_ROLE_KEY="eyJ..."      # yalnızca sunucu tarafı
   NEXT_PUBLIC_STORAGE_PROVIDER="supabase"
   NEXT_PUBLIC_SUPABASE_BUCKET="report-media"
   ```

4. `npm run db:migrate && npm run db:seed`

Migration'lar Supabase'de zaten var olan `auth` şeması, rolleri ve fonksiyonları
tanır ve onlara dokunmaz. RLS politikaları `auth.uid()` üzerine kuruludur; bu
yüzden GoTrue'ya geçildiğinde politika değişikliği gerekmez.

### Maliyet

Başlangıç maliyeti sıfırdır: Supabase ücretsiz katman + OpenFreeMap (anahtarsız,
sınırsız) + Vercel/Netlify ücretsiz katman. Paylaşım kartları ve görsel işleme
sunucuda `sharp` ile yapılır; harici bir servise ihtiyaç yoktur.

---

## Yol haritası

MVP (tamamlandı): harita · görüntüleme · bildirim · fotoğraf · destek · detay ·
durum takibi · hesap · yönetim paneli · kurum başvuru kaydı.

Sonraki sürümler: web push bildirimleri · kurum profilleri ve karneleri · açık veri
API'si · yapay zekâ ile kategori önerisi ve mükerrer tespiti · mahalle sınır
poligonlarının girilmesi · native iOS/Android kabuk.

---

## Lisans ve marka

Marka her zaman **AYRA**'dır; **GA** Genç Ayrancılar Derneği'nin ikincil imzasıdır.
AYRA bir belediye uygulaması, siyasi parti uygulaması veya şikâyet sitesi değildir.
