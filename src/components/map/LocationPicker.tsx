"use client";

import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  NavigationControl,
  AttributionControl,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ATTRIBUTION, resolveMapStyle, isFallback } from "./style";
import { publicConfig } from "@/lib/public-config";

/**
 * Konum seçici. Pin ekranın ortasında sabit durur, harita altından kayar —
 * mobilde parmakla küçük bir işareti sürüklemekten çok daha kolaydır ve
 * seçim her zaman ekranın tam ortasında, parmağın altında kalmaz.
 */
export function LocationPicker({
  value, onChange, className,
}: {
  value: { lat: number; lng: number } | null;
  onChange: (coords: { lat: number; lng: number }) => void;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [moving, setMoving] = useState(false);
  const [offline, setOffline] = useState(false);

  // Efekt yeniden çalışmasın diye güncel değerler ref üzerinden okunur.
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  valueRef.current = value;
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!container.current || map.current) return;
    let disposed = false;
    let cleanup = () => {};

    void (async () => {
      const style = await resolveMapStyle();
      if (disposed || !container.current || map.current) return;
      if (isFallback(style)) setOffline(true);

      const start = valueRef.current ?? publicConfig.defaultCenter;
      const m = new MapLibreMap({
        container: container.current,
        style: style as StyleSpecification,
        center: [start.lng, start.lat],
        zoom: valueRef.current ? 17 : publicConfig.defaultCenter.zoom + 2,
        minZoom: 12,
        maxZoom: 19,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
      });
      m.touchZoomRotate.disableRotation();
      map.current = m;

      m.addControl(new AttributionControl({ compact: true, customAttribution: ATTRIBUTION }), "bottom-right");
      m.addControl(new NavigationControl({ showCompass: false }), "bottom-right");

      const emit = () => {
        const c = m.getCenter();
        onChangeRef.current({ lat: Number(c.lat.toFixed(6)), lng: Number(c.lng.toFixed(6)) });
      };

      // Konum izni verilmese veya harita hiç hareket ettirilmese bile akış
      // ilerleyebilmeli: hazır olur olmaz mevcut merkez seçim olarak bildirilir.
      m.on("load", emit);
      m.on("idle", () => { if (!valueRef.current) emit(); });

      m.on("movestart", () => setMoving(true));
      m.on("moveend", () => { setMoving(false); emit(); });

      cleanup = () => { m.remove(); map.current = null; };
    })();

    return () => { disposed = true; cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Dışarıdan konum güncellemesi (ör. "Konumumu kullan")
  useEffect(() => {
    const m = map.current;
    if (!m || !value) return;
    const c = m.getCenter();
    if (Math.abs(c.lat - value.lat) < 1e-5 && Math.abs(c.lng - value.lng) < 1e-5) return;
    m.easeTo({ center: [value.lng, value.lat], zoom: Math.max(m.getZoom(), 17), duration: 600 });
  }, [value]);

  return (
    <div className={className}>
      <div ref={container} className="size-full" aria-label="Konum seçimi haritası" role="application" />

      {/* Sabit merkez pini */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-6">
        <svg
          width="38" height="46" viewBox="0 0 38 46" aria-hidden="true"
          className={moving ? "-translate-y-1.5 transition-transform" : "transition-transform"}
        >
          <ellipse cx="19" cy="43" rx="6" ry="2.4" fill="rgba(11,28,51,.22)" />
          <path
            d="M19 2c-7.2 0-13 5.7-13 12.8C6 24 17.3 36.4 18.2 37.4a1.1 1.1 0 0 0 1.6 0C20.7 36.4 32 24 32 14.8 32 7.7 26.2 2 19 2Z"
            fill="var(--color-ink-900)" stroke="#fff" strokeWidth="2.2"
          />
          <circle cx="19" cy="14.6" r="4.6" fill="var(--color-teal-400)" />
        </svg>
      </div>

      {offline && (
        <p className="pointer-events-none absolute inset-x-0 top-2 mx-auto w-fit rounded-lg bg-white/95 px-3 py-1.5 text-2xs text-ink-600 shadow-card">
          Harita altlığı yüklenemedi — konumu yine de sürükleyerek seçebilirsiniz.
        </p>
      )}
    </div>
  );
}
