#!/usr/bin/env node
/**
 * AYRA · Veritabanı yöneticisi
 *
 *   node scripts/db.mjs migrate   Bekleyen migration'ları uygular
 *   node scripts/db.mjs seed      Seed dosyalarını uygular (idempotent)
 *   node scripts/db.mjs reset     Şemayı sıfırlar, migrate + seed çalıştırır
 *   node scripts/db.mjs demo      Örnek bildirim verisi üretir (sadece geliştirme)
 *
 * Aynı dosyalar Supabase projesinde de çalışır:
 *   DATABASE_URL="postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres" node scripts/db.mjs migrate
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// .env.local'i yükle (Next.js dışında çalıştığımız için)
for (const f of [".env.local", ".env"]) {
  const p = join(root, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL tanımlı değil. .env.local dosyasını oluşturun.");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
const cmd = process.argv[2] ?? "migrate";

const filesIn = (dir) =>
  existsSync(join(root, dir))
    ? readdirSync(join(root, dir)).filter((f) => f.endsWith(".sql")).sort()
    : [];

async function ensureLedger() {
  await sql`create table if not exists public.schema_migrations (
    filename text primary key,
    applied_at timestamptz not null default now()
  )`;
}

async function migrate() {
  await ensureLedger();
  const applied = new Set(
    (await sql`select filename from public.schema_migrations`).map((r) => r.filename)
  );
  let n = 0;
  for (const f of filesIn("supabase/migrations")) {
    if (applied.has(f)) continue;
    process.stdout.write(`  ▸ ${f} `);
    const body = readFileSync(join(root, "supabase/migrations", f), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into public.schema_migrations (filename) values (${f})`;
    });
    console.log("✓");
    n++;
  }
  console.log(n ? `${n} migration uygulandı.` : "Tüm migration'lar güncel.");
}

async function seed() {
  for (const f of filesIn("supabase/seed")) {
    process.stdout.write(`  ▸ seed/${f} `);
    await sql.unsafe(readFileSync(join(root, "supabase/seed", f), "utf8"));
    console.log("✓");
  }
  const [{ count: nb }] = await sql`select count(*)::int from public.neighborhoods`;
  const [{ count: cat }] = await sql`select count(*)::int from public.report_categories`;
  console.log(`Seed tamam: ${nb} mahalle, ${cat} kategori.`);
}

async function reset() {
  console.log("Şema sıfırlanıyor…");
  await sql.unsafe(`
    drop schema if exists public cascade;
    create schema public;
    drop schema if exists auth cascade;
  `);
  await migrate();
  await seed();
}

try {
  if (cmd === "migrate") await migrate();
  else if (cmd === "seed") await seed();
  else if (cmd === "reset") await reset();
  else {
    console.error(`Bilinmeyen komut: ${cmd}`);
    process.exit(1);
  }
} catch (err) {
  console.error("\nHATA:", err.message);
  if (err.position) console.error("  pozisyon:", err.position);
  if (err.detail) console.error("  detay:", err.detail);
  if (err.hint) console.error("  ipucu:", err.hint);
  process.exitCode = 1;
} finally {
  await sql.end();
}
