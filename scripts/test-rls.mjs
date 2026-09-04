/**
 * RLS ve iş kuralı doğrulaması.
 *
 * Politikalar veritabanı düzeyinde uygulanır; bu testler uygulama katmanını
 * atlayıp doğrudan SQL üzerinden saldırır. Uygulamada bir hata olsa bile
 * veritabanının kendini savunması beklenir.
 *
 *   node scripts/_rls-test.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import postgres from "postgres";

for (const f of [".env.local", ".env"]) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const sql = postgres(process.env.DATABASE_URL, { max: 3, onnotice: () => {} });
// Kurulum ve temizlik için ayrı bağlantı: RLS işlemi süren bağlantı üzerinden
// yazmaya çalışmak (max:1 havuzda) kilitlenmeye yol açar.
const root = postgres(process.env.DATABASE_URL, { max: 2, onnotice: () => {} });

let pass = 0;
let fail = 0;
let createdReportId = null;

const expect = async (name, fn, shouldThrow = false) => {
  try {
    await fn();
    if (shouldThrow) { console.log("✗", name, "— engellenmesi gerekirken başarılı oldu"); fail++; }
    else { console.log("✓", name); pass++; }
  } catch (e) {
    if (shouldThrow) { console.log("✓", name, `— engellendi: ${String(e.message).slice(0, 55)}`); pass++; }
    else { console.log("✗", name, "—", String(e.message).slice(0, 130)); fail++; }
  }
};

/** Belirtilen rol ve kimlikle, tıpkı uygulamanın yaptığı gibi bir işlem açar. */
const as = (role, uid) => async (fn) =>
  sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${uid ? JSON.stringify({ sub: uid, role: "authenticated" }) : ""}, true)`;
    await tx`set local role ${sql.unsafe(role)}`;
    return fn(tx);
  });

const [citizen] = await root`select id from public.profiles where role='citizen' limit 1`;
const [other] = await root`select id from public.profiles where role='citizen' and id <> ${citizen.id} limit 1`;
const [admin] = await root`select id from public.profiles where role='admin' limit 1`;
const [report] = await root`select id, user_id, slug, status from public.reports where not is_hidden limit 1`;
const [cat] = await root`select id from public.report_categories where parent_id is null limit 1`;

console.log("\n— Okuma —");
await expect("anon yayındaki bildirimleri okuyabilir", () =>
  as("anon", null)(async (tx) => {
    const rows = await tx`select 1 from public.reports where not is_hidden limit 1`;
    if (!rows.length) throw new Error("okunamadı");
  }));
await expect("anon report_views tablosunu okuyamaz",
  () => as("anon", null)((tx) => tx`select * from public.report_views limit 1`), true);
await expect("anon rate_limits tablosunu okuyamaz",
  () => as("anon", null)((tx) => tx`select * from public.rate_limits limit 1`), true);

console.log("\n— Yazma —");
await expect("anon bildirim oluşturamaz", () =>
  as("anon", null)((tx) => tx`insert into public.reports (user_id, title, category_id, latitude, longitude)
    values (${citizen.id}, 'Anon deneme bildirimi', ${cat.id}, 38.23, 27.21)`), true);

await expect("kullanıcı başkasının adına bildirim oluşturamaz", () =>
  as("authenticated", citizen.id)((tx) => tx`insert into public.reports (user_id, title, category_id, latitude, longitude)
    values (${other.id}, 'Başkası adına bildirim', ${cat.id}, 38.23, 27.21)`), true);

await expect("kullanıcı kendi adına bildirim oluşturabilir", () =>
  as("authenticated", citizen.id)(async (tx) => {
    const [r] = await tx`insert into public.reports (user_id, title, category_id, latitude, longitude)
      values (${citizen.id}, 'RLS testi için oluşturulan bildirim', ${cat.id}, 38.2361, 27.2131) returning id`;
    createdReportId = r.id;
  }));
if (createdReportId) await root`delete from public.reports where id = ${createdReportId}`;

await expect("kullanıcı doğrudan 'resolved' durumunda bildirim açamaz", () =>
  as("authenticated", citizen.id)((tx) => tx`insert into public.reports (user_id, title, category_id, latitude, longitude, status)
    values (${citizen.id}, 'Sahte çözülmüş bildirim kaydı', ${cat.id}, 38.23, 27.21, 'resolved')`), true);

await expect("kullanıcı başkasının bildirimini düzenleyemez", () =>
  as("authenticated", other.id)(async (tx) => {
    const res = await tx`update public.reports set title = 'ele geçirildi' where id = ${report.id} returning id`;
    if (!res.length) throw new Error("satır güncellenmedi (RLS engelledi)");
  }), true);

await expect("vatandaş durum geçmişine yazamaz", () =>
  as("authenticated", citizen.id)((tx) => tx`insert into public.report_status_history (report_id, from_status, to_status)
    values (${report.id}, 'new', 'resolved')`), true);

await expect("moderatör durum geçmişine yazabilir", () =>
  as("authenticated", admin.id)(async (tx) => {
    const [h] = await tx`insert into public.report_status_history (report_id, from_status, to_status, actor_id)
      values (${report.id}, ${report.status}, 'verified', ${admin.id}) returning id`;
    if (!h) throw new Error("kayıt eklenmedi");
    throw new ROLLBACK();
  }).catch((e) => { if (!(e instanceof ROLLBACK)) throw e; }));

await expect("vatandaş kendi rolünü yükseltemez", () =>
  as("authenticated", citizen.id)(async (tx) => {
    const res = await tx`update public.profiles set role = 'admin' where id = ${citizen.id} returning id`;
    if (!res.length) throw new Error("satır güncellenmedi (RLS engelledi)");
  }), true);

await expect("vatandaş yetkili kurum ekleyemez", () =>
  as("authenticated", citizen.id)((tx) => tx`insert into public.authorities (name, slug) values ('Sahte Kurum', 'sahte-kurum')`), true);

await expect("vatandaş kategori ekleyemez", () =>
  as("authenticated", citizen.id)((tx) => tx`insert into public.report_categories (name, slug) values ('Sahte', 'sahte-kategori')`), true);

await expect("vatandaş skor ayarlarını değiştiremez", () =>
  as("authenticated", citizen.id)(async (tx) => {
    const res = await tx`update public.score_settings set value = 999 where key = 'ref_open_per_1k' returning key`;
    if (!res.length) throw new Error("satır güncellenmedi (RLS engelledi)");
  }), true);

console.log("\n— İş kuralları —");
await expect("aynı kullanıcı aynı sorunu iki kez destekleyemez", () =>
  as("authenticated", other.id)(async (tx) => {
    await tx`insert into public.report_supports (report_id, user_id) values (${report.id}, ${other.id}) on conflict do nothing`;
    await tx`insert into public.report_supports (report_id, user_id) values (${report.id}, ${other.id})`;
  }), true);

await expect("destek sayacı gerçek satır sayısıyla tutarlı", async () => {
  const rows = await root`
    select r.id, r.support_count,
           (select count(*)::int from public.report_supports s where s.report_id = r.id) as actual
      from public.reports r`;
  const bad = rows.filter((r) => Number(r.support_count) !== Number(r.actual));
  if (bad.length) throw new Error(`${bad.length} bildirimde sayaç tutarsız`);
});

await expect("kanıt zinciri değiştirilemez",
  () => root`update public.report_events set summary = 'sahte' where report_id = ${report.id}`, true);
await expect("kanıt zinciri silinemez",
  () => root`delete from public.report_events where report_id = ${report.id}`, true);

await expect("tüm bildirimlerin kanıt zinciri geçerli", async () => {
  const rows = await root`
    select r.id, (select bool_and(ok) from public.verify_report_chain(r.id)) as valid from public.reports r`;
  const broken = rows.filter((r) => r.valid === false);
  if (broken.length) throw new Error(`${broken.length} bozuk zincir`);
});

await expect("mükerrer tutarlılık kısıtı çalışıyor",
  () => root`update public.reports set status = 'duplicate' where id = ${report.id}`, true);

await expect("çok kısa başlık kabul edilmiyor", () =>
  as("authenticated", citizen.id)((tx) => tx`insert into public.reports (user_id, title, category_id, latitude, longitude)
    values (${citizen.id}, 'Kısa', ${cat.id}, 38.23, 27.21)`), true);

await expect("geçersiz koordinat kabul edilmiyor", () =>
  as("authenticated", citizen.id)((tx) => tx`insert into public.reports (user_id, title, category_id, latitude, longitude)
    values (${citizen.id}, 'Geçersiz koordinatlı bildirim', ${cat.id}, 999, 27.21)`), true);

console.log(`\n${pass} geçti, ${fail} başarısız`);
await sql.end();
await root.end();
process.exit(fail ? 1 : 0);

/** İşlemi geri almak için kullanılan iç sinyal. */
function ROLLBACK() {}
