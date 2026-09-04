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

const TABLOLAR = [
  "countries", "cities", "districts", "neighborhoods",
  "report_categories", "authorities", "category_authorities",
  "profiles", "reports", "report_media", "report_supports",
  "report_status_history", "report_events", "report_follows",
  "authority_submissions", "moderation_reports", "score_settings",
  "neighborhood_scores",
];

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

const damga = new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "");
const klasor = "yedek";
mkdirSync(klasor, { recursive: true });
const dosya = join(klasor, `ayra-${damga}.json`);

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

writeFileSync(dosya, JSON.stringify(cikti, null, 1));
const kb = (Buffer.byteLength(JSON.stringify(cikti)) / 1024).toFixed(0);
console.log(`\n${dosya} yazıldı — ${toplam} satır, ${kb} KB\n`);

await sql.end({ timeout: 2 });
