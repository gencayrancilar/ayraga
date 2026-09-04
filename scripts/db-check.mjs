#!/usr/bin/env node
/**
 * AYRA · Bağlantı sınaması
 *
 *   npm run db:check
 *
 * .env.local dosyasını okur, veritabanına bağlanmayı dener ve tek tek
 * neyin çalışıp neyin çalışmadığını söyler. Hiçbir şeyi değiştirmez.
 */
import { readFileSync, existsSync } from "node:fs";
import postgres from "postgres";

const ok = (s) => console.log(`  \x1b[32m✓\x1b[0m ${s}`);
let sorunVar = false;
const no = (s) => { sorunVar = true; console.log(`  \x1b[31m✗\x1b[0m ${s}`); };
const hint = (s) => console.log(`    \x1b[2m${s}\x1b[0m`);

function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!(m[1] in process.env)) process.env[m[1]] = v;
    }
    return f;
  }
  return null;
}

const PLACEHOLDERS = ["PAROLANIZI_BURAYA_YAZIN", "[YOUR-PASSWORD]", "PAROLANIZ", "PROJE_REF"];

console.log("\nAYRA · bağlantı sınaması\n");

const file = loadEnv();
if (!file) {
  no(".env.local bulunamadı");
  hint("cp .env.example .env.local ile oluşturun.");
  process.exit(1);
}
ok(`${file} okundu`);

const url = process.env.DATABASE_URL;
if (!url) {
  no("DATABASE_URL tanımlı değil");
  process.exit(1);
}

const bad = PLACEHOLDERS.find((p) => url.includes(p));
if (bad) {
  no(`DATABASE_URL hâlâ yer tutucu içeriyor: ${bad}`);
  hint(".env.local dosyasında bu metni Supabase veritabanı parolanızla değiştirin.");
  hint("Parolayı bilmiyorsanız: Supabase → Connect → Reset database password.");
  process.exit(1);
}
ok("DATABASE_URL dolu");

if (/@db\.[a-z0-9]+\.supabase\.co/.test(url)) {
  console.log("  \x1b[33m!\x1b[0m Doğrudan bağlantı adresi kullanılıyor (yalnız IPv6)");
  hint("IPv4 ağlardaysanız bağlanamazsınız. Session pooler adresine geçin:");
  hint("aws-0-eu-central-1.pooler.supabase.com:5432");
}

const secret = process.env.AUTH_JWT_SECRET ?? "";
if (secret.length < 32) {
  no(`AUTH_JWT_SECRET çok kısa (${secret.length} karakter, en az 32 gerekiyor)`);
  hint("openssl rand -base64 48 ile üretip .env.local dosyasına yazın.");
} else {
  ok(`AUTH_JWT_SECRET tamam (${secret.length} karakter)`);
}

const sql = postgres(url, { max: 1, connect_timeout: 12, prepare: false, onnotice: () => {} });

try {
  await sql`select 1`;
  ok("veritabanına bağlanıldı");
} catch (e) {
  const m = `${e.message} ${e.code ?? ""}`.toLowerCase();
  if (m.includes("password authentication failed") || m.includes("28p01")) {
    no("parola yanlış — Supabase bağlantıyı reddetti");
    hint("Parolada @ : / ? # varsa adreste sorun çıkarır; harf ve rakamdan oluşan bir parolaya sıfırlayın.");
    hint("Session pooler kullanıyorsanız kullanıcı adı postgres.PROJE_REF biçimindedir.");
  } else if (m.includes("enetunreach") || m.includes("etimedout") || m.includes("enotfound")) {
    no("adrese ulaşılamadı");
    hint("Doğrudan bağlantı yerine Session pooler adresini kullanın (IPv4).");
  } else {
    no(`bağlanılamadı: ${e.message}`);
  }
  await sql.end({ timeout: 1 });
  process.exit(1);
}

try {
  const [r] = await sql`
    select
      (select count(*) from public.neighborhoods)     as mahalle,
      (select count(*) from public.report_categories) as kategori,
      (select count(*) from public.authorities)       as kurum,
      (select count(*) from public.reports)           as bildirim`;
  ok(`şema kurulu — ${r.mahalle} mahalle, ${r.kategori} kategori, ${r.kurum} kurum`);
  ok(`${r.bildirim} bildirim kayıtlı`);
} catch (e) {
  if (`${e.message}`.includes("does not exist")) {
    no("şema kurulmamış — AYRA tabloları yok");
    hint("Supabase → SQL Editor → supabase/AYRA-KURULUM.sql dosyasını yapıştırıp Run deyin.");
  } else {
    no(`şema okunamadı: ${e.message}`);
  }
  await sql.end({ timeout: 1 });
  process.exit(1);
}

// Migration defteri ile diskteki dosyalar uyuşuyor mu?
try {
  const { readdirSync } = await import("node:fs");
  const diskte = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
  const uygulanan = new Set(
    (await sql`select filename from public.schema_migrations`).map((r) => r.filename),
  );
  const eksik = diskte.filter((f) => !uygulanan.has(f));
  if (eksik.length) {
    no(`${eksik.length} migration uygulanmamış: ${eksik.join(", ")}`);
    hint("npm run db:migrate ile uygulayın.");
  } else {
    ok(`${diskte.length} migration uygulanmış, eksik yok`);
  }
} catch (e) {
  no(`migration defteri okunamadı: ${e.message}`);
}

// Muhtar alanı kurulu mu?
try {
  const [m] = await sql`
    select
      (select count(*) from pg_tables where schemaname = 'public'
        and tablename in ('neighborhood_officials','announcements','report_official_replies'))::int as tablo,
      (select count(*) from pg_enum e join pg_type t on t.oid = e.enumtypid
        where t.typname = 'user_role' and e.enumlabel = 'muhtar')::int as rol`;
  if (m.tablo === 3 && m.rol === 1) {
    const [k] = await sql`select count(*)::int as adet from public.neighborhood_officials where is_active`;
    ok(`muhtar alanı kurulu — ${k.adet} görevli muhtar`);
  } else {
    no(`muhtar alanı eksik (${m.tablo}/3 tablo, muhtar rolü ${m.rol ? "var" : "yok"})`);
    hint("npm run db:migrate — ya da _kurulum/AYRA-MUHTAR.sql dosyasını Supabase SQL Editor'da çalıştırın.");
  }
} catch (e) {
  no(`muhtar alanı okunamadı: ${e.message}`);
}

try {
  if (sorunVar) {
    console.log("\n\x1b[33mYukarıdaki eksikleri giderin.\x1b[0m\n");
  } else {
    console.log("\n\x1b[32mHer şey hazır.\x1b[0m  npm run dev\n");
  }
} catch (e) {
  if (`${e.message}`.includes("does not exist")) {
    no("şema kurulmamış — AYRA tabloları yok");
    hint("Supabase → SQL Editor → supabase/AYRA-KURULUM.sql dosyasını yapıştırıp Run deyin.");
  } else {
    no(`şema okunamadı: ${e.message}`);
  }
  await sql.end({ timeout: 1 });
  process.exit(1);
}

await sql.end({ timeout: 1 });
