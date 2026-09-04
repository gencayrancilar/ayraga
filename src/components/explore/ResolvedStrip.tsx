import Link from "next/link";
import Image from "next/image";
import { publicMediaUrl } from "@/lib/public-config";
import { formatDate, formatNumber, pluralDays } from "@/lib/format";
import { CategoryIcon, IconCheck, IconArrowRight } from "../icons";
import type { ReportCard } from "@/lib/types";

/**
 * Çözülenler şeridi.
 *
 * Bilinçli olarak listenin en üstünde durur: platformu açan kişi önce
 * "burada bir şeyler çözülüyor" bilgisini görür. Öncesi/sonrası görseli
 * varsa yan yana gösterilir; yoksa yalnızca sonuç kartı.
 */
export function ResolvedStrip({
  items, resolvedThisMonth, avgDays,
}: {
  items: ReportCard[];
  resolvedThisMonth: number;
  avgDays: number | null;
}) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="cozulenler" className="rounded-2xl bg-white p-4 ring-1 ring-line">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="cozulenler" className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
          <IconCheck size={16} className="text-teal-600" />
          Çözülenler
        </h2>
        <p className="text-xs text-ink-600">
          {resolvedThisMonth > 0
            ? `Bu ay ${formatNumber(resolvedThisMonth)} sorun çözüldü`
            : "Bu ay henüz çözülen sorun yok"}
          {avgDays != null && ` · ortalama ${pluralDays(avgDays)}`}
        </p>
      </header>

      <ul className="scrollbar-none -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
        {items.map((r) => {
          const before = publicMediaUrl(r.cover_path);
          const after = publicMediaUrl(r.resolution_path);
          return (
            <li key={r.id} className="w-56 shrink-0">
              <Link
                href={`/sorun/${r.slug}`}
                className="group block overflow-hidden rounded-xl bg-surface-muted ring-1 ring-line transition-shadow hover:shadow-card"
              >
                <div className="relative flex aspect-[16/9] bg-surface-sunken">
                  {before && after ? (
                    <>
                      <span className="relative w-1/2 border-r border-white/60">
                        <Image src={before} alt="Çözümden önce" fill sizes="112px" className="object-cover" />
                        <span className="absolute bottom-1 left-1 rounded bg-ink-900/70 px-1.5 py-0.5 text-[0.5625rem] font-medium text-white">
                          Önce
                        </span>
                      </span>
                      <span className="relative w-1/2">
                        <Image src={after} alt="Çözümden sonra" fill sizes="112px" className="object-cover" />
                        <span className="absolute bottom-1 left-1 rounded bg-teal-700/80 px-1.5 py-0.5 text-[0.5625rem] font-medium text-white">
                          Sonra
                        </span>
                      </span>
                    </>
                  ) : before || after ? (
                    <Image src={(after ?? before)!} alt="" fill sizes="224px" className="object-cover" />
                  ) : (
                    <span
                      className="flex size-full items-center justify-center"
                      style={{ color: r.category_color }}
                      aria-hidden="true"
                    >
                      <CategoryIcon name={r.category_icon} size={26} />
                    </span>
                  )}
                </div>

                <div className="bg-white p-2.5">
                  <p className="line-clamp-2 text-xs font-medium leading-snug text-ink-900">{r.title}</p>
                  <p className="mt-1 text-2xs text-ink-500">
                    {r.neighborhood_name ?? r.district_name}
                    {r.resolved_at && ` · ${formatDate(r.resolved_at)}`}
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <Link
        href="/kesfet?sirala=resolved"
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline"
      >
        Tüm çözülen sorunlar <IconArrowRight size={13} />
      </Link>
    </section>
  );
}
