"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  AttributionControl,
  type GeoJSONSource,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ATTRIBUTION, resolveMapStyle, isFallback } from "./style";
import { ensurePinImages, HALO_IMAGE_ID, type PinState } from "./pins";
import { publicConfig } from "@/lib/public-config";

export type MapFeature = {
  id: string;
  slug: string;
  title: string;
  status: string;
  lat: number;
  lng: number;
  color: string;
  icon: string;
  category: string;
  rootId: string;
  neighborhood: string | null;
  address: string | null;
  supports: number;
  cover: string | null;
  createdAt: string;
  resolved: boolean;
  state: PinState;
};

type Props = {
  categoryFilter: string[];
  statusFilter: string[];
  neighborhood: string | null;
  selectedId: string | null;
  onSelect: (feature: MapFeature | null) => void;
  onFeaturesChange?: (features: MapFeature[]) => void;
  onLoadingChange?: (loading: boolean) => void;
  userLocation: { lat: number; lng: number } | null;
  focus?: { lat: number; lng: number; zoom?: number } | null;
  className?: string;
};

const SOURCE = "ayra-reports";

/** Kümedeki bildirimlerin durum dağılımı — halkanın rengini bu belirler. */
const CLUSTER_PROPERTIES = {
  overdue: ["+", ["case", ["==", ["get", "state"], "overdue"], 1, 0]],
  resolved: ["+", ["case", ["==", ["get", "state"], "resolved"], 1, 0]],
} as const;

export function ReportMap({
  categoryFilter, statusFilter, neighborhood, selectedId, onSelect, onFeaturesChange,
  onLoadingChange, userLocation, focus, className,
}: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const userMarker = useRef<Marker | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sık değişen değerler ref üzerinden okunur; harita bir kez kurulur.
  const filters = useRef({ categoryFilter, statusFilter, neighborhood });
  filters.current = { categoryFilter, statusFilter, neighborhood };
  const callbacks = useRef({ onSelect, onFeaturesChange, onLoadingChange });
  callbacks.current = { onSelect, onFeaturesChange, onLoadingChange };

  const [ready, setReady] = useState(false);
  const [tilesOffline, setTilesOffline] = useState(false);

  const fetchViewport = useCallback(async () => {
    const m = map.current;
    if (!m || !m.getSource(SOURCE)) return;
    const b = m.getBounds();

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    callbacks.current.onLoadingChange?.(true);

    const params = new URLSearchParams({
      minLat: String(b.getSouth()), minLng: String(b.getWest()),
      maxLat: String(b.getNorth()), maxLng: String(b.getEast()),
    });
    const { categoryFilter: cats, statusFilter: sts, neighborhood: nbhd } = filters.current;
    if (cats.length) params.set("kategori", cats.join(","));
    if (sts.length) params.set("durum", sts.join(","));
    if (nbhd) params.set("mahalle", nbhd);

    try {
      const res = await fetch(`/api/harita?${params}`, { signal: controller.signal });
      if (!res.ok) return;
      const data = (await res.json()) as {
        features: Array<{ properties: MapFeature }>;
      };

      const items = (data.features ?? []).map((f) => f.properties);

      // Pin görselleri veriye göre üretilir: yalnızca ekranda görünen
      // kategori/durum çiftleri çizilir.
      const changed = await ensurePinImages(m, items.map((f) => ({
        icon: f.icon, color: f.color, state: f.state,
      })));

      (m.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(
        data as unknown as GeoJSON.FeatureCollection,
      );
      if (changed) m.triggerRepaint();
      callbacks.current.onFeaturesChange?.(items);
    } catch (err) {
      if ((err as Error).name !== "AbortError") console.error("harita verisi", err);
    } finally {
      if (abortRef.current === controller) callbacks.current.onLoadingChange?.(false);
    }
  }, []);

  const scheduleFetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void fetchViewport(), 250);
  }, [fetchViewport]);

  useEffect(() => {
    if (!container.current || map.current) return;
    let disposed = false;
    let cleanup = () => {};

    void (async () => {
      const style = await resolveMapStyle();
      if (disposed || !container.current || map.current) return;
      if (isFallback(style)) setTilesOffline(true);

      const m = new MapLibreMap({
        container: container.current,
        style: style as StyleSpecification,
        center: [publicConfig.defaultCenter.lng, publicConfig.defaultCenter.lat],
        zoom: publicConfig.defaultCenter.zoom,
        minZoom: 9,
        maxZoom: 19,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
      });
      m.touchZoomRotate.disableRotation();
      map.current = m;

      m.addControl(new AttributionControl({ compact: true, customAttribution: ATTRIBUTION }), "bottom-right");
      m.addControl(new NavigationControl({ showCompass: false }), "bottom-right");

      const installLayers = () => {
        if (m.getSource(SOURCE) || !m.isStyleLoaded()) return;
        try {
          // Küme sayısı yazı katmanıyla çizilir; stil glyph sunmuyorsa
          // (yedek stil) numarasız daireler bilgi taşımaz — o durumda
          // kümeleme kapatılır ve her bildirim kendi pini olarak görünür.
          const canLabel = Boolean(m.getStyle().glyphs);

          m.addSource(SOURCE, {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
            cluster: canLabel,
            clusterRadius: 48,
            clusterMaxZoom: 15,
            clusterProperties: CLUSTER_PROPERTIES as unknown as Record<string, unknown>,
          });

          /* — Kümeler ————————————————————————————————————————
             Sayı, tek renkli bir lacivert ölçekte koyulukla kodlanır.
             Gökkuşağı bir ölçek "az/çok"u değil "farklı şeyler"i çağrıştırır;
             renk burada anlam taşımaz, yalnızca büyüklük taşır. Durum bilgisi
             kümenin halkasında ayrıca gösterilir.                             */
          m.addLayer({
            id: "clusters",
            type: "circle",
            source: SOURCE,
            filter: ["has", "point_count"],
            paint: {
              "circle-color": [
                "step", ["get", "point_count"],
                "#46608a", 5, "#2f4870", 10, "#1f3557", 25, "#0b1c33",
              ],
              "circle-radius": [
                "step", ["get", "point_count"], 18, 5, 22, 10, 26, 25, 31,
              ],
              "circle-stroke-width": 3,
              "circle-stroke-color": [
                "case",
                [">", ["get", "overdue"], 0], "#b8860b",
                "rgba(255,255,255,0.94)",
              ],
            },
          });

          if (canLabel) {
            m.addLayer({
              id: "cluster-count",
              type: "symbol",
              source: SOURCE,
              filter: ["has", "point_count"],
              layout: {
                "text-field": ["get", "point_count_abbreviated"],
                "text-font": ["Noto Sans Bold"],
                "text-size": ["step", ["get", "point_count"], 12, 10, 13, 25, 14],
                "text-allow-overlap": true,
              },
              paint: { "text-color": "#ffffff" },
            });
          }

          /* — Seçili pinin vurgusu ————————————————————————— */
          m.addLayer({
            id: "report-halo",
            type: "symbol",
            source: SOURCE,
            filter: ["==", ["get", "id"], "__none__"],
            layout: {
              "icon-image": HALO_IMAGE_ID,
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
              "icon-anchor": "bottom",
              "icon-offset": [0, 26],
              "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 0.7, 16, 1],
            },
          });

          /* — Tekil bildirimler ————————————————————————————
             Her pin kendi kategori ikonunu ve durumunu taşır.               */
          m.addLayer({
            id: "reports",
            type: "symbol",
            source: SOURCE,
            filter: ["!", ["has", "point_count"]],
            layout: {
              "icon-image": [
                "concat", "pin:", ["get", "icon"], ":", ["get", "color"], ":", ["get", "state"],
              ],
              "icon-anchor": "bottom",
              "icon-allow-overlap": true,
              "icon-ignore-placement": true,
              "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 0.55, 15, 0.78, 17, 0.95],
              "symbol-sort-key": [
                "case",
                ["==", ["get", "state"], "overdue"], 0,
                ["==", ["get", "state"], "open"], 1,
                2,
              ],
            },
          });

          setReady(true);
          void fetchViewport();
        } catch (err) {
          console.error("harita katmanları kurulamadı", err);
        }
      };

      m.on("error", (event) => {
        const message = String(event?.error?.message ?? "");
        if (/tile|sprite|glyph/i.test(message)) setTilesOffline(true);
        else if (message) console.error("harita", message);
      });

      m.on("load", installLayers);
      m.on("styledata", installLayers);
      m.on("idle", installLayers);
      m.on("moveend", scheduleFetch);

      m.on("click", "clusters", async (e) => {
        const feature = m.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
        const clusterId = feature?.properties?.cluster_id;
        if (clusterId == null) return;
        const source = m.getSource(SOURCE) as GeoJSONSource;
        const zoom = await source.getClusterExpansionZoom(clusterId as number);
        m.easeTo({
          center: (feature.geometry as GeoJSON.Point).coordinates as [number, number],
          zoom: Math.max(zoom, m.getZoom() + 1.2),
        });
      });

      m.on("click", "reports", (e) => {
        const props = e.features?.[0]?.properties as MapFeature | undefined;
        if (props) callbacks.current.onSelect({ ...props, resolved: Boolean(props.resolved) });
      });

      m.on("click", (e) => {
        if (!m.getLayer("reports")) return;
        const hits = m.queryRenderedFeatures(e.point, { layers: ["reports", "clusters"] });
        if (!hits.length) callbacks.current.onSelect(null);
      });

      for (const layer of ["clusters", "reports"]) {
        m.on("mouseenter", layer, () => { m.getCanvas().style.cursor = "pointer"; });
        m.on("mouseleave", layer, () => { m.getCanvas().style.cursor = ""; });
      }

      cleanup = () => { m.remove(); map.current = null; };
    })();

    return () => {
      disposed = true;
      abortRef.current?.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filtre değişince yeniden çek
  useEffect(() => {
    if (ready) void fetchViewport();
  }, [ready, categoryFilter, statusFilter, neighborhood, fetchViewport]);

  // Seçili pin vurgusu
  useEffect(() => {
    const m = map.current;
    if (!m || !ready || !m.getLayer("report-halo")) return;
    m.setFilter("report-halo", ["==", ["get", "id"], selectedId ?? "__none__"]);
  }, [selectedId, ready]);

  // Kullanıcı konumu
  useEffect(() => {
    const m = map.current;
    if (!m || !userLocation) return;
    if (!userMarker.current) {
      const el = document.createElement("div");
      el.className = "ayra-user-dot";
      el.setAttribute("aria-hidden", "true");
      userMarker.current = new Marker({ element: el }).setLngLat([userLocation.lng, userLocation.lat]).addTo(m);
    } else {
      userMarker.current.setLngLat([userLocation.lng, userLocation.lat]);
    }
  }, [userLocation]);

  // Dışarıdan odaklama (listeden "Haritada gör")
  useEffect(() => {
    if (!focus || !map.current) return;
    map.current.easeTo({ center: [focus.lng, focus.lat], zoom: focus.zoom ?? 16.5, duration: 700 });
  }, [focus]);

  return (
    <div className={className}>
      <div ref={container} className="size-full" role="application" aria-label="Sorun bildirimleri haritası" />

      {tilesOffline && (
        <div className="pointer-events-none absolute inset-x-0 top-3 z-10 mx-auto w-fit max-w-[92%] rounded-lg bg-white/95 px-3 py-1.5 text-center text-2xs text-ink-600 shadow-card">
          Harita altlığı yüklenemedi — bildirimler yine de görüntüleniyor.
        </div>
      )}

      <style>{`
        .ayra-user-dot {
          width: 16px; height: 16px; border-radius: 50%;
          background: var(--color-teal-500);
          box-shadow: 0 0 0 4px rgba(20,163,141,.22), 0 0 0 1.5px #fff inset;
        }
      `}</style>
    </div>
  );
}
