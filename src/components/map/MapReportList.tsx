"use client";

import Link from "next/link";
import { cx } from "@/lib/utils";
import { formatNumber, timeAgo } from "@/lib/format";
import { STATE_META } from "./pins";
import { PinThumb } from "./MapLegend";
import { IconArrowUp, IconArrowRight, IconPin } from "../icons";
import type { MapFeature } from "./ReportMap";

/**
 * Görünen alandaki bildirimlerin listesi.
 *
 * Harita "nerede" sorusuna, liste "ne" sorusuna cevap verir; ikisi aynı anda
 * görünür ve birbirine bağlıdır. Satırdaki pin görseli haritadakinin birebir
 * aynısıdır — bir satırı okuyan kişi onu haritada gözüyle bulabilir.
 */
export function MapReportList({
  items, selectedId, onSelect, loading, className,
}: {
  items: MapFeature[];
  selectedId: string | null;
  onSelect: (feature: MapFeature) => void;
  loading?: boolean;
  className?: string;
}) {
  // Önce yanıtı geciken, sonra en çok desteklenen: listenin başı hep
  // ilgilenilmesi gereken kayıt olur.
  const sorted = [...items].sort((a, b) => {
    const rank = (f: MapFeature) => (f.state === "overdue" ? 0 : f.state === "open" ? 1 : 2);
    return rank(a) - rank(b) || Number(b.supports) - Number(a.supports);
  });

  if (items.length === 0) {
    return (
      <div className={cx("flex flex-col items-center justify-center px-6 py-10 text-center", className)}>
        <IconPin size={26} className="text-ink-300" />
        <p className="mt-2 text-sm font-medium text-ink-800">
          {loading ? "Yükleniyor…" : "Bu alanda bildirim yok"}
        </p>
        <p className="mt-1 max-w-xs text-xs text-ink-500">
          Haritayı kaydırıp uzaklaştırın veya filtreleri gevşetin.
        </p>
      </div>
    );
  }

  return (
    <ul className={cx("divide-y divide-line", className)}>
      {sorted.map((f) => {
        const active = f.id === selectedId;
        return (
          <li key={f.id}>
            <div
              className={cx(
                "flex items-start gap-3 px-3 py-2.5 transition-colors",
                active ? "bg-teal-50" : "hover:bg-surface-muted",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(f)}
                className="flex min-w-0 flex-1 items-start gap-3 text-left"
                aria-label={`${f.title} — haritada göster`}
              >
                <PinThumb icon={f.icon} color={f.color} state={f.state} size={24} className="mt-0.5" />

                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 text-sm font-medium leading-snug text-ink-900">
                    {f.title}
                  </span>

                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-2xs text-ink-500">
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="size-1.5 rounded-[2px]"
                        style={{ background: f.color }}
                        aria-hidden="true"
                      />
                      {f.category}
                    </span>
                    {f.neighborhood && <span>{f.neighborhood}</span>}
                    <span>{timeAgo(f.createdAt)}</span>
                  </span>

                  <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span
                      className="inline-flex items-center gap-1 text-2xs font-medium"
                      style={{ color: STATE_META[f.state].color }}
                    >
                      {STATE_META[f.state].label}
                    </span>
                    <span className="inline-flex items-center gap-1 text-2xs text-ink-600">
                      <IconArrowUp size={11} />
                      {formatNumber(Number(f.supports))}
                    </span>
                  </span>
                </span>
              </button>

              <Link
                href={`/sorun/${f.slug}`}
                className="tap-target -mr-1 flex shrink-0 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-white hover:text-ink-800"
                aria-label={`${f.title} detayını aç`}
              >
                <IconArrowRight size={16} />
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
