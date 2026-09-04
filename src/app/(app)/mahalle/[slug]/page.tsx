import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getNeighborhoodBySlug, getNeighborhoodScore } from "@/lib/queries/reference";
import { listReports } from "@/lib/queries/reports";
import { ScoreDial, ScoreBar } from "@/components/score/ScoreDial";
import { ReportCardItem } from "@/components/ReportCardItem";
import { CategoryIcon, IconInfo, IconArrowRight } from "@/components/icons";
import { CONFIDENCE_LABEL, formatNumber, pluralDays } from "@/lib/format";
import { publicConfig } from "@/lib/public-config";
import { mahalleDuyurulari, mahalleMuhtari } from "@/lib/queries/muhtar";
import { MahalleDuyurulari } from "@/components/muhtar/MahalleDuyurulari";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const n = await getNeighborhoodBySlug(slug);
  if (!n) return { title: "Mahalle bulunamadı" };
  return {
    title: `${n.name} Mahallesi`,
    description: `${n.name} Mahallesi (${n.district_name}, ${n.city_name}) için AYRA skoru, açık ve çözülen kent sorunları.`,
    alternates: { canonical: `/mahalle/${n.slug}` },
  };
}

export default async function NeighborhoodPage({ params }: Props) {
  const { slug } = await params;
  const neighborhood = await getNeighborhoodBySlug(slug);
  if (!neighborhood) notFound();

  const [score, recent, mostSupported, duyurular, muhtar] = await Promise.all([
    getNeighborhoodScore(neighborhood.id),
    listReports({ neighborhoodSlug: slug, sort: "newest", limit: 6 }),
    listReports({ neighborhoodSlug: slug, sort: "supported", limit: 4 }),
    mahalleDuyurulari(slug, 4),
    mahalleMuhtari(slug),
  ]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Place",
    name: `${neighborhood.name} Mahallesi`,
    address: {
      "@type": "PostalAddress",
      addressLocality: neighborhood.district_name,
      addressRegion: neighborhood.city_name,
      addressCountry: "TR",
    },
    url: `${publicConfig.siteUrl}/mahalle/${neighborhood.slug}`,
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-4 lg:py-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Link href="/mahalle" className="mb-3 inline-block text-xs font-medium text-ink-500 hover:text-ink-800">
        ← Mahalleler
      </Link>

      <header className="mb-5">
        <h1 className="text-2xl font-semibold text-ink-900">{neighborhood.name} Mahallesi</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          {neighborhood.district_name}, {neighborhood.city_name}
          {muhtar && (
            <>
              {" · "}
              <span className="text-ink-600">
                {muhtar.unvan}: {muhtar.ad}
              </span>
            </>
          )}
        </p>
      </header>

      <MahalleDuyurulari duyurular={duyurular} />

      {score.available ? (
        <>
          <section className="mb-4 rounded-2xl bg-white p-5 ring-1 ring-line">
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-7">
              <ScoreDial score={score.score} />
              <div className="min-w-0 flex-1 text-center sm:text-left">
                <h2 className="text-sm font-semibold text-ink-900">AYRA Skoru</h2>
                <p className="mt-1 text-xs leading-relaxed text-ink-600">
                  Son {score.window_days} günde bildirilen {formatNumber(score.total_reports)} sorunun
                  yükü, çözülme oranı ve çözüm hızından hesaplandı.
                </p>
                <div className="mt-2.5 flex flex-wrap justify-center gap-1.5 sm:justify-start">
                  <span className="rounded-full bg-surface-muted px-2.5 py-1 text-2xs font-medium text-ink-600">
                    {CONFIDENCE_LABEL[score.confidence] ?? score.confidence}
                  </span>
                  {score.population_estimated && (
                    <span className="rounded-full bg-[#fbf3e0] px-2.5 py-1 text-2xs font-medium text-[#7a5406]">
                      Nüfus verisi girilmedi — varsayılan kullanıldı
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="mb-4 rounded-2xl bg-white p-4 ring-1 ring-line sm:p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">Kategori kırılımı</h2>
            <ul className="space-y-3">
              {score.categories.map((c) => (
                <li key={c.category_id} className="flex items-center gap-3">
                  <span className="shrink-0" style={{ color: c.color }}>
                    <CategoryIcon name={c.icon} size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <Link href={`/kesfet?mahalle=${slug}&kategori=${c.slug}`} className="truncate text-xs font-medium text-ink-800 hover:underline">
                        {c.name}
                      </Link>
                      <span className="shrink-0 text-2xs tabular-nums text-ink-500">
                        {c.available ? `${c.score} / 100` : "veri yok"}
                      </span>
                    </div>
                    <div className="mt-1.5">
                      <ScoreBar score={c.available ? (c.score ?? 0) : 0} color={c.available ? c.color : "var(--color-line)"} />
                    </div>
                    {c.available && (
                      <p className="mt-1 text-2xs text-ink-500">
                        {formatNumber(c.open_count)} açık
                        {c.overdue_count ? ` (${formatNumber(c.overdue_count)} süresi geçmiş)` : ""}
                        {" · "}
                        {formatNumber(c.resolved_count)} çözüldü
                        {c.median_resolution_days != null && ` · medyan ${pluralDays(c.median_resolution_days)}`}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <details className="mt-4 border-t border-line pt-3">
              <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-ink-600">
                <IconInfo size={14} /> Skor nasıl hesaplanıyor?
              </summary>
              <div className="mt-2.5 space-y-2 text-xs leading-relaxed text-ink-600">
                <p>Her kategori için üç bileşen ölçülür ve ağırlıklandırılır:</p>
                <ul className="ml-4 list-disc space-y-1">
                  <li><strong className="font-medium text-ink-800">Yük (%40):</strong> Nüfusa oranla açık sorun sayısı. Çok desteklenen bir sorun, tek bir bildirimden daha ağır sayılır.</li>
                  <li><strong className="font-medium text-ink-800">Çözüm oranı (%35):</strong> Sonuçlanmış ve süresi geçmiş işler içinde çözülenlerin payı. Süresi henüz dolmamış açık bir sorun başarısızlık sayılmaz.</li>
                  <li><strong className="font-medium text-ink-800">Hız (%25):</strong> Medyan çözüm süresinin kategori hedefine oranı.</li>
                </ul>
                <p>
                  Verisi olmayan kategori hesaba katılmaz; yapay olarak 100 verilmez. Kategori ağırlıkları
                  kamu güvenliğine etkisine göre farklılaşır (örneğin güvenlik, internetten ağır sayılır).
                </p>
              </div>
            </details>
          </section>
        </>
      ) : (
        <section className="mb-4 rounded-2xl bg-white p-6 text-center ring-1 ring-line">
          <h2 className="text-sm font-semibold text-ink-900">Henüz skor hesaplanamıyor</h2>
          <p className="mx-auto mt-1 max-w-sm text-xs text-ink-600">
            Bu mahallede yeterli bildirim yok. İlk bildirimi yaparak mahallenizin durumunun
            ölçülebilir hâle gelmesine katkıda bulunabilirsiniz.
          </p>
          <Link href="/bildir" className="mt-4 inline-flex h-11 items-center rounded-xl bg-ink-900 px-4 text-sm font-medium text-white">
            Sorun bildir
          </Link>
        </section>
      )}

      {mostSupported.items.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-semibold text-ink-900">En çok desteklenenler</h2>
          <div className="space-y-2.5">
            {mostSupported.items.map((r) => <ReportCardItem key={r.id} report={r} compact />)}
          </div>
        </section>
      )}

      {recent.items.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-900">Son bildirimler</h2>
            <Link href={`/kesfet?mahalle=${slug}`} className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline">
              Tümü <IconArrowRight size={13} />
            </Link>
          </div>
          <div className="space-y-2.5">
            {recent.items.map((r) => <ReportCardItem key={r.id} report={r} />)}
          </div>
        </section>
      )}
    </div>
  );
}
