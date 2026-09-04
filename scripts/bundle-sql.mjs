#!/usr/bin/env node
/**
 * AYRA · Tek dosyalık kurulum SQL'i
 *
 * Bütün migration'ları ve başlangıç verisini sırayla birleştirip
 * supabase/AYRA-KURULUM.sql dosyasına yazar. Bu dosya Supabase panelindeki
 * SQL Editor'e yapıştırılıp bir kerede çalıştırılabilir; terminale ve
 * DATABASE_URL'e gerek kalmaz.
 *
 * Dosya sonunda schema_migrations tablosu doldurulur; böylece ileride
 * `npm run db:migrate` çalıştırıldığında aynı migration'lar tekrar
 * uygulanmaya çalışılmaz.
 *
 *   node scripts/bundle-sql.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "supabase/migrations");
const seedDir = join(root, "supabase/seed");
const out = join(root, "supabase/AYRA-KURULUM.sql");

const migrations = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
const seeds = readdirSync(seedDir).filter((f) => f.endsWith(".sql")).sort();

const rule = (text) =>
  `\n-- ${"═".repeat(74)}\n-- ${text}\n-- ${"═".repeat(74)}\n\n`;

let sql = `-- ═══════════════════════════════════════════════════════════════════════════
-- AYRA · Tek dosyalık kurulum
--
-- Bu dosya ${migrations.length} migration ve ${seeds.length} başlangıç verisi dosyasının
-- birleşimidir. Supabase panelinde SQL Editor'e yapıştırıp "Run" demeniz
-- yeterlidir; sıra önemlidir, dosyayı bölmeyin.
--
-- Üretilme tarihi: ${new Date().toISOString().slice(0, 10)}
--
-- Ne kurar:
--   · Konum hiyerarşisi (Türkiye → İzmir → Torbalı → 60 mahalle)
--   · 12 ana + 21 alt kategori, ağırlık ve hedef süreleriyle
--   · 12 yetkili kurum ve kategori eşlemesi
--   · Bildirim, destek, medya, durum geçmişi ve kanıt zinciri tabloları
--   · Tüm tablolarda Row Level Security politikaları
--   · AYRA Skoru hesaplama fonksiyonları
--
-- Ne KURMAZ: örnek/sahte bildirim verisi. Sistem boş bir haritayla açılır.
-- ═══════════════════════════════════════════════════════════════════════════
`;

for (const file of migrations) {
  sql += rule(`MIGRATION ${file}`);
  sql += readFileSync(join(migrationsDir, file), "utf8").trimEnd() + "\n";
}

for (const file of seeds) {
  sql += rule(`SEED ${file}`);
  sql += readFileSync(join(seedDir, file), "utf8").trimEnd() + "\n";
}

sql += rule("MIGRATION DEFTERİ — bunlar uygulandı olarak işaretlenir");
sql += `create table if not exists public.schema_migrations (
  filename text primary key,
  applied_at timestamptz not null default now()
);

insert into public.schema_migrations (filename) values
${migrations.map((f) => `  ('${f}')`).join(",\n")}
on conflict (filename) do nothing;
`;

sql += rule("KURULUM TAMAMLANDI");
sql += `do $$
declare
  v_nbhd int;
  v_cat  int;
  v_auth int;
begin
  select count(*) into v_nbhd from public.neighborhoods;
  select count(*) into v_cat  from public.report_categories;
  select count(*) into v_auth from public.authorities;
  raise notice 'AYRA kurulumu tamam: % mahalle, % kategori, % kurum.', v_nbhd, v_cat, v_auth;
end $$;

select
  (select count(*) from public.neighborhoods)     as mahalle,
  (select count(*) from public.report_categories) as kategori,
  (select count(*) from public.authorities)       as kurum,
  (select count(*) from public.schema_migrations) as migration;
`;

writeFileSync(out, sql);
const kb = (Buffer.byteLength(sql) / 1024).toFixed(0);
console.log(`supabase/AYRA-KURULUM.sql yazıldı — ${migrations.length} migration + ${seeds.length} seed, ${kb} KB`);
