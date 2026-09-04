"use client";

import { useState } from "react";
import { cx } from "@/lib/utils";
import { pinDataUrl, STATE_META, type PinState } from "./pins";
import { IconInfo, IconClose } from "../icons";
import type { Category } from "@/lib/types";

const STATES: PinState[] = ["open", "overdue", "resolved", "unresolved"];

const DENSITY = [
  { label: "1–4", size: 18, color: "#46608a" },
  { label: "5–9", size: 22, color: "#2f4870" },
  { label: "10–24", size: 26, color: "#1f3557" },
  { label: "25+", size: 30, color: "#0b1c33" },
];

/**
 * Gösterge.
 *
 * Haritadaki her işaret bir şey söylüyorsa, ne söylediği bir yerde yazmalı.
 * Panel varsayılan olarak kapalıdır — deneyimli kullanıcıyı meşgul etmez,
 * ilk kez bakana ise tek dokunuşla açıklamayı verir.
 */
export function MapLegend({ categories }: { categories: Category[] }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pointer-events-auto inline-flex h-9 items-center gap-1.5 rounded-xl bg-white/95 px-3 text-2xs font-medium text-ink-700 shadow-card ring-1 ring-line backdrop-blur transition-colors hover:bg-white"
      >
        <IconInfo size={15} /> Gösterge
      </button>
    );
  }

  return (
    <div
      className="pointer-events-auto w-64 rounded-2xl bg-white/97 p-3.5 shadow-raise ring-1 ring-line backdrop-blur"
      role="region"
      aria-label="Harita göstergesi"
    >
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="text-2xs font-semibold uppercase tracking-wide text-ink-500">Gösterge</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Göstergeyi kapat"
          className="text-ink-400 transition-colors hover:text-ink-800"
        >
          <IconClose size={15} />
        </button>
      </div>

      <p className="mb-1.5 text-2xs font-medium text-ink-700">Pin durumu</p>
      <ul className="mb-3 space-y-1.5">
        {STATES.map((state) => (
          <li key={state} className="flex items-start gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pinDataUrl("road", "#46608a", state)}
              alt=""
              width={17}
              height={22}
              className="mt-px shrink-0"
            />
            <span className="min-w-0">
              <span className="block text-2xs font-medium text-ink-800">{STATE_META[state].label}</span>
              <span className="block text-[0.625rem] leading-snug text-ink-500">
                {STATE_META[state].description}
              </span>
            </span>
          </li>
        ))}
      </ul>

      <p className="mb-1.5 text-2xs font-medium text-ink-700">Küme büyüklüğü</p>
      <ul className="mb-3 flex items-end gap-2.5">
        {DENSITY.map((d) => (
          <li key={d.label} className="flex flex-col items-center gap-1">
            <span
              className="rounded-full ring-2 ring-white"
              style={{ width: d.size, height: d.size, background: d.color }}
              aria-hidden="true"
            />
            <span className="text-[0.5625rem] tabular-nums text-ink-500">{d.label}</span>
          </li>
        ))}
      </ul>
      <p className="mb-3 text-[0.625rem] leading-snug text-ink-500">
        Kehribar halkalı küme, içinde yanıt süresi aşılmış bildirim olduğunu gösterir.
      </p>

      <p className="mb-1.5 text-2xs font-medium text-ink-700">Kategori renkleri</p>
      <ul className="grid grid-cols-2 gap-x-2 gap-y-1">
        {categories.map((c) => (
          <li key={c.slug} className="flex items-center gap-1.5">
            <span
              className="size-2 shrink-0 rounded-[3px]"
              style={{ background: c.color }}
              aria-hidden="true"
            />
            <span className="truncate text-[0.625rem] text-ink-600">{c.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Liste satırlarında ve filtrelerde kullanılan küçük pin görseli. */
export function PinThumb({
  icon, color, state, size = 26, className,
}: {
  icon: string;
  color: string;
  state: PinState;
  size?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={pinDataUrl(icon, color, state)}
      alt=""
      width={size}
      height={Math.round((size / 40) * 52)}
      className={cx("shrink-0", className)}
    />
  );
}
