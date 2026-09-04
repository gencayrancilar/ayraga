"use client";

import { cx } from "@/lib/utils";
import { CategoryIcon } from "../icons";
import type { Category } from "@/lib/types";

export function CategoryFilterBar({
  categories, selected, onToggle, onClear,
}: {
  categories: Category[];
  selected: string[];
  onToggle: (slug: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="scrollbar-none flex gap-2 overflow-x-auto px-4 py-2" role="group" aria-label="Kategori filtresi">
      <button
        type="button"
        onClick={onClear}
        aria-pressed={selected.length === 0}
        className={cx(
          "flex h-9 shrink-0 items-center rounded-full px-3.5 text-xs font-medium transition-colors",
          selected.length === 0
            ? "bg-ink-900 text-white"
            : "bg-white text-ink-600 ring-1 ring-line hover:bg-surface-muted",
        )}
      >
        Tümü
      </button>

      {categories.map((c) => {
        const active = selected.includes(c.slug);
        return (
          <button
            key={c.slug}
            type="button"
            onClick={() => onToggle(c.slug)}
            aria-pressed={active}
            className={cx(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
              active
                ? "bg-ink-900 text-white"
                : "bg-white text-ink-600 ring-1 ring-line hover:bg-surface-muted",
            )}
          >
            <span style={{ color: active ? "#ffffff" : c.color }}>
              <CategoryIcon name={c.icon} size={15} />
            </span>
            {c.name}
          </button>
        );
      })}
    </div>
  );
}
