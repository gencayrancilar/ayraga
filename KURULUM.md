# AYRA · Kurulum

Üç yol var. Sıradan bir başlangıç için **Yol 1** yeterli.

| | Ne gerekir | Ne zaman |
| --- | --- | --- |
| **Yol 1 — Supabase + kendi bilgisayarınız** | Node 20+ ve ücretsiz bir Supabase hesabı | Denemek, geliştirmek. Önerilen. |
| **Yol 2 — Tamamen yerel** | Node 20+ ve PostgreSQL (Docker veya Postgres.app) | İnternetsiz çalışmak, veriyi dışarı çıkarmamak |
| **Yol 3 — Yayına alma** | Yol 1 + GitHub + Vercel | Gerçek kullanıcılara açmak |

---

## Yol 1 — Supabase + kendi bilgisayarınız

Bilgisayarınıza veritabanı kurmanız gerekmez; PostgreSQL'i Supabase sağlar.

### 1. Node kurulu mu?

Terminal'i açıp:

```bash
node -v
```

`v20` veya üstü çıkmalı. Çıkmıyorsa [nodejs.org](https://nodejs.org) adresinden LTS sürümünü kurun.

### 2. Arşivi açın

```bash
cd ~/Desktop
tar -xzf ~/Downloads/ayra-kaynak-kodu.tar.gz
cd ayra
npm install
```

`npm install` birkaç dakika sürebilir.

### 3. Supabase projesi

**AYRAga projeniz için bu adım tamamlandı.** Şema, 43 güvenlik politikası,
60 mahalle, 33 kategori, 12 kurum ve `report-media` görsel deposu kuruldu.
Doğrudan 5. adıma geçebilirsiniz.

Yeni bir proje kuracaksanız:

1. [supabase.com](https://supabase.com) → **New project**
2. Bölge olarak **Frankfurt (eu-central-1)** seçin — Türkiye'ye en yakın olanı.
3. Veritabanı parolasını bir yere kaydedin; birazdan lazım olacak.

### 4. Şemayı kurun — terminal gerekmez

Depodaki `supabase/AYRA-KURULUM.sql` dosyası bütün şemayı, güvenlik
politikalarını ve başlangıç verisini tek parça hâlinde içerir.

1. Supabase panelinde sol taraftaki dikey menüden **SQL Editor** (`>_` simgesi).
2. **New query**.
3. `supabase/AYRA-KURULUM.sql` dosyasını bir metin düzenleyicide açın, tamamını
   kopyalayıp editöre yapıştırın. **Dosyayı bölmeyin, sıra önemlidir.**
4. **Run** (veya ⌘↵).
5. Supabase "Potential issues detected" uyarısı gösterir — dosya tablo silme ve
   oluşturma içerdiği için normaldir. **Run and enable RLS** deyin.
6. Aynı yolla `supabase/AYRA-DEPOLAMA.sql` dosyasını da çalıştırın; görsellerin
   yükleneceği `report-media` kovasını açar.

Birkaç saniye sürer. Sonunda şöyle bir tablo görmelisiniz:

| mahalle | kategori | kurum | migration |
| --- | --- | --- | --- |
| 60 | 33 | 12 | 14 |

Çalışırken beliren `NOTICE: ... does not exist, skipping` satırları normaldir —
dosya, daha önce kurulmuş bir sistemde de çalışabilsin diye önce eski
politikaları silmeye çalışır.

> Bu adımı yaptıysanız aşağıdaki `npm run db:migrate` ve `npm run db:seed`
> komutlarını **atlayın**; şema zaten hazır.

### 5. Bağlantı adresini alın

Bağlantı adresi Ayarlar'da değil, sayfanın üstündeki yeşil **Connect**
düğmesinin arkasında: **Connect → Direct connection**.

Orada iki seçenek var ve **hangisini seçtiğiniz önemli**:

| | Adres | Ne zaman |
| --- | --- | --- |
| **Direct connection** | `db.PROJE_REF.supabase.co:5432` | Yalnızca IPv6 üzerinden çalışır. Çoğu ev/ofis bağlantısı IPv4 olduğu için genelde bağlanamaz. |
| **Session pooler** | `aws-0-eu-central-1.pooler.supabase.com:5432` | IPv4 ile çalışır. **Bunu seçin.** |

AYRAga projesi için hazır adres — yalnız parolayı yerine yazın:

```
postgresql://postgres.pszriyzfdytlzudjpdbd:PAROLANIZ@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
```

Parola, projeyi kurarken belirlediğiniz veritabanı parolasıdır. Hatırlamıyorsanız
aynı pencerede **Reset database password** var. Parolada `@ : / ? #` gibi
karakterler varsa URL kodlaması gerekir; en pratiği parolayı yalnızca harf ve
rakamdan oluşacak şekilde sıfırlamaktır.

### 6. Ortam dosyasını oluşturun

```bash
cp .env.example .env.local
openssl rand -base64 48        # çıkan değeri AUTH_JWT_SECRET'a yazın
```

`.env.local` dosyasını bir metin düzenleyicide açıp iki satırı doldurun:

```bash
DATABASE_URL="postgresql://postgres.pszriyzfdytlzudjpdbd:PAROLANIZ@aws-0-eu-central-1.pooler.supabase.com:5432/postgres"
AUTH_JWT_SECRET="openssl komutunun ürettiği değer"
```

Gerisi olduğu gibi kalabilir. Görseller şimdilik bilgisayarınızda `storage/uploads`
klasörüne yazılır; Supabase Storage'a geçiş aşağıda anlatılıyor.

### 7. Önce sınayın, sonra çalıştırın

```bash
npm run db:check
```

Bu komut hiçbir şeyi değiştirmez; sadece `.env.local` dosyasını okur, bağlanmayı
dener ve neyin eksik olduğunu tek tek söyler. Şöyle bitmeli:

```
  ✓ .env.local okundu
  ✓ DATABASE_URL dolu
  ✓ AUTH_JWT_SECRET tamam
  ✓ veritabanına bağlanıldı
  ✓ şema kurulu — 60 mahalle, 33 kategori, 12 kurum

Her şey hazır.  npm run dev
```

Sonra:

```bash
npm run dev
```

`http://localhost:3000` adresini açın.

### 8. İlk yöneticiyi belirleyin

Uygulamada **Katıl → Kayıt** ile kendi e-postanızla bir hesap açın, sonra:

```bash
npm run make-admin -- eposta@adresiniz.com
```

Artık profil ekranında **Yönetim paneli** bağlantısı görünür.

### İsteğe bağlı: örnek verilerle denemek

Boş bir haritada ekranların nasıl göründüğünü görmek zor. Sahte 44 bildirim üretmek için:

```bash
npm run db:demo
```

Ürettiği kayıtlar **sentetiktir**, gerçek şikâyet değildir. Gerçek kullanıma geçmeden
önce `npm run db:reset && npm run db:seed` ile temizleyin (yerel veritabanında) ya da
Supabase'de tabloları elle boşaltın.

### Görselleri Supabase Storage'a taşımak

`report-media` kovası AYRAga projesinde **zaten açık** (herkese açık okuma,
üyeler yükleyebilir, dosya başına 8 MB, yalnız JPEG/PNG/WebP/AVIF). Geriye
anahtarları `.env.local` dosyasına yazmak kalıyor:

1. **Settings → API Keys** sayfasından `anon` (publishable) ve `service_role` (secret)
   anahtarlarını alın. Proje adresi (`https://PROJE_REF.supabase.co`) **Settings → General**
   sayfasındaki *Project ID* değerinden oluşur.
3. `.env.local` dosyasında şu satırları açın ve doldurun:

```bash
STORAGE_PROVIDER="supabase"
NEXT_PUBLIC_STORAGE_PROVIDER="supabase"
NEXT_PUBLIC_SUPABASE_URL="https://pszriyzfdytlzudjpdbd.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ..."
SUPABASE_SERVICE_ROLE_KEY="eyJ..."
SUPABASE_STORAGE_BUCKET="report-media"
NEXT_PUBLIC_SUPABASE_BUCKET="report-media"
```

`service_role` anahtarı gizlidir; yalnızca sunucu tarafında kullanılır, tarayıcıya
hiçbir zaman gönderilmez.

---

## Yol 2 — Tamamen yerel

PostgreSQL'i kendi bilgisayarınızda çalıştırırsınız; hiçbir veri dışarı çıkmaz.

**Docker ile (en kolay):**

```bash
docker run --name ayra-db -e POSTGRES_PASSWORD=ayra -e POSTGRES_DB=ayra \
  -p 5432:5432 -d postgres:16
```

**Postgres.app ile (macOS, arayüzlü):** [postgresapp.com](https://postgresapp.com) →
kurun → Initialize → varsayılan port 5432.

Sonra:

```bash
cp .env.example .env.local
```

`.env.local` içinde:

```bash
DATABASE_URL="postgresql://postgres:ayra@127.0.0.1:5432/ayra"
AUTH_JWT_SECRET="openssl rand -base64 48 çıktısı"
```

```bash
npm install
npm run db:reset      # yerelde reset güvenlidir
npm run db:demo       # isteğe bağlı örnek veri
npm run dev
```

---

## Yol 3 — Yayına alma (Vercel)

> **ayraga.com için ayrıntılı rehber `YAYIN.md` dosyasında.** Orada GitHub
> gerekmeyen, tek hesapla ilerleyen adım adım anlatım var. Aşağısı genel
> özettir.

Yol 1 tamamlandıktan sonra:

### 1. Kodu GitHub'a koyun

```bash
cd ayra
git init
git add .
git commit -m "AYRA ilk sürüm"
```

GitHub'da boş bir **private** depo açın, verdiği iki satırı çalıştırın:

```bash
git remote add origin https://github.com/KULLANICI/ayra.git
git push -u origin main
```

`.env.local` dosyası `.gitignore` içinde olduğu için depoya gitmez — doğru olan budur.

### 2. Vercel'e bağlayın

1. [vercel.com](https://vercel.com) → **Add New → Project** → GitHub deponuzu seçin.
2. **Environment Variables** bölümüne `.env.local` içindeki tüm satırları girin.
   `NEXT_PUBLIC_SITE_URL` değerini gerçek alan adınıza ayarlayın
   (`https://ayra.gencayrancilar.org` gibi).
3. **Deploy**.

### 3. Yayın öncesi kontrol listesi

- [ ] `NEXT_PUBLIC_SITE_URL` gerçek alan adı — paylaşım kartları ve site haritası buna bağlı
- [ ] `AUTH_JWT_SECRET` yeni ve rastgele (yerelde kullandığınızdan farklı)
- [ ] Supabase Storage bucket'ı açık ve `public`
- [ ] Sahte demo verisi temizlendi
- [ ] İlk yönetici hesabı tanımlandı (`npm run make-admin`)
- [ ] Yönetim → **Mahalleler** ekranından nüfuslar girildi (AYRA Skoru için)
- [ ] Yönetim → **Kurumlar** ekranından iletişim bilgileri ve yanıt süresi hedefleri güncellendi
- [ ] `/gizlilik` ve `/kurallar` metinleri hukuki gözden geçirmeden geçti
- [ ] `npm run test:rls` çalıştırıldı ve 22/22 geçti

Maliyet: Supabase ücretsiz katman + Vercel ücretsiz katman + OpenFreeMap (anahtarsız)
= **0 ₺**. Trafik arttığında ilk sınıra Supabase'in depolama kotasında ulaşırsınız.

---

## Sık karşılaşılan hatalar

**`ECONNREFUSED 127.0.0.1:5432`**
Veritabanı çalışmıyor ya da `DATABASE_URL` yanlış. Yol 2'deyseniz Docker/Postgres.app
açık mı diye bakın.

**`AUTH_JWT_SECRET en az 32 karakter olmalı`**
`.env.local` içindeki değer kısa ya da hiç yazılmamış. `openssl rand -base64 48` ile üretin.

**`npm install` "2 vulnerabilities (1 moderate, 1 high)" diyor**
Bu iki uyarı Next.js'in içinde gelen eski bir `postcss` sürümünden kaynaklanıyordu.
`package.json` içindeki `overrides` alanı postcss'i yamalı sürüme sabitliyor;
temiz bir kurulumdan sonra `npm audit` **0 vulnerabilities** demeli. Hâlâ uyarı
görüyorsanız `rm -rf node_modules package-lock.json && npm install` deyin.
`npm audit fix --force` **çalıştırmayın** — Next 16'ya zorlar, uygulama kırılır.

**`npm warn allow-scripts ... fsevents`**
`fsevents` yalnızca macOS'ta dosya değişikliklerini izlemek için kullanılan
standart bir pakettir. Kurulum betiğini onaylamazsanız da her şey çalışır;
`npm run dev` sadece dosyaları biraz daha yavaş fark eder. İsterseniz
`npm approve-scripts fsevents` ile onaylayabilirsiniz.

**`ENETUNREACH` ya da bağlantı zaman aşımına uğruyor**
`DATABASE_URL` içinde `db.PROJE_REF.supabase.co` yazıyorsa, Supabase'in doğrudan
bağlantısı yalnızca IPv6 üzerinden çalışır ve çoğu bağlantı IPv4'tür. Adresi
5. adımdaki **Session pooler** adresiyle (`aws-0-eu-central-1.pooler.supabase.com`)
değiştirin.

**`password authentication failed`**
`DATABASE_URL` içindeki `[YOUR-PASSWORD]` yerine gerçek parolayı yazmayı unuttunuz.
Parolada `@ : / ?` gibi karakterler varsa URL kodlaması gerekir — Supabase'de parolayı
sadece harf ve rakamdan oluşacak şekilde sıfırlamak en pratiği.

**Harita boş görünüyor, pinler var**
Tile servisine (OpenFreeMap) ulaşılamıyor. Uygulama bunu bilerek tolere eder: nötr bir
zemine düşer ve bildirimleri göstermeye devam eder. İnternet bağlantısını kontrol edin.

**`npm run make-admin` "bulunamadı" diyor**
Önce o e-postayla uygulamada kayıt olmanız gerekiyor. Takma adla katıldıysanız
profil ekranından **E-posta ekle** ile hesabı kalıcı hâle getirin.
