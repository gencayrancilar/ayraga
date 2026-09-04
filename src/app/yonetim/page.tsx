import type { Metadata } from "next";
import Link from "next/link";
import { adminAnalytics, adminListReports } from "@/lib/queries/admin";
import { formatNumber, timeAgo, formatElapsed } from "@/lib/format";
import { StatusBadge } from "@/components/ui/Badge";
import { CategoryIcon, IconArrowRight, IconAlert, IconClock, IconFlag } from "@/components/icons";
import type { ReportStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Yönetim", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [analytics, queue] = await Promise.all([
    adminAnalytics(90),
    adminListReports({ needsAction: true, limit: 12 }),
  ]);

  const t = analytics.totals;
  const resolutionRate = t.total > 0 ? Math.round((t.resolved / t.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-ink-900">Genel bakış</h1>
        <p className="mt-1 text-sm text-ink-600">
          Son 90 gün. Tüm sayılar canlı veritabanından okunur.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Toplam bildirim" value={formatNumber(t.total)} sub={`son 7 günde ${formatNumber(t.last_week)}`} />
        <Kpi label="Açık sorun" value={formatNumber(t.open)} sub={`${formatNumber(t.awaiting_review)} doğrulama bekliyor`} accent={t.awaiting_review > 0} />
        <Kpi label="Çözüldü" value={formatNumber(t.resolved)} sub={`çözülme oranı %${resolutionRate}`} />
        <Kpi
          label="Ortalama çözüm"
          value={t.avg_resolution_days != null ? `${t.avg_resolution_days} gün` : "—"}
          sub={t.median_resolution_days != null ? `medyan ${t.median_resolution_days} gün` : "henüz veri yok"}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/yonetim/moderasyon"
          className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-line transition-shadow hover:shadow-raise"
        >
          <IconFlag size={20} className={analytics.pending.open_flags > 0 ? "text-[#9f1239]" : "text-ink-400"} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-ink-900">
              {formatNumber(analytics.pending.open_flags)} açık moderasyon ihbarı
            </span>
            <span className="block text-xs text-ink-500">İncelenmeyi bekliyor</span>
          </span>
          <IconArrowRight size={16} className="text-ink-300" />
        </Link>

        <Link
          href="/yonetim/bildirimler?durum=forwarded,in_review,awaiting_resolution"
          className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-line transition-shadow hover:shadow-raise"
        >
          <IconClock size={20} className="text-ink-400" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-ink-900">
              {formatNumber(analytics.pending.awaiting_authority)} bildirim kurum yanıtı bekliyor
            </span>
            <span className="block text-xs text-ink-500">Başvuru yapıldı, yanıt kaydedilmedi</span>
          </span>
          <IconArrowRight size={16} className="text-ink-300" />
        </Link>
      </div>

      <section className="rounded-2xl bg-white ring-1 ring-line">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
            <IconAlert size={16} className="text-[#a16207]" />
            İşlem bekleyenler
          </h2>
          <Link href="/yonetim/bildirimler" className="text-xs font-medium text-teal-700 hover:underline">
            Tüm bildirimler
          </Link>
        </header>

        {queue.items.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-500">Bekleyen işlem yok.</p>
        ) : (
          <ul className="divide-y divide-line">
            {queue.items.map((r) => (
              <li key={r.id}>
                <Link href={`/yonetim/bildirimler/${r.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-muted">
                  <span className="shrink-0" style={{ color: r.category_color }}>
                    <CategoryIcon name={r.category_icon} size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink-900">{r.title}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-ink-500">
                      <span className="font-mono">{r.ref_code}</span>
                      <span>{r.neighborhood_name ?? "—"}</span>
                      <span>{timeAgo(r.created_at)}</span>
                      <span>{formatNumber(r.support_count)} destek</span>
                      {r.awaiting_response_hours != null && r.awaiting_response_hours > r.sla_days * 24 && (
                        <span className="font-medium text-[#a16207]">
                          {formatElapsed(r.awaiting_response_hours)} yanıt yok
                        </span>
                      )}
                      {r.open_flags > 0 && (
                        <span className="font-medium text-[#9f1239]">{r.open_flags} ihbar</span>
                      )}
                    </span>
                  </span>
                  <StatusBadge status={r.status as ReportStatus} showDot={false} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl bg-white p-4 ring-1 ring-line">
          <h2 className="mb-3 text-sm font-semibold text-ink-900">Kategoriye göre</h2>
          <ul className="space-y-2.5">
            {analytics.byCategory.slice(0, 8).map((c) => {
              const max = analytics.byCategory[0]?.total || 1;
              return (
                <li key={c.name}>
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 text-ink-700">
                      <span style={{ color: c.color }}><CategoryIcon name={c.icon} size={14} /></span>
                      {c.name}
                    </span>
                    <span className="tabular-nums text-ink-500">
                      {formatNumber(c.total)} · {formatNumber(c.resolved)} çözüldü
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                    <div className="h-full rounded-full" style={{ width: `${(c.total / max) * 100}%`, background: c.color }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-2xl bg-white p-4 ring-1 ring-line">
          <h2 className="mb-3 text-sm font-semibold text-ink-900">Kurum yanıt performansı</h2>
          {analytics.authorities.length === 0 ? (
            <p className="text-xs text-ink-500">Henüz kayıtlı başvuru yok.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-2xs uppercase tracking-wide text-ink-400">
                  <th className="pb-2 font-medium">Kurum</th>
                  <th className="pb-2 text-right font-medium">Başvuru</th>
                  <th className="pb-2 text-right font-medium">Yanıt</th>
                  <th className="pb-2 text-right font-medium">Ort. gün</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {analytics.authorities.map((a) => (
                  <tr key={a.name}>
                    <td className="py-2 pr-2 text-ink-800">{a.short_name ?? a.name}</td>
                    <td className="py-2 text-right tabular-nums text-ink-600">{a.submissions}</td>
                    <td className="py-2 text-right tabular-nums text-ink-600">{a.responded}</td>
                    <td className={`py-2 text-right tabular-nums ${a.avg_days != null && a.avg_days > a.response_sla_days ? "font-medium text-[#a16207]" : "text-ink-600"}`}>
                      {a.avg_days ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl bg-white p-4 ring-1 ${accent ? "ring-[#f0e0b8]" : "ring-line"}`}>
      <p className="text-2xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{value}</p>
      {sub && <p className="mt-0.5 text-2xs text-ink-500">{sub}</p>}
    </div>
  );
}
