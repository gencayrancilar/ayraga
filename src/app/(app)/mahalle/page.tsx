import type { Metadata } from "next";
import Link from "next/link";
import { getNeighborhoods } from "@/lib/queries/reference";
import { ScoreBar } from "@/components/score/ScoreDial";
import { scoreBand, formatNumber } from "@/lib/format";
import { IconArrowRight } from "@/components/icons";

export const metadata: Metadata = {
  title: "Mahalleler",
  description: "Ayrancılar ve Torbalı mahallelerinin AYRA skorları, açık ve çözülen sorun sayıları.",
};

export const dynamic = "force-dynamic";

export default async function NeighborhoodsPage() {
  const all = await getNeighborhoods();
  const withData = all.filter((n) => n.open_count + n.resolved_count > 0);
  const empty = all.filter((n) => n.open_count + n.resolved_count === 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-4 lg:py-6">
      <header className="mb-5">
        <h1 className="text-2xl font-semibold text-ink-900">Mahalleler</h1>
        <p className="mt-1 text-sm text-ink-600">
          AYRA Skoru, bir mahallede bildirilen sorunların ne kadarının çözüldüğünü ve ne
          hızda çözüldüğünü ölçer. Yalnızca platform üzerindeki doğrulanabilir veriden hesaplanır.
        </p>
      </header>

      <ul className="space-y-2.5">
        {withData.map((n) => {
          const band = n.score != null ? scoreBand(n.score) : null;
          return (
            <li key={n.id}>
              <Link
                href={`/mahalle/${n.slug}`}
                className="flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-line transition-shadow hover:shadow-raise"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-900">{n.name}</p>
                  <p className="mt-0.5 text-2xs text-ink-500">
                    {n.district_name} · {formatNumber(n.open_count)} açık · {formatNumber(n.resolved_count)} çözüldü
                  </p>
                  {n.score != null && band && (
                    <div className="mt-2 max-w-48">
                      <ScoreBar score={n.score} color={band.color} />
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  {n.score != null ? (
                    <>
                      <p className="text-2xl font-semibold tabular-nums text-ink-900">{n.score}</p>
                      <p className="text-2xs text-ink-400">/ 100</p>
                    </>
                  ) : (
                    <p className="text-2xs text-ink-400">Veri yok</p>
                  )}
                </div>
                <IconArrowRight size={16} className="shrink-0 text-ink-300" />
              </Link>
            </li>
          );
        })}
      </ul>

      {empty.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-ink-900">Henüz bildirim olmayan mahalleler</h2>
          <p className="mb-3 text-xs text-ink-500">
            Bu mahallelerde henüz bildirim yok; skor hesaplanmaz.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {empty.map((n) => (
              <span key={n.id} className="rounded-full bg-white px-2.5 py-1 text-2xs text-ink-500 ring-1 ring-line">
                {n.name}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
