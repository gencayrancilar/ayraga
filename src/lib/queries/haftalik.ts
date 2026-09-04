import "server-only";
import { withSystem } from "../db";

/**
 * Haftalık mahalle özeti.
 *
 * Dönem, tamamlanmış son haftadır (pazartesi–pazar): pazartesi sabahı
 * gönderildiğinde "geçen hafta" demek, yarım kalmış bir haftayı değil kapanmış
 * bir haftayı anlatır. Karşılaştırma da ondan bir önceki haftayladır.
 *
 * Metin WhatsApp'a yapıştırılmak üzere düz yazıdır: tablo, kalın harf,
 * markdown yok — hepsi orada bozuk görünür.
 */

export type HaftalikMadde = { baslik: string; slug: string; destek: number; gun: number | null };

export type HaftalikOzet = {
  mahalle_id: string;
  mahalle: string;
  slug: string;
  baslangic: string;
  bitis: string;
  yeni: number;
  onceki_yeni: number;
  cozulen: number;
  acik: number;
  geciken: number;
  en_eski_gecikme: number | null;
  destek: number;
  muhtar_yaniti: number;
  duyuru: number;
  one_cikanlar: HaftalikMadde[];
  bekleyenler: HaftalikMadde[];
};

/** Verilen mahalleler için geçen haftanın özeti. Boş dizi = tüm aktif mahalleler. */
export async function haftalikOzetler(mahalleIdleri?: string[]): Promise<HaftalikOzet[]> {
  const hepsi = !mahalleIdleri || mahalleIdleri.length === 0;

  return withSystem(async (tx) => {
    const satirlar = await tx<HaftalikOzet[]>`
      with sinir as (
        select date_trunc('week', now()) - interval '1 week' as bas,
               date_trunc('week', now())                    as bit
      ),
      kapsam as (
        select r.*, c.sla_days
          from public.reports r
          join public.report_categories c on c.id = r.category_id
         where not r.is_hidden and r.status not in ('rejected', 'duplicate')
      )
      select n.id as mahalle_id, n.name as mahalle, n.slug,
             (select bas from sinir)::date::text as baslangic,
             ((select bit from sinir) - interval '1 day')::date::text as bitis,
             count(k.id) filter (
               where k.created_at >= (select bas from sinir)
                 and k.created_at <  (select bit from sinir))::int as yeni,
             count(k.id) filter (
               where k.created_at >= (select bas from sinir) - interval '1 week'
                 and k.created_at <  (select bas from sinir))::int as onceki_yeni,
             count(k.id) filter (
               where k.resolved_at >= (select bas from sinir)
                 and k.resolved_at <  (select bit from sinir))::int as cozulen,
             count(k.id) filter (where k.status not in ('resolved', 'unresolved'))::int as acik,
             count(k.id) filter (
               where k.first_forwarded_at is not null and k.first_response_at is null
                 and k.status not in ('resolved', 'unresolved')
                 and k.first_forwarded_at < now() - make_interval(days => k.sla_days))::int as geciken,
             max(
               case when k.first_forwarded_at is not null and k.first_response_at is null
                     and k.status not in ('resolved', 'unresolved')
                     and k.first_forwarded_at < now() - make_interval(days => k.sla_days)
                    then extract(day from now() - k.first_forwarded_at)::int end
             ) as en_eski_gecikme,
             coalesce(sum(k.support_count) filter (
               where k.created_at >= (select bas from sinir)
                 and k.created_at <  (select bit from sinir)), 0)::int as destek,
             (select count(*) from public.report_official_replies o
                join public.reports r2 on r2.id = o.report_id
               where r2.neighborhood_id = n.id and not o.is_hidden
                 and o.created_at >= (select bas from sinir)
                 and o.created_at <  (select bit from sinir))::int as muhtar_yaniti,
             (select count(*) from public.announcements a
               where a.neighborhood_id = n.id and not a.is_hidden
                 and a.created_at >= (select bas from sinir)
                 and a.created_at <  (select bit from sinir))::int as duyuru,
             '[]'::jsonb as one_cikanlar,
             '[]'::jsonb as bekleyenler
        from public.neighborhoods n
        left join kapsam k on k.neighborhood_id = n.id
       where n.is_active
         and (${hepsi} or n.id = any(${mahalleIdleri ?? []}::uuid[]))
         and (${hepsi} is false or n.center_lat is not null)
       group by n.id, n.name, n.slug
       order by n.name
    `;

    // Listeler ayrı sorgulanır: tek sorguda toplama ile karıştırmak hem okunması
    // hem doğrulanması zor bir sorgu üretiyordu.
    for (const s of satirlar) {
      const [one, bek] = await Promise.all([
        tx<HaftalikMadde[]>`
          select r.title as baslik, r.slug, r.support_count as destek, null::int as gun
            from public.reports r
           where r.neighborhood_id = ${s.mahalle_id}
             and not r.is_hidden and r.status not in ('rejected', 'duplicate')
             and r.created_at >= date_trunc('week', now()) - interval '1 week'
             and r.created_at <  date_trunc('week', now())
           order by r.support_count desc, r.created_at desc
           limit 3`,
        tx<HaftalikMadde[]>`
          select r.title as baslik, r.slug, r.support_count as destek,
                 extract(day from now() - r.first_forwarded_at)::int as gun
            from public.reports r
            join public.report_categories c on c.id = r.category_id
           where r.neighborhood_id = ${s.mahalle_id}
             and not r.is_hidden and r.status not in ('rejected', 'duplicate', 'resolved', 'unresolved')
             and r.first_forwarded_at is not null and r.first_response_at is null
             and r.first_forwarded_at < now() - make_interval(days => c.sla_days)
           order by r.first_forwarded_at
           limit 3`,
      ]);
      s.one_cikanlar = one;
      s.bekleyenler = bek;
    }

    return satirlar;
  });
}

const AY = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function tarihAraligi(bas: string, bit: string): string {
  const b = new Date(bas);
  const s = new Date(bit);
  const ayB = AY[b.getUTCMonth()];
  const ayS = AY[s.getUTCMonth()];
  return ayB === ayS
    ? `${b.getUTCDate()}–${s.getUTCDate()} ${ayS}`
    : `${b.getUTCDate()} ${ayB} – ${s.getUTCDate()} ${ayS}`;
}

function fark(simdi: number, once: number): string {
  if (once === 0) return "";
  return simdi === once ? " (geçen haftayla aynı)" : ` (geçen hafta ${once})`;
}

/** Tek mahallenin WhatsApp'a yapıştırılabilir düz metin özeti. */
export function haftalikMetin(o: HaftalikOzet, siteUrl: string): string {
  const satir: string[] = [];
  satir.push(`AYRA · ${o.mahalle} Mahallesi`);
  satir.push(`${tarihAraligi(o.baslangic, o.bitis)} haftası`);
  satir.push("");

  if (o.yeni === 0 && o.cozulen === 0 && o.geciken === 0) {
    satir.push("Geçen hafta mahallenizde yeni bildirim olmadı.");
    satir.push("");
    satir.push(`Harita: ${siteUrl}/mahalle/${o.slug}`);
    return satir.join("\n");
  }

  satir.push(`• ${o.yeni} yeni bildirim${fark(o.yeni, o.onceki_yeni)}`);
  if (o.destek > 0) satir.push(`• Bu bildirimlere ${o.destek} destek geldi`);
  if (o.cozulen > 0) satir.push(`• ${o.cozulen} sorun çözüldü`);
  satir.push(`• Toplam ${o.acik} açık sorun var`);
  if (o.geciken > 0) {
    const ek = o.en_eski_gecikme ? ` — en eskisi ${o.en_eski_gecikme} gündür` : "";
    satir.push(`• ${o.geciken} sorun kurumda yanıt bekliyor${ek}`);
  }
  if (o.muhtar_yaniti > 0) satir.push(`• ${o.muhtar_yaniti} bildirime resmî yanıt yazıldı`);
  if (o.duyuru > 0) satir.push(`• ${o.duyuru} duyuru yayımlandı`);

  if (o.one_cikanlar.length) {
    satir.push("");
    satir.push("En çok destek görenler:");
    o.one_cikanlar.forEach((m, i) => {
      satir.push(`${i + 1}. ${m.baslik} — ${m.destek} destek`);
    });
  }

  if (o.bekleyenler.length) {
    satir.push("");
    satir.push("Kurumdan yanıt bekleyenler:");
    for (const m of o.bekleyenler) {
      satir.push(`• ${m.baslik} — ${m.gun} gündür yanıt yok`);
    }
  }

  satir.push("");
  satir.push(`Tümü: ${siteUrl}/mahalle/${o.slug}`);
  return satir.join("\n");
}

/** Derneğin tüm mahalleleri kapsayan özeti. */
export function dernekMetni(ozetler: HaftalikOzet[], siteUrl: string): string {
  if (!ozetler.length) return "Bu hafta için veri yok.";
  const ilk = ozetler[0];
  const satir: string[] = [];
  satir.push("AYRA · Haftalık özet");
  satir.push(`${tarihAraligi(ilk.baslangic, ilk.bitis)} haftası`);
  satir.push("");

  const toplam = ozetler.reduce(
    (a, o) => ({
      yeni: a.yeni + o.yeni,
      cozulen: a.cozulen + o.cozulen,
      geciken: a.geciken + o.geciken,
      destek: a.destek + o.destek,
    }),
    { yeni: 0, cozulen: 0, geciken: 0, destek: 0 },
  );
  satir.push(`Toplam ${toplam.yeni} yeni bildirim, ${toplam.destek} destek, ${toplam.cozulen} çözüm.`);
  if (toplam.geciken > 0) satir.push(`${toplam.geciken} sorun kurumda yanıt bekliyor.`);
  satir.push("");

  for (const o of ozetler) {
    const parcalar = [`${o.yeni} yeni`];
    if (o.cozulen > 0) parcalar.push(`${o.cozulen} çözüm`);
    if (o.geciken > 0) parcalar.push(`${o.geciken} bekleyen`);
    satir.push(`${o.mahalle}: ${parcalar.join(", ")}`);
  }

  satir.push("");
  satir.push(`Harita: ${siteUrl}`);
  return satir.join("\n");
}
