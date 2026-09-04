"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { cx } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { ReportMap, type MapFeature } from "./ReportMap";
import { MapReportSheet } from "./MapReportSheet";
import { MapFilterSheet } from "./MapFilterSheet";
import { MapReportList } from "./MapReportList";
import { MapLegend } from "./MapLegend";
import { IconCrosshair, IconPlus, IconFilter, IconSpinner, IconChevronDown } from "../icons";
import type { Category, PlatformStats, ReportStatus } from "@/lib/types";

export type MapNeighborhood = {
  slug: string;
  name: string;
  center_lat: number | null;
  center_lng: number | null;
};

/** Hızlı durum kısayolları. Ayrıntılı seçim filtre sayfasında yapılır. */
const PRESETS: Array<{ key: string; label: string; statuses: ReportStatus[] }> = [
  { key: "all", label: "Tümü", statuses: [] },
  {
    key: "open",
    label: "Açık",
    statuses: ["new", "verified", "forwarded", "in_review", "awaiting_resolution"],
  },
  { key: "resolved", label: "Çözülenler", statuses: ["resolved"] },
];

const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v) => b.includes(v));

export function MapScreen({
  categories, stats, neighborhoods,
}: {
  categories: Category[];
  stats: PlatformStats;
  neighborhoods: MapNeighborhood[];
}) {
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<ReportStatus[]>([]);
  const [neighborhood, setNeighborhood] = useState<string | null>(null);

  const [features, setFeatures] = useState<MapFeature[]>([]);
  const [selected, setSelected] = useState<MapFeature | null>(null);
  const [loading, setLoading] = useState(false);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const activePreset =
    PRESETS.find((p) => sameSet(p.statuses, statuses))?.key ?? "custom";
  const activeFilterCount =
    selectedCategories.length + (statuses.length > 0 ? 1 : 0) + (neighborhood ? 1 : 0);

  /** Görünen alandaki bildirimlerin ana kategorilere göre dağılımı. */
  const counts = useMemo(() => {
    const byRootId = new Map<string, number>();
    for (const f of features) byRootId.set(f.rootId, (byRootId.get(f.rootId) ?? 0) + 1);
    const result: Record<string, number> = {};
    for (const c of categories) result[c.slug] = byRootId.get(c.id) ?? 0;
    return result;
  }, [features, categories]);

  const toggleCategory = useCallback((slug: string) => {
    setSelectedCategories((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }, []);

  const toggleStatus = useCallback((status: ReportStatus) => {
    setStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status],
    );
  }, []);

  const chooseNeighborhood = useCallback(
    (slug: string | null) => {
      setNeighborhood(slug);
      const target = neighborhoods.find((n) => n.slug === slug);
      if (target?.center_lat != null && target.center_lng != null) {
        setFocus({ lat: target.center_lat, lng: target.center_lng, zoom: 15 });
      }
    },
    [neighborhoods],
  );

  const resetFilters = useCallback(() => {
    setSelectedCategories([]);
    setStatuses([]);
    setNeighborhood(null);
  }, []);

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setLocationError("Tarayıcınız konum desteklemiyor.");
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        setFocus({ ...loc, zoom: 16 });
        setLocating(false);
      },
      () => {
        setLocationError("Konum alınamadı. Tarayıcı ayarlarından izin verebilirsiniz.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }, []);

  /** Listeden bir kayda tıklandığında harita oraya gider ve pin seçilir. */
  const focusFeature = useCallback((f: MapFeature) => {
    setSelected(f);
    setListOpen(false);
    setFocus({ lat: f.lat, lng: f.lng, zoom: 16.5 });
  }, []);

  const overdueCount = features.filter((f) => f.state === "overdue").length;

  return (
    // Yükseklik: mobilde başlık (3.5rem) ve alt navigasyon (4rem) düşülür;
    // masaüstünde alt navigasyon yoktur.
    <div className="flex h-[calc(100dvh-7.5rem)] flex-col lg:h-[calc(100dvh-4rem)]">
      {/* ── Araç çubuğu ──────────────────────────────────────────────── */}
      <div className="z-20 flex items-center gap-2 border-b border-line bg-white px-3 py-2">
        <button
          type="button"
          onClick={() => setFiltersOpen(true)}
          className={cx(
            "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
            activeFilterCount > 0
              ? "bg-ink-900 text-white"
              : "bg-white text-ink-700 ring-1 ring-line hover:bg-surface-muted",
          )}
        >
          <IconFilter size={15} />
          Filtre
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-white/20 px-1.5 text-2xs tabular-nums">
              {activeFilterCount}
            </span>
          )}
        </button>

        <div className="scrollbar-none flex min-w-0 gap-1.5 overflow-x-auto" role="group" aria-label="Durum kısayolu">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setStatuses(p.statuses)}
              aria-pressed={activePreset === p.key}
              className={cx(
                "h-8 shrink-0 whitespace-nowrap rounded-full px-3 text-2xs font-medium transition-colors",
                activePreset === p.key
                  ? "bg-ink-100 text-ink-900 ring-1 ring-ink-300"
                  : "text-ink-500 hover:bg-surface-muted",
              )}
            >
              {p.label}
            </button>
          ))}
          {activePreset === "custom" && (
            <span className="flex h-8 shrink-0 items-center rounded-full bg-ink-100 px-3 text-2xs font-medium text-ink-900 ring-1 ring-ink-300">
              Özel ({statuses.length})
            </span>
          )}
        </div>

        <p
          className="ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap text-2xs tabular-nums text-ink-500"
          aria-live="polite"
        >
          {loading && <IconSpinner size={13} />}
          {features.length > 0 ? `${formatNumber(features.length)} bildirim` : "Bildirim yok"}
        </p>
      </div>

      {/* ── Gövde: masaüstünde liste + harita, mobilde harita ───────── */}
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[22rem] shrink-0 flex-col border-r border-line bg-white lg:flex">
          <div className="flex items-baseline justify-between border-b border-line px-3 py-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              Görünen alandaki bildirimler
            </h2>
            {overdueCount > 0 && (
              <span className="text-2xs font-medium text-[#8a5a08]">
                {formatNumber(overdueCount)} yanıt gecikti
              </span>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <MapReportList
              items={features}
              selectedId={selected?.id ?? null}
              onSelect={focusFeature}
              loading={loading}
            />
          </div>

          {/* Platform toplamları — haritanın üzerini kapatmak yerine listenin
              altında, sabit ve okunur bir yerde durur. */}
          <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2.5 text-xs">
            <Stat value={stats.total_reports} label="bildirim" />
            <Stat value={stats.total_supports} label="destek" />
            <Stat value={stats.resolved_reports} label="çözüldü" accent />
          </div>
        </aside>

        {/* Harita sütunu: mobilde liste şeridi haritanın üzerine binmez,
            altında ayrı bir satır olarak durur — böylece yakınlaştırma ve
            konum düğmeleri hiçbir zaman kapanmaz. */}
        <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1">
          <ReportMap
            className="absolute inset-0"
            categoryFilter={selectedCategories}
            statusFilter={statuses}
            neighborhood={neighborhood}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            onFeaturesChange={setFeatures}
            onLoadingChange={setLoading}
            userLocation={userLocation}
            focus={focus}
          />

          {/* Gösterge — sol alt */}
          <div className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[calc(100%-1.5rem)]">
            <MapLegend categories={categories} />
          </div>

          {/* Konum ve bildir — sağ */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col items-end gap-2 p-3">
            {locationError && (
              <p
                className="pointer-events-auto mx-auto rounded-lg bg-white px-3 py-2 text-2xs text-ink-600 shadow-card"
                role="alert"
              >
                {locationError}
              </p>
            )}
            <button
              type="button"
              onClick={locate}
              disabled={locating}
              aria-label="Konumumu bul"
              className="pointer-events-auto flex size-11 items-center justify-center rounded-xl bg-white text-ink-700 shadow-raise ring-1 ring-line transition-colors hover:bg-surface-muted disabled:opacity-60"
            >
              {locating ? <IconSpinner size={19} /> : <IconCrosshair size={20} />}
            </button>

            <Link
              href="/bildir"
              className="pointer-events-auto hidden h-12 items-center gap-2 rounded-xl bg-ink-900 px-5 text-sm font-medium text-white shadow-raise transition-colors hover:bg-ink-800 lg:inline-flex"
            >
              <IconPlus size={18} /> Sorun bildir
            </Link>
          </div>

          {/* Seçili bildirim önizlemesi */}
          {selected && <MapReportSheet feature={selected} onClose={() => setSelected(null)} />}

        </div>

        {/* Mobil: listeyi açan şerit. Haritanın üzerine binmez, altında ayrı
            bir satır olarak durur — yakınlaştırma ve konum düğmeleri hiçbir
            zaman kapanmaz. */}
        <button
          type="button"
          onClick={() => setListOpen(true)}
          disabled={features.length === 0}
          className="flex h-14 shrink-0 items-center justify-between gap-3 border-t border-line bg-ink-900 px-4 text-sm font-medium text-white transition-colors disabled:bg-ink-600 lg:hidden"
        >
          <span>
            {features.length > 0
              ? `${formatNumber(features.length)} bildirimi listele`
              : "Bu alanda bildirim yok"}
          </span>
          <span className="flex items-center gap-2">
            {overdueCount > 0 && (
              <span className="rounded-full bg-[#e0b25a] px-2 py-0.5 text-2xs font-semibold tabular-nums text-[#3a2905]">
                {formatNumber(overdueCount)} gecikti
              </span>
            )}
            {features.length > 0 && <IconChevronDown size={18} className="rotate-180" />}
          </span>
        </button>
        </div>
      </div>

      {/* ── Mobil liste sayfası ──────────────────────────────────────── */}
      {listOpen && (
        <div className="fixed inset-0 z-40 flex items-end lg:hidden">
          <button
            type="button"
            aria-label="Listeyi kapat"
            onClick={() => setListOpen(false)}
            className="absolute inset-0 bg-ink-950/35"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Görünen alandaki bildirimler"
            className="relative flex max-h-[78dvh] w-full flex-col rounded-t-2xl bg-white shadow-sheet"
          >
            <header className="flex items-center justify-between border-b border-line px-4 py-3">
              <div>
                <h2 className="text-base font-semibold text-ink-900">
                  {formatNumber(features.length)} bildirim
                </h2>
                <p className="text-2xs text-ink-500">
                  Haritanın görünen alanında · yanıtı geciken önce
                </p>
              </div>
              <button
                type="button"
                onClick={() => setListOpen(false)}
                aria-label="Kapat"
                className="tap-target flex items-center justify-center rounded-lg text-ink-500 hover:text-ink-900"
              >
                <IconChevronDown size={22} />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
              <MapReportList
                items={features}
                selectedId={selected?.id ?? null}
                onSelect={focusFeature}
                loading={loading}
              />
            </div>
          </div>
        </div>
      )}

      <MapFilterSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        categories={categories}
        counts={counts}
        selectedCategories={selectedCategories}
        onToggleCategory={toggleCategory}
        selectedStatuses={statuses}
        onToggleStatus={toggleStatus}
        neighborhoods={neighborhoods}
        neighborhood={neighborhood}
        onNeighborhood={chooseNeighborhood}
        onReset={resetFilters}
        total={features.length}
      />
    </div>
  );
}

function Stat({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <strong className={cx("font-semibold", accent ? "text-teal-700" : "text-ink-900")}>
        {formatNumber(value)}
      </strong>
      <span className="text-ink-500">{label}</span>
    </span>
  );
}
