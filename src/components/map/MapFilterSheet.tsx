"use client";

import { useEffect, useRef } from "react";
import { cx } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { STATUS } from "@/lib/status";
import { CategoryIcon, IconClose, IconCheck } from "../icons";
import type { Category, ReportStatus } from "@/lib/types";

const STATUS_OPTIONS: ReportStatus[] = [
  "new", "verified", "forwarded", "in_review", "awaiting_resolution", "resolved", "unresolved",
];

/**
 * Filtre sayfası.
 *
 * Kategoriler yatay kayan bir şerit yerine ızgarada duruyor: on iki başlığın
 * tamamı tek bakışta görünür, kaydırarak aramak gerekmez. Her başlığın yanında
 * o an haritada kaç bildirim olduğu yazar — boş bir filtreyi seçip boş ekranla
 * karşılaşmak yerine, seçmeden önce ne bulacağınızı bilirsiniz.
 */
export function MapFilterSheet({
  open, onClose, categories, counts, selectedCategories, onToggleCategory,
  selectedStatuses, onToggleStatus, neighborhoods, neighborhood, onNeighborhood, onReset, total,
}: {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  counts: Record<string, number>;
  selectedCategories: string[];
  onToggleCategory: (slug: string) => void;
  selectedStatuses: ReportStatus[];
  onToggleStatus: (status: ReportStatus) => void;
  neighborhoods: Array<{ slug: string; name: string }>;
  neighborhood: string | null;
  onNeighborhood: (slug: string | null) => void;
  onReset: () => void;
  total: number;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const activeCount = selectedCategories.length + selectedStatuses.length + (neighborhood ? 1 : 0);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Filtreleri kapat"
        onClick={onClose}
        className="absolute inset-0 bg-ink-950/35"
      />

      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Harita filtreleri"
        className="relative flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-sheet outline-none sm:rounded-2xl"
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-ink-900">Filtreler</h2>
            <p className="text-2xs text-ink-500">
              {activeCount > 0 ? `${activeCount} filtre etkin` : "Tüm bildirimler gösteriliyor"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {activeCount > 0 && (
              <button
                type="button"
                onClick={onReset}
                className="h-9 rounded-lg px-2.5 text-xs font-medium text-ink-600 transition-colors hover:bg-surface-muted hover:text-ink-900"
              >
                Temizle
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Kapat"
              className="tap-target flex items-center justify-center rounded-lg text-ink-500 transition-colors hover:text-ink-900"
            >
              <IconClose size={20} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <fieldset>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
              Kategori
            </legend>
            <div className="grid grid-cols-2 gap-2">
              {categories.map((c) => {
                const active = selectedCategories.includes(c.slug);
                const count = counts[c.slug] ?? 0;
                return (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => onToggleCategory(c.slug)}
                    aria-pressed={active}
                    className={cx(
                      "flex items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-colors",
                      active
                        ? "bg-ink-900 text-white ring-2 ring-ink-900"
                        : count === 0
                          // Boş kategori soluklaştırılmaz — okunabilirliği bozar.
                          // Bunun yerine zemin ve metin tonu değişir.
                          ? "bg-surface-muted text-ink-500 ring-1 ring-line"
                          : "bg-white text-ink-800 ring-1 ring-line hover:bg-surface-muted",
                    )}
                  >
                    <span style={{ color: active ? "#ffffff" : c.color }}>
                      <CategoryIcon name={c.icon} size={18} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{c.name}</span>
                    <span
                      className={cx(
                        "shrink-0 text-2xs tabular-nums",
                        active ? "text-white/70" : "text-ink-400",
                      )}
                    >
                      {formatNumber(count)}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-2xs text-ink-500">
              Sayılar haritanın görünen alanındaki bildirimleri gösterir.
            </p>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">
              Durum
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {STATUS_OPTIONS.map((s) => {
                const active = selectedStatuses.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onToggleStatus(s)}
                    aria-pressed={active}
                    className={cx(
                      "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
                      active
                        ? "bg-ink-900 text-white"
                        : "bg-white text-ink-700 ring-1 ring-line hover:bg-surface-muted",
                    )}
                  >
                    <span
                      className={cx("size-2 rounded-full", active ? "bg-white/70" : STATUS[s].dot)}
                      aria-hidden="true"
                    />
                    {STATUS[s].label}
                    {active && <IconCheck size={13} />}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div>
            <label
              htmlFor="map-neighborhood"
              className="mb-2 block text-xs font-semibold uppercase tracking-wide text-ink-500"
            >
              Mahalle
            </label>
            <select
              id="map-neighborhood"
              value={neighborhood ?? ""}
              onChange={(e) => onNeighborhood(e.target.value || null)}
              className="h-11 w-full rounded-xl border-0 bg-surface-muted px-3 text-sm text-ink-900 ring-1 ring-inset ring-line focus:ring-2 focus:ring-teal-600"
            >
              <option value="">Tüm mahalleler</option>
              {neighborhoods.map((n) => (
                <option key={n.slug} value={n.slug}>{n.name}</option>
              ))}
            </select>
            <p className="mt-1.5 text-2xs text-ink-500">
              Mahalle seçimi haritayı o mahallenin merkezine götürür.
            </p>
          </div>
        </div>

        <footer className="border-t border-line px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            className="h-12 w-full rounded-xl bg-ink-900 text-base font-medium text-white transition-colors hover:bg-ink-800"
          >
            {total > 0 ? `${formatNumber(total)} bildirimi göster` : "Haritaya dön"}
          </button>
        </footer>
      </div>
    </div>
  );
}
