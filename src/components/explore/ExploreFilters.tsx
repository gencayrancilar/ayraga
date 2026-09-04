"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { cx } from "@/lib/utils";
import { CategoryIcon, IconSearch, IconClose, IconCrosshair, IconSpinner } from "../icons";
import type { Category } from "@/lib/types";

const SORTS = [
  { key: "newest", label: "Yeni" },
  { key: "supported", label: "En çok desteklenen" },
  { key: "nearest", label: "En yakın" },
  { key: "longest_open", label: "Uzun süredir açık" },
  { key: "resolved", label: "Çözülenler" },
] as const;

/**
 * Keşfet filtreleri. Her filtre URL'ye yazılır: sonuç paylaşılabilir,
 * geri tuşu çalışır ve sunucu tarafında gerçekten filtrelenmiş veri döner.
 */
export function ExploreFilters({
  categories, neighborhoods, autofocusSearch,
}: {
  categories: Category[];
  neighborhoods: Array<{ slug: string; name: string; open_count: number }>;
  autofocusSearch?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [locating, setLocating] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const sort = params.get("sirala") ?? "newest";
  const category = params.get("kategori");
  const neighborhood = params.get("mahalle");

  useEffect(() => {
    if (autofocusSearch) searchRef.current?.focus();
  }, [autofocusSearch]);

  const update = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      next.delete("odak");
      next.delete("sayfa");
      startTransition(() => router.replace(`${pathname}?${next}`, { scroll: false }));
    },
    [params, pathname, router],
  );

  useEffect(() => {
    const current = params.get("q") ?? "";
    if (query === current) return;
    const id = setTimeout(() => update({ q: query || null }), 350);
    return () => clearTimeout(id);
  }, [query, params, update]);

  const sortByDistance = () => {
    if (!("geolocation" in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        update({
          sirala: "nearest",
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
        });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <IconSearch size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Sorun, adres veya referans kodu ara"
          aria-label="Sorun ara"
          className="h-12 w-full rounded-xl border-0 bg-white pl-11 pr-10 text-base text-ink-900 ring-1 ring-inset ring-line placeholder:text-ink-400 focus:ring-2 focus:ring-teal-600"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Aramayı temizle"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
          >
            <IconClose size={17} />
          </button>
        )}
        {pending && <IconSpinner size={16} className="absolute right-10 top-1/2 -translate-y-1/2 text-ink-400" />}
      </div>

      <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4">
        {SORTS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => (s.key === "nearest" ? sortByDistance() : update({ sirala: s.key, lat: null, lng: null }))}
            aria-pressed={sort === s.key}
            className={cx(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium transition-colors",
              sort === s.key ? "bg-ink-900 text-white" : "bg-white text-ink-600 ring-1 ring-line hover:bg-surface-muted",
            )}
          >
            {s.key === "nearest" && (locating ? <IconSpinner size={13} /> : <IconCrosshair size={13} />)}
            {s.label}
          </button>
        ))}
      </div>

      <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4">
        <FilterChip active={!category} onClick={() => update({ kategori: null })}>Tüm kategoriler</FilterChip>
        {categories.map((c) => (
          <FilterChip key={c.slug} active={category === c.slug} onClick={() => update({ kategori: c.slug })}>
            <span style={{ color: c.color }}><CategoryIcon name={c.icon} size={14} /></span>
            {c.name}
          </FilterChip>
        ))}
      </div>

      {neighborhoods.length > 1 && (
        <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4">
          <FilterChip active={!neighborhood} onClick={() => update({ mahalle: null })}>Tüm mahalleler</FilterChip>
          {neighborhoods.map((n) => (
            <FilterChip key={n.slug} active={neighborhood === n.slug} onClick={() => update({ mahalle: n.slug })}>
              {n.name}
              <span className="text-ink-400">{n.open_count}</span>
            </FilterChip>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-2xs font-medium transition-colors",
        active ? "bg-ink-100 text-ink-900 ring-1 ring-ink-300" : "bg-white text-ink-600 ring-1 ring-line hover:bg-surface-muted",
      )}
    >
      {children}
    </button>
  );
}
