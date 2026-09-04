import type { Metadata } from "next";
import Link from "next/link";
import { listReports, listRecentlyResolved, type ExploreSort } from "@/lib/queries/reports";
import { getCategoryTree, getNeighborhoods, getPlatformStats } from "@/lib/queries/reference";
import { ExploreFilters } from "@/components/explore/ExploreFilters";
import { ResolvedStrip } from "@/components/explore/ResolvedStrip";
import { NearbyBanner } from "@/components/explore/NearbyBanner";
import { ReportCardItem } from "@/components/ReportCardItem";
import { EmptyState } from "@/components/ui/Card";
import { IconCompass, IconArrowRight } from "@/components/icons";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = {
  title: "Keşfet",
  description: "Ayrancılar ve Torbalı'daki kent sorunlarını kategoriye, mahalleye ve duruma göre inceleyin.",
};

export const dynamic = "force-dynamic";

const SORTS: ExploreSort[] = ["newest", "supported", "nearest", "resolved", "longest_open"];

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const sort = (SORTS.includes(sp.sirala as ExploreSort) ? sp.sirala : "newest") as ExploreSort;
  const page = Math.max(Number(sp.sayfa ?? 1) || 1, 1);
  const limit = 20;

  const hasFilters = Boolean(sp.kategori || sp.mahalle || sp.q || sp.sirala);

  const [categories, neighborhoods, stats, resolved, result] = await Promise.all([
    getCategoryTree(),
    getNeighborhoods({ withReportsOnly: true }),
    getPlatformStats(),
    hasFilters ? Promise.resolve([]) : listRecentlyResolved(8),
    listReports({
      sort,
      categorySlug: sp.kategori ?? null,
      neighborhoodSlug: sp.mahalle ?? null,
      search: sp.q ?? null,
      lat: sp.lat ? Number(sp.lat) : null,
      lng: sp.lng ? Number(sp.lng) : null,
      limit,
      offset: (page - 1) * limit,
    }),
  ]);

  const totalPages = Math.ceil(result.total / limit);
  const query = new URLSearchParams(
    Object.entries(sp).filter(([k, v]) => v && k !== "sayfa") as [string, string][],
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-4 lg:py-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold text-ink-900">Keşfet</h1>
        <p className="mt-1 text-sm text-ink-600">
          {formatNumber(stats.total_reports)} bildirim · {formatNumber(stats.resolved_reports)} çözüldü ·{" "}
          {stats.avg_resolution_days != null
            ? `ortalama ${formatNumber(stats.avg_resolution_days)} günde`
            : "çözüm süresi henüz ölçülemedi"}
        </p>
      </header>

      {!hasFilters && (
        <div className="mb-4 space-y-3">
          <NearbyBanner />
          <ResolvedStrip
            items={resolved}
            resolvedThisMonth={stats.resolved_this_month}
            avgDays={stats.avg_resolution_days}
          />
        </div>
      )}

      <ExploreFilters
        categories={categories}
        neighborhoods={neighborhoods.map((n) => ({ slug: n.slug, name: n.name, open_count: n.open_count }))}
        autofocusSearch={sp.odak === "arama"}
      />

      <p className="mt-4 text-xs text-ink-500" aria-live="polite">
        {result.total > 0 ? `${formatNumber(result.total)} sonuç` : "Sonuç yok"}
      </p>

      <div className="mt-2 space-y-2.5">
        {result.items.length === 0 ? (
          <EmptyState
            icon={<IconCompass size={32} />}
            title="Bu filtrelerle bildirim bulunamadı"
            description="Filtreleri gevşetin veya bu sorunu ilk siz bildirin."
            action={
              <Link
                href="/bildir"
                className="inline-flex h-11 items-center rounded-xl bg-ink-900 px-4 text-sm font-medium text-white"
              >
                Sorun bildir
              </Link>
            }
          />
        ) : (
          result.items.map((report) => (
            <ReportCardItem key={report.id} report={report} showDistance={sort === "nearest"} />
          ))
        )}
      </div>

      {totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-between" aria-label="Sayfalama">
          {page > 1 ? (
            <Link
              href={`/kesfet?${query}&sayfa=${page - 1}`}
              className="inline-flex h-10 items-center rounded-xl bg-white px-4 text-sm font-medium text-ink-700 ring-1 ring-line"
            >
              Önceki
            </Link>
          ) : <span />}
          <span className="text-xs text-ink-500">{page} / {totalPages}</span>
          {page < totalPages ? (
            <Link
              href={`/kesfet?${query}&sayfa=${page + 1}`}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-white px-4 text-sm font-medium text-ink-700 ring-1 ring-line"
            >
              Sonraki <IconArrowRight size={15} />
            </Link>
          ) : <span />}
        </nav>
      )}
    </div>
  );
}
