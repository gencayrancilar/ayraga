"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, NavigationControl, AttributionControl, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ATTRIBUTION, resolveMapStyle, isFallback } from "../map/style";
import { publicConfig } from "@/lib/public-config";
import { cx } from "@/lib/utils";

export type HeatPoint = { latitude: number; longitude: number; support_count: number };

/**
 * Isı haritası. Yoğunluk yalnızca bildirim sayısına değil, destek sayısına da
 * duyarlıdır: çok desteklenen bir sorun haritada daha ağır görünür.
 */
export function HeatMap({
  points, categories, activeCategory, onCategoryChange, className,
}: {
  points: HeatPoint[];
  categories: Array<{ slug: string; name: string; color: string }>;
  activeCategory: string | null;
  onCategoryChange: (slug: string | null) => void;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [offline, setOffline] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!container.current || map.current) return;
    let disposed = false;
    let cleanup = () => {};

    void (async () => {
      const style = await resolveMapStyle();
      if (disposed || !container.current) return;
      if (isFallback(style)) setOffline(true);

      const m = new MapLibreMap({
        container: container.current,
        style: style as StyleSpecification,
        center: [publicConfig.defaultCenter.lng, publicConfig.defaultCenter.lat],
        zoom: publicConfig.defaultCenter.zoom - 0.5,
        attributionControl: false,
        dragRotate: false,
      });
      map.current = m;
      m.addControl(new AttributionControl({ compact: true, customAttribution: ATTRIBUTION }), "bottom-right");
      m.addControl(new NavigationControl({ showCompass: false }), "bottom-right");

      const install = () => {
        if (!m.isStyleLoaded() || m.getSource("heat")) return;
        m.addSource("heat", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        m.addLayer({
          id: "heat",
          type: "heatmap",
          source: "heat",
          paint: {
            "heatmap-weight": ["interpolate", ["linear"], ["get", "w"], 0, 0.4, 50, 1],
            "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 10, 1, 17, 3],
            "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 10, 14, 17, 42],
            "heatmap-opacity": 0.75,
            "heatmap-color": [
              "interpolate", ["linear"], ["heatmap-density"],
              0,   "rgba(11,28,51,0)",
              0.2, "rgba(104,216,195,0.55)",
              0.4, "rgba(20,163,141,0.7)",
              0.6, "rgba(224,182,74,0.78)",
              0.8, "rgba(224,122,74,0.85)",
              1,   "rgba(159,18,57,0.9)",
            ],
          },
        });
        setReady(true);
      };

      m.on("load", install);
      m.on("styledata", install);
      m.on("idle", install);

      cleanup = () => { m.remove(); map.current = null; };
    })();

    return () => { disposed = true; cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const source = m.getSource("heat");
    if (!source || !("setData" in source)) return;
    (source as { setData: (d: GeoJSON.FeatureCollection) => void }).setData({
      type: "FeatureCollection",
      features: points.map((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.longitude, p.latitude] },
        properties: { w: p.support_count },
      })),
    });
  }, [points, ready]);

  return (
    <div className="space-y-3">
      <div className="scrollbar-none flex gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => onCategoryChange(null)}
          aria-pressed={!activeCategory}
          className={cx(
            "h-8 shrink-0 rounded-full px-3 text-2xs font-medium transition-colors",
            !activeCategory ? "bg-ink-900 text-white" : "bg-white text-ink-600 ring-1 ring-line",
          )}
        >
          Tüm kategoriler
        </button>
        {categories.map((c) => (
          <button
            key={c.slug}
            type="button"
            onClick={() => onCategoryChange(c.slug)}
            aria-pressed={activeCategory === c.slug}
            className={cx(
              "flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-2xs font-medium transition-colors",
              activeCategory === c.slug ? "bg-ink-900 text-white" : "bg-white text-ink-600 ring-1 ring-line",
            )}
          >
            <span className="size-2 rounded-[3px]" style={{ background: c.color }} />
            {c.name}
          </button>
        ))}
      </div>

      <div className={cx("relative overflow-hidden rounded-2xl ring-1 ring-line", className)}>
        <div ref={container} className="size-full" role="application" aria-label="Sorun yoğunluğu ısı haritası" />
        {offline && (
          <p className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit rounded-lg bg-white/95 px-3 py-1.5 text-2xs text-ink-600 shadow-card">
            Harita altlığı yüklenemedi — yoğunluk katmanı yine de çiziliyor.
          </p>
        )}
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-xl bg-white/95 px-3 py-2 text-2xs shadow-card">
          <p className="mb-1 font-medium text-ink-700">Yoğunluk</p>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-24 rounded-full" style={{ background: "linear-gradient(90deg, rgba(104,216,195,.6), rgba(20,163,141,.8), rgba(224,182,74,.85), rgba(159,18,57,.9))" }} />
            <span className="text-ink-500">az → çok</span>
          </div>
        </div>
      </div>
    </div>
  );
}
