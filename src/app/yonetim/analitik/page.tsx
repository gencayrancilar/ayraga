import type { Metadata } from "next";
import Link from "next/link";
import { adminAnalytics, adminHeatmapPoints } from "@/lib/queries/admin";
import { getCategoryTree } from "@/lib/queries/reference";
import { AnalyticsHeat } from "@/components/admin/AnalyticsScreen";
import { formatNumber, formatDateShort } from "@/lib/format";
import { STATUS } from "@/lib/status";
import { CategoryIcon } from "@/components/icons";
import type { ReportStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Analitik · Yönetim", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const days = [30, 90, 180, 365].includes(Number(sp.gun)) ? Number(sp.gun) : 90;

  const [analytics, heatPoints, categories] = await Promise.all([
    adminAnalytics(days),
    adminHeatmapPoints(),
    getCategoryTree(),
  ]);

  const maxWeek = Math.max(...analytics.timeline.map((t) => Number(t.created)), 1);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Analitik</h1>
          <p className="mt-1 text-sm text-ink-600">Kent verisi — son {days} gün.</p>
        </div>
        <div className="flex gap-1.5">
          {[30, 90, 180, 365].map((d) => (
            <Link
              key={d}
              href={`/yonetim/analitik?gun=${d}`}
              className={`h-8 rounded-full px-3 text-2xs font-medium leading-8 transition-colors ${
                d === days ? "bg-ink-900 text-white" : "bg-white text-ink-600 ring-1 ring-line"
              }`}
            >
              {d} gün
            </Link>
          ))}
        </div>
      </header>

      <AnalyticsHeat
        initialPoints={heatPoints as unknown as Array<{ latitude: number; longitude: number; support_count: number }>}
        categories={categories.map((c) => ({ slug: c.slug, name: c.name, color: c.color }))}
      />

      <section className="rounded-2xl bg-white p-4 ring-1 ring-line">
        <h2 className="mb-3 text-sm font-semibold text-ink-900">Haftalık bildirim akışı</h2>
        {analytics.timeline.length === 0 ? (
          <p className="text-xs text-ink-500">Bu dönemde veri yok.</p>
        ) : (
          <div
            className="flex h-44 items-stretch gap-1 overflow-x-auto pb-1"
            role="group"
            tabIndex={0}
            aria-label="Haftalık bildirim ve çözüm sayıları"
          >
            {analytics.timeline.map((week) => (
              <div key={week.week as string} className="flex min-w-7 flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-1 flex-col justify-end gap-px" style={{ minHeight: 0 }}>
                  <div
                    className="w-full shrink-0 rounded-t bg-ink-800"
                    style={{ height: `${Math.max(((Number(week.created) - Number(week.resolved)) / maxWeek) * 100, Number(week.created) > Number(week.resolved) ? 3 : 0)}%` }}
                    title={`${week.created} bildirim`}
                  />
                  <div
                    className="w-full shrink-0 rounded-t bg-teal-500"
                    style={{ height: `${Math.max((Number(week.resolved) / maxWeek) * 100, Number(week.resolved) > 0 ? 3 : 0)}%` }}
                    title={`${week.resolved} çözüldü`}
                  />
                </div>
                <span className="whitespace-nowrap text-[0.5625rem] text-ink-400">
                  {formatDateShort(week.week as string)}
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 flex gap-4 text-2xs text-ink-500">
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded bg-ink-800" /> Bildirim</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded bg-teal-500" /> Çözülen</span>
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-4 ring-1 ring-line">
          <h2 className="mb-3 text-sm font-semibold text-ink-900">En çok sorun bulunan mahalleler</h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-2xs uppercase tracking-wide text-ink-400">
                <th className="pb-2 font-medium">Mahalle</th>
                <th className="pb-2 text-right font-medium">Bildirim</th>
                <th className="pb-2 text-right font-medium">Çözüldü</th>
                <th className="pb-2 text-right font-medium">Destek</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {analytics.byNeighborhood.map((n) => (
                <tr key={n.slug as string}>
                  <td className="py-2">
                    <Link href={`/mahalle/${n.slug}`} className="text-ink-800 hover:underline">{n.name as string}</Link>
                  </td>
                  <td className="py-2 text-right tabular-nums text-ink-700">{formatNumber(Number(n.total))}</td>
                  <td className="py-2 text-right tabular-nums text-ink-700">{formatNumber(Number(n.resolved))}</td>
                  <td className="py-2 text-right tabular-nums text-ink-500">{formatNumber(Number(n.supports))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-2xl bg-white p-4 ring-1 ring-line">
          <h2 className="mb-3 text-sm font-semibold text-ink-900">En çok bildirilen kategoriler</h2>
          <ul className="space-y-2.5">
            {analytics.byCategory.map((c) => {
              const max = Number(analytics.byCategory[0]?.total) || 1;
              return (
                <li key={c.name as string}>
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-ink-700">
                      <span style={{ color: c.color as string }}>
                        <CategoryIcon name={c.icon as string} size={14} />
                      </span>
                      {c.name as string}
                    </span>
                    <span className="tabular-nums text-ink-500">{formatNumber(Number(c.total))}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                    <div className="h-full rounded-full" style={{ width: `${(Number(c.total) / max) * 100}%`, background: c.color as string }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-2xl bg-white p-4 ring-1 ring-line">
          <h2 className="mb-3 text-sm font-semibold text-ink-900">Duruma göre dağılım</h2>
          <ul className="space-y-1.5 text-xs">
            {analytics.byStatus.map((s) => (
              <li key={s.status as string} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-ink-700">
                  <span className={`size-2 rounded-full ${STATUS[s.status as ReportStatus]?.dot ?? "bg-ink-300"}`} />
                  {STATUS[s.status as ReportStatus]?.label ?? (s.status as string)}
                </span>
                <span className="tabular-nums text-ink-600">{formatNumber(Number(s.total))}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl bg-white p-4 ring-1 ring-line">
          <h2 className="mb-3 text-sm font-semibold text-ink-900">En çok desteklenen sorunlar</h2>
          <ol className="space-y-2 text-xs">
            {analytics.topSupported.map((r, i) => (
              <li key={r.id as string} className="flex items-baseline gap-2.5">
                <span className="w-4 shrink-0 text-right tabular-nums text-ink-400">{i + 1}</span>
                <Link href={`/sorun/${r.slug}`} className="min-w-0 flex-1 truncate text-ink-800 hover:underline">
                  {r.title as string}
                </Link>
                <span className="shrink-0 tabular-nums font-medium text-ink-700">
                  {formatNumber(Number(r.support_count))}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
