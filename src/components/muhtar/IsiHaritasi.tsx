"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Map as MapLibreMap, AttributionControl, NavigationControl, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ATTRIBUTION, resolveMapStyle, isFallback } from "@/components/map/style";
import type { IsiNoktasi } from "@/lib/queries/muhtar";
import { cx } from "@/lib/utils";

type Katman = "yogunluk" | "geciken" | "kategori";

const KATMANLAR: Array<{ deger: Katman; etiket: string; aciklama: string }> = [
  { deger: "yogunluk", etiket: "Sorun yoğunluğu", aciklama: "Açık bildirimlerin yoğunlaştığı yerler. Koyuluk destek sayısına göre artar." },
  { deger: "geciken", etiket: "Geciken sorunlar", aciklama: "Kuruma iletilip makul sürede yanıt gelmeyenler. Belediye görüşmesinde elinizdeki liste." },
  { deger: "kategori", etiket: "Kategori dağılımı", aciklama: "Her nokta kendi kategorisinin rengiyle. Hangi tür sorun nerede toplanıyor." },
];

/**
 * Mahalle ısı haritası.
 *
 * Üç katman aynı veriyi farklı sorulara göre gösterir. Isı katmanları
 * MapLibre'nin kendi heatmap tipiyle çizilir; kategori katmanı tek tek
 * noktadır, çünkü orada soru "nerede yoğun" değil "hangi tür nerede".
 */
export function IsiHaritasi({
  noktalar,
  merkez,
}: {
  noktalar: IsiNoktasi[];
  merkez: { lat: number; lng: number };
}) {
  const kap = useRef<HTMLDivElement | null>(null);
  const harita = useRef<MapLibreMap | null>(null);
  const [hazir, setHazir] = useState(false);
  const [cevrimdisi, setCevrimdisi] = useState(false);
  const [katman, setKatman] = useState<Katman>("yogunluk");

  const geojson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: noktalar.map((n) => ({
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [n.longitude, n.latitude] },
        properties: {
          agirlik: n.agirlik,
          gecikti: n.gecikti ? 1 : 0,
          renk: n.category_color,
          baslik: n.title,
          kategori: n.category_name,
        },
      })),
    }),
    [noktalar],
  );

  useEffect(() => {
    if (!kap.current || harita.current) return;
    let atildi = false;

    void (async () => {
      const stil = await resolveMapStyle();
      if (atildi || !kap.current || harita.current) return;
      if (isFallback(stil)) setCevrimdisi(true);

      const m = new MapLibreMap({
        container: kap.current,
        style: stil as StyleSpecification,
        center: [merkez.lng, merkez.lat],
        zoom: 14,
        attributionControl: false,
        dragRotate: false,
      });
      harita.current = m;
      m.addControl(new AttributionControl({ compact: true, customAttribution: ATTRIBUTION }), "bottom-right");
      m.addControl(new NavigationControl({ showCompass: false }), "top-right");

      m.on("load", () => {
        m.addSource("sorunlar", { type: "geojson", data: geojson });

        m.addLayer({
          id: "isi", type: "heatmap", source: "sorunlar",
          paint: {
            "heatmap-weight": ["interpolate", ["linear"], ["get", "agirlik"], 1, 0.35, 40, 1],
            "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 11, 1, 17, 3],
            "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 11, 16, 17, 44],
            "heatmap-opacity": 0.75,
            "heatmap-color": [
              "interpolate", ["linear"], ["heatmap-density"],
              0, "rgba(255,255,255,0)",
              0.2, "#d0f5ec",
              0.4, "#68d8c3",
              0.6, "#14a38d",
              0.8, "#2f4870",
              1, "#0b1c33",
            ],
          },
        });

        m.addLayer({
          id: "geciken-isi", type: "heatmap", source: "sorunlar",
          filter: ["==", ["get", "gecikti"], 1],
          layout: { visibility: "none" },
          paint: {
            "heatmap-weight": ["interpolate", ["linear"], ["get", "agirlik"], 1, 0.4, 40, 1],
            "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 11, 1, 17, 3],
            "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 11, 18, 17, 48],
            "heatmap-opacity": 0.8,
            "heatmap-color": [
              "interpolate", ["linear"], ["heatmap-density"],
              0, "rgba(255,255,255,0)",
              0.3, "#fde68a",
              0.6, "#f59e0b",
              1, "#9f1239",
            ],
          },
        });

        m.addLayer({
          id: "kategori-nokta", type: "circle", source: "sorunlar",
          layout: { visibility: "none" },
          paint: {
            "circle-radius": ["interpolate", ["linear"], ["get", "agirlik"], 1, 4, 40, 12],
            "circle-color": ["get", "renk"],
            "circle-opacity": 0.85,
            "circle-stroke-width": 1,
            "circle-stroke-color": "#ffffff",
          },
        });

        setHazir(true);
      });

      return () => { m.remove(); };
    })();

    return () => {
      atildi = true;
      harita.current?.remove();
      harita.current = null;
    };
    // Harita bir kez kurulur; veri değişimi aşağıdaki efektle işlenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = harita.current;
    if (!m || !hazir) return;
    const kaynak = m.getSource("sorunlar");
    if (kaynak && "setData" in kaynak) (kaynak as { setData: (d: unknown) => void }).setData(geojson);
  }, [geojson, hazir]);

  useEffect(() => {
    const m = harita.current;
    if (!m || !hazir) return;
    const gorunur: Record<Katman, string> = {
      yogunluk: "isi",
      geciken: "geciken-isi",
      kategori: "kategori-nokta",
    };
    for (const [k, id] of Object.entries(gorunur)) {
      m.setLayoutProperty(id, "visibility", k === katman ? "visible" : "none");
    }
  }, [katman, hazir]);

  const gecikenSayisi = noktalar.filter((n) => n.gecikti).length;
  const secili = KATMANLAR.find((k) => k.deger === katman)!;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Harita katmanı">
        {KATMANLAR.map((k) => (
          <button
            key={k.deger}
            type="button"
            onClick={() => setKatman(k.deger)}
            aria-pressed={katman === k.deger}
            className={cx(
              "rounded-full px-3 py-1.5 text-xs transition",
              katman === k.deger ? "bg-ink-900 font-medium text-white" : "bg-white text-ink-600 hover:text-ink-900",
            )}
          >
            {k.etiket}
            {k.deger === "geciken" && gecikenSayisi > 0 && (
              <span className="ml-1.5 tabular-nums opacity-70">{gecikenSayisi}</span>
            )}
          </button>
        ))}
      </div>

      <p className="text-xs text-ink-500">{secili.aciklama}</p>

      <div className="relative overflow-hidden rounded-2xl border border-line">
        <div ref={kap} className="h-[62vh] min-h-80 w-full bg-surface-sunken" />
        {cevrimdisi && (
          <p className="absolute left-3 top-3 rounded-lg bg-white/95 px-2.5 py-1.5 text-2xs text-ink-600 shadow-sm">
            Harita altlığı yüklenemedi — noktalar yine de doğru konumda.
          </p>
        )}
        {katman === "geciken" && gecikenSayisi === 0 && (
          <p className="absolute inset-x-3 top-3 rounded-lg bg-white/95 px-3 py-2 text-center text-xs text-ink-600 shadow-sm">
            Şu an kurumda bekleyen sorun yok.
          </p>
        )}
      </div>
    </div>
  );
}
