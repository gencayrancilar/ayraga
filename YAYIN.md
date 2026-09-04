# AYRA · ayraga.com adresinde yayına alma

Bu rehber tek bir hesapla ilerler: **Vercel**. GitHub gerekmez.
(İleride kod geçmişi tutmak isterseniz GitHub'ı sonradan ekleyebilirsiniz.)

Toplam süre: yaklaşık 30 dakika. Maliyet: **0 ₺** — Vercel ve Supabase'in
ücretsiz katmanları bu ölçek için yeterli.

---

## Neyi neden yapıyoruz

Şu an site yalnızca sizin bilgisayarınızda, `npm run dev` çalıştığı sürece
açık. Yayına alınca:

- site 7/24 açık kalır, bilgisayarınız kapalıyken de,
- `ayraga.com` adresinden herkes girebilir,
- HTTPS sertifikası otomatik gelir.

Veritabanı zaten Supabase'de — o taraf değişmiyor.

---

## Adım 1 — Fotoğrafları Supabase Storage'a taşıyın (atlanamaz)

Şu an fotoğraflar bilgisayarınızdaki `storage/uploads` klasörüne yazılıyor.
Vercel'de sunucu diski kalıcı değildir: **her yeni dağıtımda yüklenen
fotoğraflar silinir.** O yüzden yayına çıkmadan önce Supabase Storage'a
geçmek gerekiyor. Kova (`report-media`) zaten hazır.

Supabase panelinde **Settings → API Keys** sayfasını açın. İki anahtar var:

| Anahtar | Nerede kullanılır | Gizli mi |
| --- | --- | --- |
| `anon` (publishable) | Tarayıcıda | Hayır, herkese açık |
| `service_role` (secret) | Yalnız sunucuda | **Evet — kimseyle paylaşmayın** |

Bu iki değeri birazdan Vercel'e gireceksiniz. Şimdilik sayfayı açık bırakın.

---

## Adım 2 — Vercel hesabı açın

1. [vercel.com/signup](https://vercel.com/signup) → **Continue with Email**
   (GitHub hesabı istemiyorsanız e-posta yeterli).
2. Gelen doğrulama bağlantısına tıklayın.
3. Hesap türü sorulursa **Hobby** seçin — ücretsiz olan bu.

---

## Adım 3 — Siteyi yükleyin

Terminal'de (sunucunun çalıştığı pencere değil, **yeni bir sekme**):

```bash
cd ~/Desktop/ayra
npx vercel login
```

E-postanızı yazın, gelen postadaki bağlantıya tıklayın. Terminal
"Success!" yazacak.

Sonra:

```bash
npx vercel
```

Sorular şöyle cevaplanır:

| Soru | Cevap |
| --- | --- |
| Set up and deploy? | **y** |
| Which scope? | kendi adınız (tek seçenek) |
| Link to existing project? | **n** |
| Project name? | `ayra` (Enter) |
| In which directory is your code? | `./` (Enter) |
| Modify settings? | **n** |

Birkaç dakika sürer. Sonunda `https://ayra-....vercel.app` gibi geçici bir
adres verir.

Derleme başarılı olur, ama **adresi açtığınızda hata görürsünüz** — bu
beklenen bir durum: veritabanı bilgilerini henüz girmedik. Sıradaki adım o.

---

## Adım 4 — Ortam değişkenlerini girin

[vercel.com/dashboard](https://vercel.com/dashboard) → **ayra** projesi →
**Settings → Environment Variables**. Aşağıdakileri tek tek ekleyin
(her biri için Production, Preview ve Development kutularının üçünü de işaretleyin):

| Ad | Değer |
| --- | --- |
| `DATABASE_URL` | `.env.local` dosyanızdaki satırın **birebir aynısı** |
| `AUTH_JWT_SECRET` | **Yeni** bir değer — aşağıya bakın |
| `NEXT_PUBLIC_SITE_URL` | `https://ayraga.com` |
| `STORAGE_PROVIDER` | `supabase` |
| `NEXT_PUBLIC_STORAGE_PROVIDER` | `supabase` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://pszriyzfdytlzudjpdbd.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API Keys → `anon` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API Keys → `service_role` |
| `SUPABASE_STORAGE_BUCKET` | `report-media` |
| `NEXT_PUBLIC_SUPABASE_BUCKET` | `report-media` |

`AUTH_JWT_SECRET` için Terminal'de:

```bash
openssl rand -base64 48
```

Çıkan uzun metni kopyalayıp yapıştırın. **Bilgisayarınızdakinden farklı
olmalı** — yerel anahtarınız sızarsa yayındaki oturumlar etkilenmesin diye.

Hepsini girdikten sonra **Deployments** sekmesine gidin, en üstteki
dağıtımın yanındaki **⋯ → Redeploy** deyin. Değişkenler ancak yeniden
dağıtımda devreye girer.

Geçici `.vercel.app` adresini açın — site çalışıyor olmalı.

---

## Adım 5 — ayraga.com adresini bağlayın

Vercel'de **Settings → Domains** → kutuya `ayraga.com` yazıp **Add**.

Vercel size iki kayıt gösterir. Alan adınızı aldığınız firmanın panelinde
(Natro, İsimtescil, GoDaddy…) **DNS Yönetimi** bölümüne girip bunları ekleyin:

| Tip | Ad | Değer |
| --- | --- | --- |
| A | `@` | Vercel'in verdiği IP (genelde `76.76.21.21`) |
| CNAME | `www` | Vercel'in verdiği adres (`cname.vercel-dns.com`) |

**Ekranda ne yazıyorsa onu girin** — Vercel zaman zaman farklı değerler
verebiliyor, buradaki örneklere değil kendi ekranınıza güvenin.

DNS'in yayılması 10 dakika ile birkaç saat arasında sürer. Vercel hazır
olduğunda alan adının yanına yeşil bir onay koyar ve HTTPS sertifikasını
otomatik alır.

---

## Adım 6 — Yayın sonrası kontrol listesi

- [ ] `https://ayraga.com` açılıyor, kilit simgesi var
- [ ] Kayıt olup bildirim gönderilebiliyor
- [ ] **Fotoğraflı** bir bildirim deneyin; görsel yayında görünüyor mu
- [ ] Yönetim → **Mahalleler**: beş mahallenin nüfusu girildi
- [ ] Yönetim → **Kurumlar**: iletişim bilgileri ve yanıt süresi hedefleri girildi
- [ ] `/gizlilik` ve `/kurallar` metinleri hukuki gözden geçirmeden geçti
- [ ] Sahte/deneme bildirimleri temizlendi

---

## Yedek alma

Supabase'in ücretsiz katmanı otomatik yedek vermez. AYRA'nın değeri kalıcı
kayıt tutmasında olduğu için yedeği ihmal etmeyin:

```bash
cd ~/Desktop/ayra
npm run yedek
```

Bütün bildirimleri, destekleri, durum geçmişini ve kanıt zincirini
`yedek/` klasörüne tarihli tek bir JSON dosyası olarak yazar. Aynı zamanda
kanıt zincirinin bütünlüğünü de kontrol edip sonucu dosyaya kaydeder —
"BOZUK" görürseniz bana haber verin.

**Ayda bir, bildirim sayısı arttıkça iki haftada bir** çalıştırın. Dosyayı
bilgisayarınızda bırakmayın; bir buluta ya da harici diske kopyalayın.

Yedek dosyası kişisel veri içerir (bildirim sahiplerinin görünen adları,
varsa e-postaları). Paylaşırken buna dikkat edin.

---

## Bundan sonra değişiklik yapmak

Kodda bir şey değiştiğinde, Terminal'de:

```bash
cd ~/Desktop/ayra
npx vercel --prod
```

Bu kadar. Bilgisayarınızın sürekli açık olması gerekmez; yalnızca
değişikliği yayına alırken çalıştırırsınız.

---

## Sık karşılaşılan durumlar

**Geçici adres açılıyor ama "Bir şeyler ters gitti" diyor**
Ortam değişkenlerinden biri eksik ya da yanlış. En sık sebep: değişken
eklendikten sonra **Redeploy** yapılmamış olması.

**Fotoğraf yükleniyor ama görünmüyor**
`STORAGE_PROVIDER` ve `NEXT_PUBLIC_STORAGE_PROVIDER` değerlerinin ikisi de
`supabase` olmalı. Biri `local` kaldıysa böyle olur.

**Alan adı bağlanmıyor, "Invalid Configuration" yazıyor**
DNS kayıtları henüz yayılmamıştır. Birkaç saat bekleyin. Uzun sürerse
kayıt firmasının panelinde eski bir A kaydı kalmış olabilir; onu silin.

**Sayfalar rastgele 500 hatası veriyor**
Veritabanı bağlantı havuzunun dolduğu anlamına gelir (`max clients reached`).
AYRA sunucusuz ortamda örnek başına tek bağlantı açacak şekilde ayarlıdır;
yine de olursa Supabase → Connect → **Transaction pooler** adresine
(port 6543) geçin, istemci kotası çok daha yüksektir.

**Bildirimler yayında görünmüyor**
Yayındaki site ile bilgisayarınızdaki site **aynı** Supabase veritabanını
kullanır. Bildirim görünmüyorsa moderasyon durumuna bakın.
