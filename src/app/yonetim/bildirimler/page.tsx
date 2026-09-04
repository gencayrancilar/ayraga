import type { Metadata } from "next";
import Link from "next/link";
import { adminListReports } from "@/lib/queries/admin";
import { getCategoryTree, getNeighborhoods } from "@/lib/queries/reference";
import { AdminReportFilters } from "@/components/admin/AdminReportFilters";
import { StatusBadge } from "@/components/ui/Badge";
import { CategoryIcon, IconArrowRight, IconFlag } from "@/components/icons";
import { formatDate, formatNumber, formatElapsed } from "@/lib/format";
import type { ReportStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Bildirimler · Yönetim", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const page = Math.max(Number(sp.sayfa ?? 1) || 1, 1);
  const limit = 40;

  const [categories, neighborhoods, result] = await Promise.all([
    getCategoryTree(),
    getNeighborhoods({ withReportsOnly: true }),
    adminListReports({
      status: sp.durum ? (sp.durum.split(",") as ReportStatus[]) : null,
      categorySlug: sp.kategori ?? null,
      neighborhoodSlug: sp.mahalle ?? null,
      search: sp.q ?? null,
      from: sp.baslangic ?? null,
      to: sp.bitis ?? null,
      minSupport: sp.destek ? Number(sp.destek) : null,
      needsAction: sp.bekleyen === "1",
      limit,
      offset: (page - 1) * limit,
    }),
  ]);

  const totalPages = Math.ceil(result.total / limit);
  const qs = new URLSearchParams(
    Object.entries(sp).filter(([k, v]) => v && k !== "sayfa") as [string, string][],
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Bildirimler</h1>
          <p className="mt-1 text-sm text-ink-600">{formatNumber(result.total)} kayıt</p>
        </div>
      </header>

      <AdminReportFilters
        categories={categories}
        neighborhoods={neighborhoods.map((n) => ({ slug: n.slug, name: n.name }))}
      />

      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-line">
        {result.items.length === 0 ? (
          <p className="p-8 text-center text-sm text-ink-500">Bu filtrelerle kayıt bulunamadı.</p>
        ) : (
          <ul className="divide-y divide-line">
            {result.items.map((r) => (
              <li key={r.id}>
                <Link href={`/yonetim/bildirimler/${r.id}`} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-muted">
                  <span className="mt-0.5 shrink-0" style={{ color: r.category_color }}>
                    <CategoryIcon name={r.category_icon} size={18} />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-medium text-ink-900">{r.title}</span>
                      {r.is_hidden && (
                        <span className="rounded-full bg-ink-100 px-2 py-0.5 text-2xs font-medium text-ink-600">gizli</span>
                      )}
                      {r.open_flags > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#fdeaef] px-2 py-0.5 text-2xs font-medium text-[#8d0f33]">
                          <IconFlag size={10} /> {r.open_flags}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-2xs text-ink-500">
                      <span className="font-mono">{r.ref_code}</span>
                      <span>{r.category_name}</span>
                      <span>{r.neighborhood_name ?? "—"}</span>
                      <span>{formatDate(r.created_at)}</span>
                      <span>{formatNumber(r.support_count)} destek</span>
                      {r.submission_count > 0 && <span>{r.submission_count} başvuru</span>}
                      {r.awaiting_response_hours != null && (
                        <span className={r.awaiting_response_hours > r.sla_days * 24 ? "font-medium text-[#a16207]" : ""}>
                          {formatElapsed(r.awaiting_response_hours)} yanıt yok
                        </span>
                      )}
                    </span>
                  </span>

                  <span className="flex shrink-0 items-center gap-2">
                    <StatusBadge status={r.status as ReportStatus} showDot={false} />
                    <IconArrowRight size={15} className="text-ink-300" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {totalPages > 1 && (
        <nav className="flex items-center justify-between" aria-label="Sayfalama">
          {page > 1 ? (
            <Link href={`/yonetim/bildirimler?${qs}&sayfa=${page - 1}`} className="inline-flex h-10 items-center rounded-xl bg-white px-4 text-sm font-medium text-ink-700 ring-1 ring-line">
              Önceki
            </Link>
          ) : <span />}
          <span className="text-xs text-ink-500">{page} / {totalPages}</span>
          {page < totalPages ? (
            <Link href={`/yonetim/bildirimler?${qs}&sayfa=${page + 1}`} className="inline-flex h-10 items-center rounded-xl bg-white px-4 text-sm font-medium text-ink-700 ring-1 ring-line">
              Sonraki
            </Link>
          ) : <span />}
        </nav>
      )}
    </div>
  );
}
