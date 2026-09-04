#!/usr/bin/env node
/**
 * AYRA · Önceki sistemden kayıt aktarımı
 *
 * Genç Ayrancılar Derneği'nin Replit üzerindeki sorun haritasındaki kayıtları
 * AYRA'ya taşır. Veri scripts/aktarim/<kaynak>.json dosyasındadır; bu script
 * o dosyayı okur, kategoriyi ve mahalleyi çözer, kaydı özgün tarihiyle açar.
 *
 *   node scripts/aktar.mjs              → ne yapacağını yazar, hiçbir şey yazmaz
 *   node scripts/aktar.mjs --uygula     → aktarımı yapar
 *
 * Yeniden çalıştırmak güvenlidir: aktarılan her kaydın künyesi
 * public.legacy_reports tablosunda tutulur, ikinci çalıştırmada atlanır.
 *
 * Kayıtlar:
 *   · özgün tarihleriyle açılır (kanıt zinciri bu tarihi taşır),
 *   · "önceki sistemden aktarıldı" künyesiyle işaretlenir,
 *   · sahibi olarak derneğin aktarım hesabı görünür — kimse adına
 *     bildirim açılmaz, çünkü özgün kayıtlarda kişi bilgisi yok.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
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
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL tanımlı değil.");
  process.exit(1);
}

const KAYNAK      = "gencayrancilar-replit";
const KAYNAK_ADI  = "Genç Ayrancılar sorun haritası";
const HESAP_ADI   = "Genç Ayrancılar Derneği (önceki sistem)";
const HESAP_EPOSTA = "aktarim@gencayrancilar.org";

const uygula = process.argv.includes("--uygula");
const veri = JSON.parse(
  readFileSync(join(root, "scripts/aktarim/gencayrancilar.json"), "utf8"),
);

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

const trTarih = (iso) =>
  iso ? iso.split("-").reverse().join(".") : null;

/** Açıklama alanına yazılan künye: bildirimi okuyan kişi nereden geldiğini görsün. */
function kunye(k) {
  const satir = [
    `Bu bildirim önceki sistemden (${KAYNAK_ADI}) aktarıldı.`,
    k.tarih
      ? `Özgün kayıt no ${k.no}, ${trTarih(k.tarih)} tarihinde bildirilmişti.`
      : `Özgün kayıt no ${k.no}; bildirim tarihi kaynakta okunamadı.`,
  ];
  return satir.join(" ");
}

async function main() {
  // ── Aktarım hesabı ────────────────────────────────────────────────────────
  let [hesap] = await sql`select id from auth.users where email = ${HESAP_EPOSTA}`;
  if (!hesap) {
    if (!uygula) {
      console.log(`Aktarım hesabı oluşturulacak: ${HESAP_ADI} <${HESAP_EPOSTA}>`);
    } else {
      // id ve created_at açıkça veriliyor: Supabase'de auth.users bu sütunlara
      // varsayılan tanımlamaz. encrypted_password yok — bu hesapla giriş yapılamaz.
      [hesap] = await sql`
        insert into auth.users (id, email, raw_user_meta_data, created_at)
        values (${randomUUID()}, ${HESAP_EPOSTA},
                ${sql.json({ display_name: HESAP_ADI })}, now())
        returning id`;
    }
  }
  if (uygula) {
    // Profil tetikleyicisi Supabase'de kurulamamış olabilir; garantiye alıyoruz.
    await sql`
      insert into public.profiles (id, display_name, is_anonymous)
      values (${hesap.id}, ${HESAP_ADI}, false)
      on conflict (id) do update set display_name = excluded.display_name`;
  }

  // ── Kategoriler ───────────────────────────────────────────────────────────
  const kategoriler = Object.fromEntries(
    (await sql`select id, slug from public.report_categories`).map((c) => [c.slug, c.id]),
  );
  const eksik = [...new Set(veri.map((k) => k.kategori))].filter((s) => !kategoriler[s]);
  if (eksik.length) {
    console.error("Veritabanında bulunmayan kategori:", eksik.join(", "));
    process.exit(1);
  }

  // ── Daha önce aktarılanlar ────────────────────────────────────────────────
  const aktarilmis = new Set(
    (await sql`select source_no from public.legacy_reports where source_system = ${KAYNAK}`)
      .map((r) => r.source_no),
  );

  const bekleyen = veri.filter((k) => !aktarilmis.has(k.no));
  console.log(`Kaynak dosyada ${veri.length} kayıt var.`);
  if (aktarilmis.size) console.log(`${aktarilmis.size} tanesi daha önce aktarılmış, atlanacak.`);
  console.log(`${bekleyen.length} kayıt aktarılacak.\n`);

  if (!uygula) {
    for (const k of bekleyen) {
      const mahalle = await sql`
        select name from public.neighborhoods
        where id = public.resolve_neighborhood(${k.lat}, ${k.lng})`;
      console.log(
        `  #${String(k.no).padStart(2)} ${trTarih(k.tarih) ?? "tarihsiz  "}  ` +
        `${k.kategori.padEnd(18)} ${(mahalle[0]?.name ?? "?").padEnd(14)} ${k.baslik}`,
      );
    }
    console.log("\nDeneme çalıştırması. Uygulamak için: node scripts/aktar.mjs --uygula");
    return;
  }

  let n = 0;
  for (const k of bekleyen) {
    const tarih = k.tarih ? new Date(`${k.tarih}T09:00:00+03:00`) : new Date("2026-03-23T09:00:00+03:00");

    await sql.begin(async (tx) => {
      const [rapor] = await tx`
        insert into public.reports
          (user_id, title, description, category_id, latitude, longitude, address, created_at, updated_at)
        values
          (${hesap.id}, ${k.baslik}, ${kunye(k)}, ${kategoriler[k.kategori]},
           ${k.lat}, ${k.lng}, ${k.adres}, ${tarih}, ${tarih})
        returning id, ref_code`;

      // Durum geçmişi: 'new' halkasını insert tetikleyicisi zaten yazdı.
      // Üstüne özgün durumu, yine özgün tarihle ekliyoruz.
      const adimlar = k.durum === "resolved" ? ["verified", "resolved"] : ["verified"];
      let onceki = "new";
      for (const durum of adimlar) {
        await tx`
          insert into public.report_status_history
            (report_id, from_status, to_status, actor_id, note, created_at)
          values (${rapor.id}, ${onceki}::public.report_status, ${durum}::public.report_status,
                  ${hesap.id},
                  ${durum === "resolved"
                      ? "Önceki sistemde çözüldü olarak kapatılmıştı."
                      : "Önceki sistemden aktarıldı; kayıt derneğin haritasında doğrulanmıştı."},
                  ${tarih})`;
        onceki = durum;
      }

      await tx`
        insert into public.legacy_reports
          (source_system, source_no, report_id, source_date, source_note)
        values (${KAYNAK}, ${k.no}, ${rapor.id}, ${k.tarih}, ${k.kunyeNotu})`;

      n += 1;
      console.log(`  ✓ ${rapor.ref_code}  #${k.no}  ${k.baslik}`);
    });
  }

  // Durum geçmişi eklenince reports.updated_at tetikleyici tarafından now()
  // yapılıyor; oysa bu kayıtlar aktarımdan ibaret, içerikleri bugün
  // değişmedi. "Son güncelleme az önce" demek yanlış olurdu — ayrıca
  // sitemap lastModified ve schema.org dateModified bu alandan besleniyor.
  // Tetikleyiciyi yalnızca bu düzeltme için kısa süreliğine devre dışı
  // bırakıyoruz; kanıt zincirine dokunan tetikleyiciler yerinde kalıyor.
  if (n > 0) {
    await sql`alter table public.reports disable trigger trg_reports_before_write`;
    try {
      await sql`
        update public.reports r set updated_at = r.created_at
          from public.legacy_reports l
         where l.report_id = r.id and l.source_system = ${KAYNAK}
           and r.updated_at <> r.created_at`;
    } finally {
      await sql`alter table public.reports enable trigger trg_reports_before_write`;
    }
  }

  await sql`select public.refresh_neighborhood_scores()`;
  console.log(`\n${n} kayıt aktarıldı.`);

  const [ozet] = await sql`
    select count(*)::int as toplam,
           count(*) filter (where status = 'resolved')::int as cozulen,
           min(created_at)::date as en_eski,
           max(created_at)::date as en_yeni
      from public.reports r
      join public.legacy_reports l on l.report_id = r.id
     where l.source_system = ${KAYNAK}`;
  console.log("Aktarılan:", ozet);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => sql.end());
