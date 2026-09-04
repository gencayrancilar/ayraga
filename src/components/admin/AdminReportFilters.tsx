"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { cx } from "@/lib/utils";
import { STATUS } from "@/lib/status";
import { IconSearch, IconSpinner } from "../icons";
import type { Category, ReportStatus } from "@/lib/types";

const STATUS_KEYS: ReportStatus[] = [
  "new", "verified", "forwarded", "in_review", "awaiting_resolution",
  "resolved", "unresolved", "duplicate", "rejected",
];

export function AdminReportFilters({
  categories, neighborhoods,
}: {
  categories: Category[];
  neighborhoods: Array<{ slug: string; name: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get("q") ?? "");

  const selectedStatus = (params.get("durum") ?? "").split(",").filter(Boolean);

  const update = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v) next.delete(k); else next.set(k, v);
    }
    next.delete("sayfa");
    start(() => router.replace(`${pathname}?${next}`, { scroll: false }));
  }, [params, pathname, router]);

  useEffect(() => {
    const current = params.get("q") ?? "";
    if (q === current) return;
    const id = setTimeout(() => update({ q: q || null }), 350);
    return () => clearTimeout(id);
  }, [q, params, update]);

  const toggleStatus = (key: string) => {
    const next = selectedStatus.includes(key)
      ? selectedStatus.filter((s) => s !== key)
      : [...selectedStatus, key];
    update({ durum: next.join(",") || null });
  };

  return (
    <div className="space-y-2.5 rounded-2xl bg-white p-3.5 ring-1 ring-line">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Başlık, adres veya AYRA-000000"
            aria-label="Bildirim ara"
            className="h-10 w-full rounded-xl border-0 bg-surface-muted pl-9 pr-8 text-sm ring-1 ring-inset ring-line focus:ring-2 focus:ring-teal-600"
          />
          {pending && <IconSpinner size={15} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400" />}
        </div>

        <select
          value={params.get("kategori") ?? ""}
          onChange={(e) => update({ kategori: e.target.value || null })}
          aria-label="Kategori"
          className="h-10 rounded-xl border-0 bg-surface-muted px-3 text-sm ring-1 ring-inset ring-line focus:ring-2 focus:ring-teal-600"
        >
          <option value="">Tüm kategoriler</option>
          {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </select>

        <select
          value={params.get("mahalle") ?? ""}
          onChange={(e) => update({ mahalle: e.target.value || null })}
          aria-label="Mahalle"
          className="h-10 rounded-xl border-0 bg-surface-muted px-3 text-sm ring-1 ring-inset ring-line focus:ring-2 focus:ring-teal-600"
        >
          <option value="">Tüm mahalleler</option>
          {neighborhoods.map((n) => <option key={n.slug} value={n.slug}>{n.name}</option>)}
        </select>

        <input
          type="date"
          value={params.get("baslangic") ?? ""}
          onChange={(e) => update({ baslangic: e.target.value || null })}
          aria-label="Başlangıç tarihi"
          className="h-10 rounded-xl border-0 bg-surface-muted px-3 text-sm ring-1 ring-inset ring-line focus:ring-2 focus:ring-teal-600"
        />
        <input
          type="date"
          value={params.get("bitis") ?? ""}
          onChange={(e) => update({ bitis: e.target.value || null })}
          aria-label="Bitiş tarihi"
          className="h-10 rounded-xl border-0 bg-surface-muted px-3 text-sm ring-1 ring-inset ring-line focus:ring-2 focus:ring-teal-600"
        />
        <input
          type="number"
          min={0}
          placeholder="Min. destek"
          value={params.get("destek") ?? ""}
          onChange={(e) => update({ destek: e.target.value || null })}
          aria-label="Minimum destek sayısı"
          className="h-10 w-28 rounded-xl border-0 bg-surface-muted px-3 text-sm ring-1 ring-inset ring-line focus:ring-2 focus:ring-teal-600"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => update({ bekleyen: params.get("bekleyen") === "1" ? null : "1" })}
          aria-pressed={params.get("bekleyen") === "1"}
          className={cx(
            "h-8 rounded-full px-3 text-2xs font-medium transition-colors",
            params.get("bekleyen") === "1" ? "bg-[#a16207] text-white" : "bg-surface-muted text-ink-600 ring-1 ring-line",
          )}
        >
          İşlem bekleyenler
        </button>

        {STATUS_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => toggleStatus(key)}
            aria-pressed={selectedStatus.includes(key)}
            className={cx(
              "h-8 rounded-full px-3 text-2xs font-medium transition-colors",
              selectedStatus.includes(key) ? "bg-ink-900 text-white" : "bg-surface-muted text-ink-600 ring-1 ring-line hover:bg-surface-sunken",
            )}
          >
            {STATUS[key].short}
          </button>
        ))}

        {(params.toString().length > 0) && (
          <button
            type="button"
            onClick={() => start(() => router.replace(pathname, { scroll: false }))}
            className="h-8 rounded-full px-3 text-2xs font-medium text-ink-500 hover:text-ink-800"
          >
            Filtreleri temizle
          </button>
        )}
      </div>
    </div>
  );
}
