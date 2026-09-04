#!/usr/bin/env node
/**
 * AYRA · Geliştirme verisi
 *
 * Yalnızca yerel geliştirme ve ekran testi içindir. Ürettiği bildirimler
 * SENTETİKTİR; gerçek şikâyet değildir. Üretim veritabanında çalıştırmayın —
 * script NODE_ENV=production altında kendini durdurur.
 *
 *   node scripts/demo.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
for (const f of [".env.local", ".env"]) {
  const p = join(root, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

if (process.env.NODE_ENV === "production") {
  console.error("Bu script üretim ortamında çalıştırılamaz.");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });

// Ayrancılar Mahallesi merkezi (OpenStreetMap, Ağustos 2026). Eski değer
// 5-7 km batıda, Oğlananası civarındaydı; üretilen kayıtlar yanlış mahalleye
// düşüyordu. Seed'deki mahalle merkezleriyle aynı kaynak kullanılır.
const CENTER = { lat: 38.24936, lng: 27.27584 };
const jitter = (m) => (Math.random() - 0.5) * (m / 111_320) * 2;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const daysAgo = (d) => new Date(Date.now() - d * 86_400_000);

const SEEDS = [
  ["yol-cukuru",      "Değirmen Caddesi'nde derin çukur oluştu",                "Yağmurdan sonra çukur büyüdü, motosikletliler için tehlikeli."],
  ["kaldirim",        "İnönü Caddesi'nde kaldırım taşları sökülmüş",            "Bebek arabasıyla geçmek mümkün değil, yayalar yola iniyor."],
  ["sokak-lambasi",   "Şehit Fethi Sokak'ta iki lamba yanmıyor",                "Akşam saat 19'dan sonra sokak tamamen karanlık kalıyor."],
  ["karanlik-alan",   "Pazar yeri arkasındaki geçit karanlık",                  null],
  ["cop",             "Konteyner çevresine çöpler taşıyor",                     "Üç gündür alınmadı, koku çevredeki dükkânları etkiliyor."],
  ["konteyner",       "Atatürk Caddesi'ndeki konteynerin kapağı kırık",         null],
  ["durak",           "Otobüs durağının camı kırık ve oturma yeri yok",         "Yağmurda bekleyenler korumasız kalıyor."],
  ["toplu-ulasim",    "Sabah saatlerinde otobüs sıklığı yetersiz",              "07:30-08:30 arası araçlar dolu geçiyor, öğrenciler binemiyor."],
  ["trafik",          "Okul çıkışında hız kesici ihtiyacı var",                 "Araçlar yavaşlamıyor, çocuklar için risk oluşuyor."],
  ["kavsak",          "Kavşakta görüş mesafesini kapatan tabela var",           null],
  ["kanalizasyon",    "Rögar kapağı yerinden çıkmış",                           "Kapak açık kaldı, gece görülmüyor."],
  ["yagmur-suyu",     "Yağmurdan sonra su birikintisi çekilmiyor",              "Mazgal tıkalı görünüyor, su iki gün kalıyor."],
  ["su-arizasi",      "Cadde üzerinde su sızıntısı var",                        null],
  ["park-oyun-alani", "Parktaki salıncak zinciri kopmuş",                       "Çocuk parkındaki iki salıncak kullanılamıyor."],
  ["agac-bakim",      "Kuruyan ağaçlar budanmayı bekliyor",                     null],
  ["rampa",           "Sağlık ocağı girişinde engelli rampası yok",             "Tekerlekli sandalyeyle giriş mümkün değil."],
  ["kaldirim-isgali", "Kaldırıma park eden araçlar yürüyüşü engelliyor",        null],
  ["guvenlik",        "Boş arsada güvenlik çiti bulunmuyor",                    "Çocuklar inşaat alanına giriyor."],
  ["besleme-barinma", "Sokak hayvanları için su kabı ihtiyacı",                 null],
  ["acil-mudahale",   "Yaralı sokak kedisi için müdahale gerekiyor",            null],
  ["internet-telekom","Mahallede internet hattı sık kesiliyor",                 "Evden çalışanlar ve öğrenciler etkileniyor."],
  ["egitim",          "Okul çevresinde yaya geçidi çizgileri silinmiş",         null],
  ["saglik",          "Aile sağlığı merkezine ulaşım için durak uzak",          null],
  ["cevre-kirliligi", "Dere kenarına moloz dökülmüş",                           "Kamyonlar gece bırakıyor, alan büyüyor."],
  ["asfalt",          "Yol kaplaması yer yer kabarmış",                         null],
];

const FLOWS = [
  { weight: 26, steps: ["new"] },
  { weight: 18, steps: ["new", "verified"] },
  { weight: 22, steps: ["new", "verified", "forwarded"] },
  { weight: 12, steps: ["new", "verified", "forwarded", "in_review"] },
  { weight: 14, steps: ["new", "verified", "forwarded", "in_review", "resolved"] },
  { weight: 5,  steps: ["new", "verified", "forwarded", "awaiting_resolution"] },
  { weight: 3,  steps: ["new", "verified", "forwarded", "in_review", "unresolved"] },
];

function pickFlow() {
  const total = FLOWS.reduce((s, f) => s + f.weight, 0);
  let n = Math.random() * total;
  for (const f of FLOWS) { n -= f.weight; if (n <= 0) return f.steps; }
  return FLOWS[0].steps;
}

async function main() {
  const [{ count }] = await sql`select count(*)::int as count from public.reports`;
  if (count > 0) {
    console.log(`Veritabanında zaten ${count} bildirim var. Önce 'npm run db:reset' çalıştırın.`);
    return;
  }

  // Hesaplar
  const names = ["Mahalle sakini", "Ayrancılar sakini", "Komşu", "Yaya", "Bir vatandaş", "Veli", "Esnaf"];
  const users = [];
  for (let i = 0; i < 24; i++) {
    const [u] = await sql`
      insert into auth.users (id, is_anonymous, raw_user_meta_data, created_at)
      values (${randomUUID()}, true, ${sql.json({ display_name: `${pick(names)}` })}, now()) returning id`;
    users.push(u.id);
  }
  const salt = randomBytes(16);
  const adminPassword = "ayra-yonetim-2026";
  const hash = `scrypt$${salt.toString("base64")}$${scryptSync(adminPassword, salt, 64).toString("base64")}`;
  const [admin] = await sql`
    insert into auth.users (id, email, raw_user_meta_data, encrypted_password, created_at)
    values (${randomUUID()}, 'yonetim@ayra.local', ${sql.json({ display_name: "AYRA Moderasyon" })}, ${hash}, now())
    returning id`;
  await sql`update public.profiles set role = 'admin', display_name = 'AYRA Moderasyon' where id = ${admin.id}`;

  const authorities = await sql`select id, slug from public.authorities`;
  const authBySlug = Object.fromEntries(authorities.map((a) => [a.slug, a.id]));

  let created = 0;
  for (let i = 0; i < 44; i++) {
    const [slug, title, description] = pick(SEEDS);
    const [cat] = await sql`select id from public.report_categories where slug = ${slug}`;
    if (!cat) continue;

    const author = pick(users);
    const age = Math.floor(Math.random() * 150) + 1;
    const createdAt = daysAgo(age);

    const [report] = await sql`
      insert into public.reports (user_id, title, description, category_id, latitude, longitude, address, created_at)
      values (${author}, ${title}, ${description}, ${cat.id},
              ${CENTER.lat + jitter(1400)}, ${CENTER.lng + jitter(1800)},
              ${null}, ${createdAt})
      returning id`;

    // Destekler
    const supporters = [...new Set(Array.from({ length: Math.floor(Math.random() ** 2 * 60) + 1 }, () => pick(users)))];
    for (const u of supporters) {
      await sql`insert into public.report_supports (report_id, user_id, created_at)
                values (${report.id}, ${u}, ${daysAgo(Math.max(age - Math.random() * age, 0))})
                on conflict do nothing`;
    }

    // Yaşam döngüsü
    const flow = pickFlow();
    let prev = "new";
    let step = 0;
    for (const status of flow.slice(1)) {
      step += 1;
      const at = daysAgo(Math.max(age - step * (age / (flow.length + 1)), 0));
      if (status === "forwarded") {
        const authSlug = pick(["torbali-belediyesi", "izmir-buyuksehir-belediyesi", "gdz-elektrik", "izsu", "eshot"]);
        await sql`
          insert into public.authority_submissions (report_id, authority_id, channel, reference_no, submitted_by, submitted_at)
          values (${report.id}, ${authBySlug[authSlug]}, 'cimer',
                  ${"CIMER-2026-" + Math.floor(100000 + Math.random() * 899999)}, ${admin.id}, ${at})`;
      }
      await sql`
        insert into public.report_status_history (report_id, from_status, to_status, actor_id, created_at)
        values (${report.id}, ${prev}::public.report_status, ${status}::public.report_status, ${admin.id}, ${at})`;
      prev = status;
    }

    // Kuruma yanıt (bazılarına)
    if (["in_review", "resolved", "unresolved"].includes(prev) && Math.random() < 0.7) {
      await sql`
        update public.authority_submissions
           set response_at = ${daysAgo(Math.max(age / 3, 0))},
               response_text = 'Talebiniz ilgili birime iletilmiştir. Çalışma programına alınmıştır.',
               outcome = ${prev === "resolved" ? "resolved" : "in_progress"}
         where report_id = ${report.id}`;
    }

    created += 1;
  }

  await sql`select public.refresh_neighborhood_scores()`;
  const [stats] = await sql`select public.platform_stats() as s`;
  console.log(`${created} sentetik bildirim üretildi.`);
  console.log("İstatistik:", stats.s);
  console.log(`Yönetici hesabı: yonetim@ayra.local / ${adminPassword}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => sql.end());
