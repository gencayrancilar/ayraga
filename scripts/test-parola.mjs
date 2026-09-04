/**
 * Parola sıfırlamanın veritabanı düzeyindeki güvencelerini sınar.
 *
 * Uygulama katmanını atlayıp doğrudan SQL üzerinden çalışır: asıl güvence
 * sorguların kendisindedir. Sınananlar:
 *   · jeton tek kullanımlık mı
 *   · süresi dolmuş jeton kabul ediliyor mu
 *   · yeni istek eski bağlantıları düşürüyor mu
 *   · parola gerçekten değişiyor mu (eski parola artık geçmemeli)
 *   · ham jeton veritabanında hiç duruyor mu
 *
 * Test hesapları sonunda silinir.
 *
 *   node scripts/test-parola.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { createHash, randomBytes, randomUUID, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import postgres from "postgres";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const scrypt = promisify(_scrypt);
const sql = postgres(process.env.DATABASE_URL, { max: 3, onnotice: () => {} });

let pass = 0, fail = 0;
const ok = (ad) => { console.log("✓", ad); pass++; };
const no = (ad, not) => { console.log("✗", ad, "—", not); fail++; };
const bekle = (ad, kosul, not = "") => (kosul ? ok(ad) : no(ad, not));

const ozet = (j) => createHash("sha256").update(j).digest("hex");

async function parolaHash(p) {
  const tuz = randomBytes(16);
  return `scrypt$${tuz.toString("base64")}$${(await scrypt(p, tuz, 64)).toString("base64")}`;
}
async function parolaDogru(p, saklanan) {
  const [sema, tuz, hash] = saklanan.split("$");
  if (sema !== "scrypt") return false;
  const t = await scrypt(p, Buffer.from(tuz, "base64"), 64);
  const b = Buffer.from(hash, "base64");
  return t.length === b.length && timingSafeEqual(t, b);
}

/** Uygulamadaki tüketme sorgusunun birebir aynısı. */
async function jetonuTuket(jeton, yeniParola) {
  return sql.begin(async (tx) => {
    const [kayit] = await tx`
      update public.password_resets set used_at = now()
       where token_hash = ${ozet(jeton)} and used_at is null and expires_at > now()
      returning user_id
    `;
    if (!kayit) return null;
    const [k] = await tx`
      update auth.users set encrypted_password = ${await parolaHash(yeniParola)}
       where id = ${kayit.user_id} returning id
    `;
    await tx`update public.password_resets set used_at = now()
              where user_id = ${kayit.user_id} and used_at is null`;
    return k;
  });
}

async function jetonVer(userId, dakika = 60) {
  const jeton = randomBytes(32).toString("base64url");
  await sql`
    insert into public.password_resets (token_hash, user_id, expires_at)
    values (${ozet(jeton)}, ${userId}, ${new Date(Date.now() + dakika * 60_000)})
  `;
  return jeton;
}

const temizlik = [];

async function testHesabi() {
  const id = randomUUID();
  const email = `test-parola-${id.slice(0, 8)}@ayra.test`;
  await sql`
    insert into auth.users (id, email, encrypted_password, raw_user_meta_data, created_at)
    values (${id}, ${email}, ${await parolaHash("eskiParola123")},
            ${sql.json({ display_name: "Parola testi" })}, now())
  `;
  temizlik.push(id);
  return { id, email };
}

async function calistir() {
  console.log("\nParola sıfırlama sınaması\n");

  // 1 — Mutlu yol
  {
    const h = await testHesabi();
    const j = await jetonVer(h.id);
    const sonuc = await jetonuTuket(j, "yeniParola456");
    bekle("geçerli jeton parolayı değiştiriyor", sonuc !== null, "jeton kabul edilmedi");

    const [u] = await sql`select encrypted_password from auth.users where id = ${h.id}`;
    bekle("yeni parola geçiyor", await parolaDogru("yeniParola456", u.encrypted_password));
    bekle("eski parola artık geçmiyor", !(await parolaDogru("eskiParola123", u.encrypted_password)));
  }

  // 2 — Tek kullanımlık
  {
    const h = await testHesabi();
    const j = await jetonVer(h.id);
    await jetonuTuket(j, "birinci789");
    const ikinci = await jetonuTuket(j, "ikinci789");
    bekle("aynı jeton ikinci kez çalışmıyor", ikinci === null, "jeton tekrar kullanılabildi");

    const [u] = await sql`select encrypted_password from auth.users where id = ${h.id}`;
    bekle("ikinci deneme parolayı değiştirmedi", await parolaDogru("birinci789", u.encrypted_password));
  }

  // 3 — Süresi dolmuş jeton
  {
    const h = await testHesabi();
    const j = await jetonVer(h.id, -5); // beş dakika önce dolmuş
    const sonuc = await jetonuTuket(j, "olmamali123");
    bekle("süresi dolmuş jeton reddediliyor", sonuc === null, "süresi dolmuş jeton kabul edildi");
  }

  // 4 — Yeni istek eskileri düşürüyor
  {
    const h = await testHesabi();
    const eski = await jetonVer(h.id);
    await sql`update public.password_resets set used_at = now()
               where user_id = ${h.id} and used_at is null`;   // sifirlamaIste'nin yaptığı
    const yeni = await jetonVer(h.id);

    bekle("yeni istek eski bağlantıyı düşürüyor", (await jetonuTuket(eski, "olmamali")) === null);
    bekle("en son bağlantı çalışıyor", (await jetonuTuket(yeni, "sonuncu123")) !== null);
  }

  // 5 — Ham jeton saklanmıyor
  {
    const h = await testHesabi();
    const j = await jetonVer(h.id);
    const [v] = await sql`
      select count(*)::int as n from public.password_resets
       where token_hash = ${j} or token_hash like ${"%" + j.slice(0, 12) + "%"}
    `;
    bekle("ham jeton veritabanında yok", v.n === 0, "jetonun kendisi saklanmış");
    const [o] = await sql`select count(*)::int as n from public.password_resets where token_hash = ${ozet(j)}`;
    bekle("yalnızca özeti saklanıyor", o.n === 1);
  }

  // 6 — Takma adlı hesap sıfırlama alamaz
  {
    const id = randomUUID();
    await sql`insert into auth.users (id, is_anonymous, raw_user_meta_data, created_at)
              values (${id}, true, ${sql.json({ display_name: "Takma" })}, now())`;
    temizlik.push(id);
    const [k] = await sql`
      select id from auth.users
       where id = ${id} and coalesce(is_anonymous, false) = false
    `;
    bekle("takma adlı hesap sıfırlama sorgusuna düşmüyor", k === undefined);
  }

  // 7 — Temizlik fonksiyonu
  {
    const h = await testHesabi();
    await sql`
      insert into public.password_resets (token_hash, user_id, expires_at, created_at)
      values (${ozet("cok-eski-" + randomUUID())}, ${h.id}, now() - interval '30 days', now() - interval '30 days')
    `;
    const [t] = await sql`select public.parola_jetonlarini_temizle() as n`;
    bekle("eski kayıtlar temizleniyor", t.n >= 1, `silinen: ${t.n}`);
  }

  for (const id of temizlik) {
    await sql`delete from auth.users where id = ${id}`;
  }

  console.log(`\n${pass} geçti, ${fail} kaldı\n`);
  await sql.end();
  process.exit(fail ? 1 : 0);
}

calistir().catch(async (e) => {
  console.error("\nSınama çalışmadı:", e.message);
  for (const id of temizlik) {
    await sql`delete from auth.users where id = ${id}`.catch(() => {});
  }
  await sql.end();
  process.exit(1);
});
