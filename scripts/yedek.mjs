#!/usr/bin/env node
/**
 * AYRA · Yedek alma
 *
 *   npm run yedek
 *
 * Veritabanındaki tüm AYRA tablolarını tek bir JSON dosyasına yazar.
 * pg_dump gerektirmez; yalnızca DATABASE_URL yeterlidir.
 *
 * Dosya: yedek/ayra-YYYY-AA-GG-SSDD.json
 *
 * Ne içerir: bildirimler, destekler, medya kayıtları, durum geçmişi,
 * kanıt zinciri, kullanıcı profilleri, kurumlar, kategoriler, mahalleler.
 * Ne içermez: parolalar ve oturum bilgileri (auth.users tablosuna
 * dokunulmaz), görsel dosyalarının kendisi (onlar Supabase Storage'da).
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import postgres from "postgres";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
  break;
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL bulunamadı. .env.local dosyasını kontrol edin.");
  process.exit(1);
}

/**
 * Yedeklenen tablolar.
 *
 * Dışarıda bırakılanlar ve sebepleri:
 *   rate_limits, job_locks   — anlık işletim durumu, geri yüklenmesi anlamsız
 *   password_resets          — tek kullanımlık jetonlar; yedekte durması riskli
 *   report_views             — hacimli sayaç verisi, kaybı telafi edilebilir
 *   push_subscriptions       — tarayıcı anahtarları; geri yüklense de çalışmaz
 */
const TABLOLAR = [
  // Coğrafya ve tanımlar
  "countries", "cities", "districts", "neighborhoods",
  "report_categories", "authorities", "category_authorities",
  "alert_keywords", "score_settings", "neighborhood_scores",
  // Kişiler
  "profiles", "neighborhood_officials",
  // Bildirimler ve geçmişleri
  "reports", "report_media", "report_supports", "report_status_history",
  "report_events", "report_follows", "legacy_reports",
  // Kurum süreci
  "authority_submissions", "report_official_replies",
  "outbound_messages", "dispatch_decisions", "report_authority_overrides",
  // Muhtar ve moderasyon
  "announcements", "moderation_reports", "notifications",
];

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

const damga = new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "");
const klasor = process.env.YEDEK_DIZINI || "yedek";
mkdirSync(klasor, { recursive: true });
const dosya = join(klasor, `ayra-${damga}.json.gz`);

const cikti = { alindi: new Date().toISOString(), tablolar: {} };
let toplam = 0;

for (const t of TABLOLAR) {
  try {
    const satirlar = await sql`select * from ${sql(`public.${t}`)}`;
    cikti.tablolar[t] = satirlar;
    toplam += satirlar.length;
    console.log(`  ${String(satirlar.length).padStart(6)} satır  ${t}`);
  } catch (e) {
    if (/does not exist/.test(e.message)) {
      console.log(`       —  ${t} (tablo yok, atlandı)`);
    } else {
      console.error(`  HATA    ${t}: ${e.message}`);
    }
  }
}

// Hesaplar. Parola özetleri bilerek dışarıda: yedek dosyası bir depoda ya da
// posta kutusunda duracak, orada parola özeti taşımasına gerek yok. Geri
// yüklemede hesaplar yerinde olur, herkes parolasını sıfırlar — sıfırlama
// akışı çalıştığı için bu artık kabul edilebilir bir tavizdir.
try {
  const kullanicilar = await sql`
    select id, email, is_anonymous, created_at, last_sign_in_at, raw_user_meta_data
      from auth.users order by created_at`;
  cikti.tablolar["auth_users"] = kullanicilar;
  toplam += kullanicilar.length;
  console.log(`  ${String(kullanicilar.length).padStart(6)} satır  auth_users (parolasız)`);
} catch (e) {
  console.error(`  HATA    auth_users: ${e.message}`);
}

// Kanıt zincirinin bütünlüğünü de kaydet: yedeğin ne zaman alındığı kadar,
// o an zincirin sağlam olup olmadığı da önemli.
try {
  // verify_report_chain küme döndürür (her olay için bir satır), bu yüzden
  // lateral ile açıp bool_and uyguluyoruz. Skaler gibi çağrılırsa sessizce
  // boş sonuç verir.
  const [{ gecerli }] = await sql`
    select bool_and(v.ok) as gecerli
      from public.reports r
      cross join lateral public.verify_report_chain(r.id) v`;
  cikti.kanit_zinciri_gecerli = gecerli;
  console.log(`\n  kanıt zinciri: ${gecerli === null ? "bildirim yok" : gecerli ? "geçerli" : "BOZUK"}`);
} catch { /* fonksiyon yoksa sessizce geç */ }

const govde = JSON.stringify(cikti, null, 1);
writeFileSync(dosya, gzipSync(govde, { level: 9 }));
const kb = (Buffer.byteLength(govde) / 1024).toFixed(0);
const sikistirilmis = (existsSync(dosya) ? readFileSync(dosya).length / 1024 : 0).toFixed(0);
console.log(`\n${dosya} yazıldı — ${toplam} satır, ${kb} KB (sıkıştırılmış ${sikistirilmis} KB)\n`);

// Boş yedek, yedek değildir: sessizce başarısız olmasın.
if (toplam === 0) {
  console.error("Hiçbir satır alınamadı — yedek geçersiz.");
  process.exit(1);
}

await sql.end({ timeout: 2 });
