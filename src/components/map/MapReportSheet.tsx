"use client";

import Link from "next/link";
import Image from "next/image";
import { publicMediaUrl } from "@/lib/public-config";
import { supportLabel, timeAgo } from "@/lib/format";
import { STATUS } from "@/lib/status";
import { CategoryIcon, IconArrowRight, IconClose, IconPin } from "../icons";
import type { ReportStatus } from "@/lib/types";
import type { MapFeature } from "./ReportMap";

/** Haritada bir pin seçilince açılan kısa önizleme. */
export function MapReportSheet({ feature, onClose }: { feature: MapFeature; onClose: () => void }) {
  const cover = publicMediaUrl(feature.cover);
  const status = STATUS[feature.status as ReportStatus] ?? STATUS.new;

  return (
    <div
      role="dialog"
      aria-label={feature.title}
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 mx-auto w-full max-w-lg px-3 pb-3 lg:left-4 lg:bottom-4 lg:mx-0 lg:max-w-sm lg:px-0 lg:pb-0"
    >
      <div className="relative overflow-hidden rounded-2xl bg-white shadow-sheet ring-1 ring-line">
        <button
          type="button"
          onClick={onClose}
          aria-label="Kapat"
          className="absolute right-2 top-2 z-10 flex size-8 items-center justify-center rounded-full bg-white/90 text-ink-500 backdrop-blur transition-colors hover:text-ink-800"
        >
          <IconClose size={16} />
        </button>

        <Link href={`/sorun/${feature.slug}`} className="flex gap-3 p-3">
          <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-surface-sunken">
            {cover ? (
              <Image src={cover} alt="" fill sizes="80px" className="object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center" style={{ color: feature.color }}>
                <CategoryIcon name={feature.icon} size={24} />
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1 pr-6">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-medium ring-1 ring-inset ${status.tone}`}
            >
              <span className={`size-1.5 rounded-full ${status.dot}`} aria-hidden="true" />
              {status.label}
            </span>

            <h3 className="mt-1.5 line-clamp-2 text-sm font-semibold leading-snug text-ink-900">
              {feature.title}
            </h3>

            <p className="mt-1 flex items-center gap-1 text-2xs text-ink-500">
              <IconPin size={12} />
              {feature.neighborhood ?? feature.address ?? feature.category}
              <span className="mx-0.5">·</span>
              {timeAgo(feature.createdAt)}
            </p>

            <p className="mt-1.5 flex items-center justify-between text-2xs font-medium text-ink-700">
              {supportLabel(Number(feature.supports ?? 0))}
              <span className="inline-flex items-center gap-1 text-teal-700">
                Detay <IconArrowRight size={13} />
              </span>
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
