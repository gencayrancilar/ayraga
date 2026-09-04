#!/usr/bin/env node
/**
 * AYRA · Yönetici yetkisi verme
 *
 * Yeni kurulan bir sistemde ilk yöneticiyi belirlemek için. Kişi önce
 * uygulamada e-posta ile kayıt olur, sonra bu komut çalıştırılır:
 *
 *   node scripts/make-admin.mjs ornek@eposta.com
 *   node scripts/make-admin.mjs ornek@eposta.com moderator
 *
 * Roller: admin (her şey) · moderator (bildirim ve moderasyon, ayar yok)
 * Yetkiyi geri almak için: node scripts/make-admin.mjs ornek@eposta.com citizen
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const f of [".env.local", ".env"]) {
  const p = join(root, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const email = (process.argv[2] ?? "").trim().toLowerCase();
const role = (process.argv[3] ?? "admin").trim();

if (!email) {
  console.error("Kullanım: node scripts/make-admin.mjs <e-posta> [admin|moderator|citizen]");
  process.exit(1);
}
if (!["admin", "moderator", "citizen"].includes(role)) {
  console.error(`Geçersiz rol: ${role}. admin, moderator veya citizen olmalı.`);
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL tanımlı değil. .env.local dosyasını oluşturun.");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });

try {
  const [user] = await sql`select id from auth.users where lower(email) = ${email}`;
  if (!user) {
    console.error(
      `${email} bulunamadı.\n` +
      "Önce bu e-postayla uygulamada kayıt olun (Katıl → Kayıt), sonra komutu tekrar çalıştırın.",
    );
    process.exit(1);
  }

  const [profile] = await sql`
    update public.profiles set role = ${role}::public.user_role
     where id = ${user.id}
    returning display_name, role
  `;

  console.log(`${profile.display_name} (${email}) → ${profile.role}`);
  if (role !== "citizen") console.log("Yönetim paneli: /yonetim");
} catch (err) {
  console.error("HATA:", err.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
