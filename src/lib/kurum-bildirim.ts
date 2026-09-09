import "server-only";
import { withSystem } from "./db";
import { mailGonder, mailAcik } from "./mail";
import { publicConfig } from "./public-config";

/**
 * Kuruma bildirim.
 *
 * İki yol var:
 *   · acil    — bildirim kaydedilir kaydedilmez, tek sorun için
 *   · haftalık — her kuruma, o kuruma düşen ve henüz iletilmemiş sorunların listesi
 *
 * Gönderilen her şey outbound_messages'a yazılır. Başarılı gönderim ayrıca
 * authority_submissions'a işlenir: bildirimin durumu "iletildi"ye geçer,
 * kanıt zinciri halkası oluşur ve sessizlik sayacı başlar. Böylece "kuruma
 * ilettik" iddiasının arkasında hem gönderim kaydı hem zincir halkası durur.
 */

/**
 * Bir kuruma tek listede gönderilecek en fazla sorun sayısı.
 *
 * İlk gönderimde birikmiş her şey tek seferde gitmesin: kırk kalemlik bir
 * liste, ilk temas için okunmayan bir e-posta demektir. Liste en çok destek
 * görenden başlar; kalanlar sonraki haftaya devreder ve kaybolmaz.
 */
const LISTE_SINIRI = Number(process.env.KURUM_LISTE_SINIRI ?? 15);

const KOORDINAT = (lat: number, lng: number) =>
  `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;

type Sorun = {
  report_id: string; ref_code: string; slug: string; title: string;
  address: string | null; latitude: number; longitude: number;
  category: string; neighborhood: string; support_count: number;
  urgency: string; created_at: string;
};

function sorunSatiri(s: Sorun, sira?: number): string {
  const b: string[] = [];
  b.push(`${sira ? sira + ". " : ""}${s.title}  [${s.ref_code}]`);
  b.push(`   Kategori: ${s.category} · Mahalle: ${s.neighborhood}`);
  if (s.address) b.push(`   Adres: ${s.address}`);
  b.push(`   Konum: ${s.latitude.toFixed(6)}, ${s.longitude.toFixed(6)} — ${KOORDINAT(s.latitude, s.longitude)}`);
  if (s.support_count > 0) b.push(`   Bu sorunu ${s.support_count} kişi destekledi.`);
  b.push(`   Ayrıntı: ${publicConfig.siteUrl}/sorun/${s.slug}`);
  return b.join("\n");
}

const IMZA = [
  "",
  "—",
  "Bu bildirim, Genç Ayrancılar Derneği'nin yürüttüğü AYRA kent sorun takip",
  "platformundan gönderilmiştir. Sorunlar mahalle sakinleri tarafından",
  "bildirilmiş, konumlarıyla birlikte kayıt altına alınmıştır.",
  "",
  `Platform: ${publicConfig.siteUrl}`,
  "İletişim: info@ayraga.com",
  "",
  "Yanıtınızı bu adrese iletebilirsiniz; yanıt, ilgili bildirimin kamuya açık",
  "sayfasında yayımlanır ve bildirimi yapan kişiye iletilir.",
].join("\n");

/** Acil bir bildirimin metnini kurar. */
function acilMetin(s: Sorun): { subject: string; text: string } {
  return {
    subject: `ACİL BİLDİRİM — ${s.neighborhood}: ${s.title} [${s.ref_code}]`,
    text: [
      "Sayın Yetkili,",
      "",
      "Aşağıdaki sorun, AYRA platformuna acil olabilecek nitelikte bildirilmiştir.",
      "Bilginize sunulur.",
      "",
      sorunSatiri(s),
      "",
      `Bildirim zamanı: ${new Date(s.created_at).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul" })}`,
      "",
      "Not: Bu bir acil çağrı hattı değildir. Can ve mal güvenliğini ilgilendiren",
      "durumlarda bildirimi yapan kişiye 112'yi araması gerektiği de hatırlatılmıştır.",
      IMZA,
    ].join("\n"),
  };
}

function haftalikMetin(
  kurum: string,
  sorunlar: Sorun[],
  bekleyenToplam: number,
): { subject: string; text: string } {
  const acil = sorunlar.filter((s) => s.urgency === "acil");
  const bas: string[] = [
    "Sayın Yetkili,",
    "",
    `Aşağıda, ${kurum} görev alanına giren ve AYRA platformuna mahalle`,
    `sakinleri tarafından bildirilen ${sorunlar.length} sorun yer almaktadır.`,
    "Her kaydın konumu ve ayrıntı bağlantısı birlikte verilmiştir.",
    "",
  ];
  if (bekleyenToplam > sorunlar.length) {
    bas.push(
      `Bekleyen toplam ${bekleyenToplam} kayıttan, en çok destek gören ${sorunlar.length} tanesi`,
      "bu listeye alınmıştır; kalanlar sonraki listelerde iletilecektir.",
      "",
    );
  }
  if (acil.length) {
    bas.push(`Bu listenin ${acil.length} tanesi acil olabilecek nitelikte işaretlenmiştir.`, "");
  }
  const govde = sorunlar.map((s, i) => sorunSatiri(s, i + 1)).join("\n\n");
  return {
    subject: `AYRA haftalık bildirim listesi — ${sorunlar.length} sorun`,
    text: [...bas, govde, IMZA].join("\n"),
  };
}

type GonderimSonucu = {
  gonderildi: number; atlanan: number; hata: number; ayrinti: string[];
  /** Kilit başka bir çalışmadaydı: bu çağrı hiçbir şey göndermedi. */
  meshgul?: boolean;
};

/** Tek bir bildirimi ilgili kuruma iletir. Acil akışta kullanılır. */
export async function acilBildirimGonder(reportId: string): Promise<GonderimSonucu> {
  const ayrinti: string[] = [];

  const kayitlar = await withSystem(
    (tx) => tx`
      select r.id as report_id, r.ref_code, r.slug, r.title, r.address,
             r.latitude, r.longitude, r.support_count, r.urgency::text as urgency,
             r.created_at, c.name as category, coalesce(n.name, '—') as neighborhood,
             a.id as authority_id, a.name as authority_name, a.contact_email
        from public.reports r
        join public.report_categories c on c.id = r.category_id
        left join public.neighborhoods n on n.id = r.neighborhood_id
        left join public.authorities a on a.id = public.bildirim_kurumu(r.id)
       where r.id = ${reportId}
    `,
  );
  const k = kayitlar[0];
  if (!k) return { gonderildi: 0, atlanan: 0, hata: 1, ayrinti: ["Bildirim bulunamadı."] };

  const sorun = k as unknown as Sorun;
  const { subject, text } = acilMetin(sorun);
  const alici = (k.contact_email as string | null)?.trim();

  // Adres yoksa ya da posta kapalıysa kaydı yine de tutuyoruz: neyin
  // gönderilemediği görünmezse eksik sessizce birikir.
  if (!alici || !mailAcik()) {
    await withSystem((tx) => tx`
      insert into public.outbound_messages (kind, authority_id, report_id, recipients, subject, body, status, error)
      values ('acil', ${k.authority_id}, ${reportId}, '{}', ${subject}, ${text}, 'skipped',
              ${!alici ? "Kurumun e-posta adresi tanımlı değil" : "RESEND_API_KEY tanımlı değil"})
    `);
    return { gonderildi: 0, atlanan: 1, hata: 0,
      ayrinti: [!alici ? `${k.authority_name}: e-posta adresi yok` : "Posta gönderimi kapalı"] };
  }

  const sonuc = await mailGonder({ to: [alici], subject, text });

  await withSystem(async (tx) => {
    await tx`
      insert into public.outbound_messages
        (kind, authority_id, report_id, recipients, subject, body, status, provider_id, error, sent_at)
      values ('acil', ${k.authority_id}, ${reportId}, ${[alici]}, ${subject}, ${text},
              ${sonuc.ok ? "sent" : "failed"}, ${sonuc.ok ? sonuc.id : null},
              ${sonuc.ok ? null : sonuc.hata}, ${sonuc.ok ? new Date() : null})
    `;
    if (sonuc.ok) {
      await tx`
        insert into public.authority_submissions (report_id, authority_id, channel, submitted_at)
        values (${reportId}, ${k.authority_id}, 'email', now())
      `;
      // Başvuru kaydı zincire halka ekler ama durumu değiştirmez; durumu
      // değiştiren tek yer status_history'dir. "İletildi" damgası ve
      // sessizlik sayacı buradan başlar.
      await tx`
        insert into public.report_status_history (report_id, from_status, to_status, actor_id, note)
        select ${reportId}, r.status, 'forwarded', null,
               'Acil işaretlendiği için otomatik olarak kuruma iletildi.'
          from public.reports r
         where r.id = ${reportId} and r.status in ('new', 'verified')
      `;
    }
  });

  ayrinti.push(sonuc.ok ? `${k.authority_name}: gönderildi` : `${k.authority_name}: ${sonuc.hata}`);
  return { gonderildi: sonuc.ok ? 1 : 0, atlanan: 0, hata: sonuc.ok ? 0 : 1, ayrinti };
}

const KILIT = "haftalik_kurum_gonderimi";

/**
 * Tek bir kuruma, o kurum için onaylanmış sorunların listesini yollar.
 *
 * Gönderim bilerek kurum bazındadır ve elle tetiklenir. Tek düğmeyle bütün
 * kurumlara aynı anda posta çıkması, yanlış yönlendirilmiş bir bildirimi
 * fark etme şansını ortadan kaldırıyordu: yanlış kuruma giden yazı geri
 * alınamaz. Artık her kurumun listesi ayrı ayrı onaylanır ve ayrı gönderilir.
 *
 * Çalışma bir kilit altında yürür: aynı kuruma arka arkaya iki kez
 * basılırsa ikinci çağrı listeyi hiç okumadan geri döner.
 */
export async function kurumaGonderimYap(authorityId: string): Promise<GonderimSonucu> {
  const kilitAlindi = await withSystem(
    async (tx) => (await tx`select public.is_kilitle(${KILIT}) as ok`)[0]?.ok === true,
  );
  if (!kilitAlindi) {
    return { gonderildi: 0, atlanan: 0, hata: 0, meshgul: true,
             ayrinti: ["Başka bir gönderim sürüyor; bu çağrı hiçbir şey göndermedi."] };
  }

  try {
    return await gonderimiYurut(authorityId);
  } finally {
    await withSystem((tx) => tx`select public.is_kilidi_coz(${KILIT})`);
  }
}

async function gonderimiYurut(authorityId: string): Promise<GonderimSonucu> {
  const ayrinti: string[] = [];
  let gonderildi = 0, atlanan = 0, hata = 0;

  const kurumlar = await withSystem(
    (tx) => tx`
      select id, name, contact_email from public.authorities
       where is_active and id = ${authorityId}
    `,
  );
  if (!kurumlar.length) {
    return { gonderildi: 0, atlanan: 0, hata: 1, ayrinti: ["Kurum bulunamadı."] };
  }

  for (const kurum of kurumlar) {
    const bekleyen = (await withSystem(
      (tx) => tx`select * from public.kuruma_onaylilar(${kurum.id})`,
    )) as unknown as Sorun[];

    if (!bekleyen.length) { atlanan++; continue; }

    // Liste sıralı geldiği için ilk N kayıt, en çok destek görenlerdir.
    const sorunlar = bekleyen.slice(0, LISTE_SINIRI);
    const { subject, text } = haftalikMetin(kurum.name as string, sorunlar, bekleyen.length);
    const alici = (kurum.contact_email as string | null)?.trim();

    if (!alici || !mailAcik()) {
      await withSystem((tx) => tx`
        insert into public.outbound_messages (kind, authority_id, recipients, subject, body, status, error)
        values ('haftalik', ${kurum.id}, '{}', ${subject}, ${text}, 'skipped',
                ${!alici ? "Kurumun e-posta adresi tanımlı değil" : "RESEND_API_KEY tanımlı değil"})
      `);
      atlanan++;
      ayrinti.push(`${kurum.name}: ${bekleyen.length} sorun bekliyor ama ${!alici ? "adres yok" : "posta kapalı"}`);
      continue;
    }

    const sonuc = await mailGonder({ to: [alici], subject, text });

    await withSystem(async (tx) => {
      await tx`
        insert into public.outbound_messages
          (kind, authority_id, recipients, subject, body, status, provider_id, error, sent_at)
        values ('haftalik', ${kurum.id}, ${[alici]}, ${subject}, ${text},
                ${sonuc.ok ? "sent" : "failed"}, ${sonuc.ok ? sonuc.id : null},
                ${sonuc.ok ? null : sonuc.hata}, ${sonuc.ok ? new Date() : null})
      `;
      if (sonuc.ok) {
        for (const s of sorunlar) {
          await tx`
            insert into public.authority_submissions (report_id, authority_id, channel, submitted_at)
            values (${s.report_id}, ${kurum.id}, 'email', now())
          `;
          await tx`
            insert into public.report_status_history (report_id, from_status, to_status, actor_id, note)
            select ${s.report_id}, r.status, 'forwarded', null,
                   'Haftalık listeyle kuruma iletildi.'
              from public.reports r
             where r.id = ${s.report_id} and r.status in ('new', 'verified')
          `;
        }
      }
    });

    if (sonuc.ok) {
      gonderildi++;
      const devir = bekleyen.length - sorunlar.length;
      ayrinti.push(
        `${kurum.name}: ${sorunlar.length} sorun gönderildi` +
        (devir > 0 ? ` (${devir} kayıt sonraki listeye devredildi)` : ""),
      );
    }
    else { hata++; ayrinti.push(`${kurum.name}: ${sonuc.hata}`); }
  }

  return { gonderildi, atlanan, hata, ayrinti };
}
