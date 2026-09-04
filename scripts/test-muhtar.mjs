/**
 * Muhtar alanının veritabanı düzeyindeki yetki sınırlarını sınar.
 *
 * Uygulama katmanını atlayıp doğrudan SQL üzerinden saldırır: uygulamada bir
 * hata olsa bile veritabanının kendini savunması beklenir.
 *
 *   DATABASE_URL=... node scripts/test-muhtar.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import postgres from "postgres";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const sql = postgres(process.env.DATABASE_URL, { max: 3, onnotice: () => {} });
const root = postgres(process.env.DATABASE_URL, { max: 2, onnotice: () => {} });

let pass = 0, fail = 0;
const expect = async (name, fn, shouldThrow = false) => {
  try {
    await fn();
    if (shouldThrow) { console.log("✗", name, "— engellenmesi gerekirken başarılı oldu"); fail++; }
    else { console.log("✓", name); pass++; }
  } catch (e) {
    if (shouldThrow) { console.log("✓", name, `— engellendi: ${String(e.message).slice(0, 50)}`); pass++; }
    else { console.log("✗", name, "—", String(e.message).slice(0, 140)); fail++; }
  }
};
const as = (role, uid) => async (fn) =>
  sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${uid ? JSON.stringify({ sub: uid, role: "authenticated" }) : ""}, true)`;
    await tx`set local role ${sql.unsafe(role)}`;
    return fn(tx);
  });

async function hesap(ad) {
  const id = randomUUID();
  await root`insert into auth.users (id, is_anonymous, raw_user_meta_data, created_at)
             values (${id}, true, ${root.json({ display_name: ad })}, now())`;
  await root`insert into public.profiles (id, display_name, is_anonymous)
             values (${id}, ${ad}, true) on conflict (id) do nothing`;
  return id;
}

// ── Kurulum ────────────────────────────────────────────────────────────────
const [mahalleA] = await root`select id, name from public.neighborhoods where slug = 'ayrancilar'`;
const [mahalleB] = await root`select id, name from public.neighborhoods where slug = 'inonu'`;
const [kategori] = await root`select id from public.report_categories where slug = 'yol-cukuru'`;

const muhtarA = await hesap("Test Muhtar A");
const vatandas = await hesap("Test Vatandaş");
await root`update public.profiles set role = 'muhtar' where id = ${muhtarA}`;
await root`insert into public.neighborhood_officials (neighborhood_id, profile_id)
           values (${mahalleA.id}, ${muhtarA}) on conflict do nothing`;

const [bildirimA] = await root`
  insert into public.reports (user_id, title, category_id, latitude, longitude, neighborhood_id)
  values (${vatandas}, 'A mahallesinde test çukuru', ${kategori.id}, 38.2494, 27.2758, ${mahalleA.id})
  returning id`;
const [bildirimB] = await root`
  insert into public.reports (user_id, title, category_id, latitude, longitude, neighborhood_id)
  values (${vatandas}, 'B mahallesinde test çukuru', ${kategori.id}, 38.2353, 27.2742, ${mahalleB.id})
  returning id`;

console.log("\n— Duyurular —");
await expect("muhtar kendi mahallesine duyuru yazabilir", () =>
  as("authenticated", muhtarA)((tx) => tx`
    insert into public.announcements (neighborhood_id, author_id, kind, title, body)
    values (${mahalleA.id}, ${muhtarA}, 'kesinti', 'Salı günü su kesintisi', 'Salı 09:00-15:00 arası şebeke bakımı yapılacaktır.')`));

await expect("muhtar başka mahalleye duyuru yazamaz", () =>
  as("authenticated", muhtarA)((tx) => tx`
    insert into public.announcements (neighborhood_id, author_id, kind, title, body)
    values (${mahalleB.id}, ${muhtarA}, 'duyuru', 'Başka mahalleye duyuru', 'Buraya yazmaya yetkim yok.')`), true);

await expect("muhtar başkasının adına duyuru yazamaz", () =>
  as("authenticated", muhtarA)((tx) => tx`
    insert into public.announcements (neighborhood_id, author_id, kind, title, body)
    values (${mahalleA.id}, ${vatandas}, 'duyuru', 'Başkası adına duyuru', 'Yazar alanını başkası yaptım.')`), true);

await expect("vatandaş duyuru yazamaz", () =>
  as("authenticated", vatandas)((tx) => tx`
    insert into public.announcements (neighborhood_id, author_id, kind, title, body)
    values (${mahalleA.id}, ${vatandas}, 'duyuru', 'Vatandaş duyurusu', 'Bunu yazamamam gerekir.')`), true);

await expect("muhtar duyurusunu kendisi gizleyemez", () =>
  as("authenticated", muhtarA)((tx) => tx`
    update public.announcements set is_hidden = true, hidden_reason = 'kendim gizledim'
     where author_id = ${muhtarA}`), true);

await expect("anon yayındaki duyuruyu okuyabilir", () =>
  as("anon", null)(async (tx) => {
    const r = await tx`select 1 from public.announcements where not is_hidden limit 1`;
    if (!r.length) throw new Error("okunamadı");
  }));

const [gizli] = await root`
  insert into public.announcements (neighborhood_id, author_id, title, body, is_hidden, hidden_reason)
  values (${mahalleA.id}, ${muhtarA}, 'Gizlenmiş duyuru', 'Dernek bunu kaldırdı.', true, 'kural dışı')
  returning id`;
// Burada beklenen davranış "hata" değil, "hiç satır dönmemesi": RLS okumayı
// engellemez, süzer. O yüzden satır gelirse testin kendisi hata fırlatır.
await expect("anon gizlenmiş duyuruyu göremez", () =>
  as("anon", null)(async (tx) => {
    const r = await tx`select 1 from public.announcements where id = ${gizli.id}`;
    if (r.length) throw new Error("gizli duyuru okundu");
  }));

await expect("vatandaş gizlenmiş duyuruyu göremez", () =>
  as("authenticated", vatandas)(async (tx) => {
    const r = await tx`select 1 from public.announcements where id = ${gizli.id}`;
    if (r.length) throw new Error("gizli duyuru okundu");
  }));

console.log("\n— Resmî yanıt —");
await expect("muhtar kendi mahallesindeki bildirime yanıt yazabilir", () =>
  as("authenticated", muhtarA)((tx) => tx`
    insert into public.report_official_replies (report_id, author_id, body, reference_no)
    values (${bildirimA.id}, ${muhtarA}, 'Konuyu belediye fen işlerine ilettim.', 'FEN-2026-114')`));

await expect("muhtar başka mahalledeki bildirime yanıt yazamaz", () =>
  as("authenticated", muhtarA)((tx) => tx`
    insert into public.report_official_replies (report_id, author_id, body)
    values (${bildirimB.id}, ${muhtarA}, 'Bu benim mahallem değil ama yazıyorum.')`), true);

await expect("vatandaş resmî yanıt yazamaz", () =>
  as("authenticated", vatandas)((tx) => tx`
    insert into public.report_official_replies (report_id, author_id, body)
    values (${bildirimA.id}, ${vatandas}, 'Ben muhtar değilim ama resmî yanıt yazıyorum.')`), true);

console.log("\n— Durum değiştirme (muhtarın yetkisi yok) —");
await expect("muhtar bildirimi çözüldü işaretleyemez", () =>
  as("authenticated", muhtarA)((tx) => tx`
    insert into public.report_status_history (report_id, from_status, to_status, actor_id)
    values (${bildirimA.id}, 'new', 'resolved', ${muhtarA})`), true);

// RLS'de USING süzgecine takılan bir UPDATE hata vermez, sıfır satır günceller.
// Bu yüzden hatanın yokluğuna değil, kaydın gerçekten değişmemiş olmasına bakıyoruz.
await expect("muhtar bildirimin durumunu değiştiremez", async () => {
  await as("authenticated", muhtarA)((tx) => tx`
    update public.reports set status = 'resolved' where id = ${bildirimA.id}`).catch(() => {});
  const [r] = await root`select status from public.reports where id = ${bildirimA.id}`;
  if (r.status === "resolved") throw new Error("durum değişti");
});

await expect("muhtar bildirimi gizleyemez", async () => {
  await as("authenticated", muhtarA)((tx) => tx`
    update public.reports set is_hidden = true, hidden_reason = 'muhtar gizledi'
     where id = ${bildirimA.id}`).catch(() => {});
  const [r] = await root`select is_hidden from public.reports where id = ${bildirimA.id}`;
  if (r.is_hidden) throw new Error("bildirim gizlendi");
});

await expect("muhtar başkasının bildirim metnini değiştiremez", async () => {
  await as("authenticated", muhtarA)((tx) => tx`
    update public.reports set title = 'Muhtar başlığı değiştirdi' where id = ${bildirimA.id}`).catch(() => {});
  const [r] = await root`select title from public.reports where id = ${bildirimA.id}`;
  if (r.title === "Muhtar başlığı değiştirdi") throw new Error("başlık değişti");
});

await expect("muhtar kendini başka mahalleye atayamaz", () =>
  as("authenticated", muhtarA)((tx) => tx`
    insert into public.neighborhood_officials (neighborhood_id, profile_id)
    values (${mahalleB.id}, ${muhtarA})`), true);

await expect("muhtar kendi rolünü yükseltemez", () =>
  as("authenticated", muhtarA)((tx) => tx`
    update public.profiles set role = 'admin' where id = ${muhtarA}`), true);

console.log("\n— Kanıt zinciri —");
await expect("resmî yanıt zincire işlendi", async () => {
  const r = await root`select 1 from public.report_events
    where report_id = ${bildirimA.id} and event_type = 'official_reply'`;
  if (!r.length) throw new Error("zincirde official_reply olayı yok");
});
await expect("zincir bozulmadı", async () => {
  const [r] = await root`select bool_and(v.ok) as ok from public.reports r
    cross join lateral public.verify_report_chain(r.id) v`;
  if (!r.ok) throw new Error("zincir bozuk");
});

// ── Temizlik ───────────────────────────────────────────────────────────────
await root`delete from public.reports where id in (${bildirimA.id}, ${bildirimB.id})`;
await root`delete from public.announcements where author_id = ${muhtarA}`;
await root`delete from auth.users where id in (${muhtarA}, ${vatandas})`;

console.log(`\n${pass} geçti, ${fail} kaldı.`);
await sql.end(); await root.end();
process.exitCode = fail ? 1 : 0;
