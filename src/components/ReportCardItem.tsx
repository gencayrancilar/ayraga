import Link from "next/link";
import Image from "next/image";
import { cx } from "@/lib/utils";
import { publicMediaUrl } from "@/lib/public-config";
import { formatDistance, supportLabel, timeAgo, formatElapsed } from "@/lib/format";
import { StatusBadge } from "./ui/Badge";
import { CategoryIcon, IconArrowUp, IconClock, IconPin } from "./icons";
import type { ReportCard } from "@/lib/types";

/**
 * Sorun kartı. Odak sorunun kendisidir: kim bildirdiği kart üzerinde
 * gösterilmez, destek sayısı bir yarış göstergesi değil öncelik sinyali
 * olarak sunulur.
 */
export function ReportCardItem({
  report, showDistance = false, compact = false,
}: {
  report: ReportCard;
  showDistance?: boolean;
  compact?: boolean;
}) {
  const cover = publicMediaUrl(report.status === "resolved" ? report.resolution_path ?? report.cover_path : report.cover_path);
  const waiting = report.awaiting_response_hours;

  return (
    <article className="group relative rounded-2xl bg-white ring-1 ring-line transition-shadow hover:shadow-raise">
      <Link href={`/sorun/${report.slug}`} className="flex gap-3 p-3 focus-visible:outline-none">
        <div
          className={cx(
            "relative shrink-0 overflow-hidden rounded-xl bg-surface-sunken",
            compact ? "size-16" : "size-20 sm:size-24",
          )}
        >
          {cover ? (
            <Image
              src={cover}
              alt=""
              fill
              sizes="96px"
              className={cx("object-cover", report.status === "resolved" && "saturate-[0.85]")}
            />
          ) : (
            <span
              className="flex size-full items-center justify-center"
              style={{ color: report.category_color }}
            >
              <CategoryIcon name={report.category_icon} size={compact ? 20 : 26} />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <StatusBadge status={report.status} />
            <span className="inline-flex items-center gap-1 text-2xs font-medium text-ink-500">
              <span className="size-2 rounded-[3px]" style={{ background: report.category_color }} aria-hidden="true" />
              {report.category_name}
            </span>
          </div>

          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-ink-900 group-hover:text-ink-700">
            {report.title}
          </h3>

          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-ink-500">
            <span className="inline-flex items-center gap-1">
              <IconPin size={12} />
              {report.neighborhood_name ?? report.district_name ?? "Konum"}
            </span>
            {showDistance && report.distance_m != null && (
              <span className="font-medium text-ink-600">{formatDistance(report.distance_m)}</span>
            )}
            <span>{timeAgo(report.created_at)}</span>
          </p>

          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs">
            <span className="inline-flex items-center gap-1 font-medium text-ink-700">
              <IconArrowUp size={12} />
              {supportLabel(report.support_count)}
            </span>
            {waiting != null && waiting > 24 && (
              <span className="inline-flex items-center gap-1 text-ink-500" title="Başvurudan bu yana geçen süre">
                <IconClock size={12} />
                {formatElapsed(waiting)}
              </span>
            )}
          </p>
        </div>
      </Link>
    </article>
  );
}

export function ReportCardSkeleton() {
  return (
    <div className="flex animate-pulse gap-3 rounded-2xl bg-white p-3 ring-1 ring-line">
      <div className="size-20 shrink-0 rounded-xl bg-surface-sunken sm:size-24" />
      <div className="flex-1 space-y-2 py-1">
        <div className="h-3.5 w-24 rounded bg-surface-sunken" />
        <div className="h-3.5 w-full rounded bg-surface-sunken" />
        <div className="h-3.5 w-2/3 rounded bg-surface-sunken" />
      </div>
    </div>
  );
}
