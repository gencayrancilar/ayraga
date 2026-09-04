/**
 * Harita stili.
 *
 * OpenFreeMap ücretsiz, anahtar gerektirmeyen vektör tile servisidir
 * (OpenStreetMap verisi, ODbL). Başlangıç maliyeti sıfırdır.
 * Mapbox veya kendi tile sunucunuza geçmek için tek yapılacak,
 * NEXT_PUBLIC_MAP_STYLE değişkenini değiştirmektir — MapLibre her iki
 * stil şemasını da okuduğu için başka kod değişikliği gerekmez.
 */
export const MAP_STYLE =
  process.env.NEXT_PUBLIC_MAP_STYLE ?? "https://tiles.openfreemap.org/styles/positron";

export const ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> · ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';

export const TURKEY_BOUNDS: [[number, number], [number, number]] = [
  [25.5, 35.7],
  [45.0, 42.5],
];

/**
 * Yedek stil. Tile servisi ulaşılamazsa harita boş bir tuval olarak kalmaz;
 * nötr bir zemin üzerinde pinler görünmeye devam eder ve uygulama çalışır.
 */
export const FALLBACK_STYLE = {
  version: 8 as const,
  sources: {},
  layers: [
    { id: "arka-plan", type: "background" as const, paint: { "background-color": "#eef1f5" } },
  ],
};

/**
 * Stil kaynağını bir kez çözer.
 *
 * Harita kurulmadan önce stil belgesine erişilebildiğini doğrularız. Böylece
 * tile servisi ulaşılamazsa harita yarı kurulmuş bir durumda kalmaz; doğrudan
 * yedek stille açılır ve pinler ilk karede görünür. Sonuç modül düzeyinde
 * saklanır, ikinci bir istek yapılmaz.
 */
let resolved: string | typeof FALLBACK_STYLE | null = null;

export async function resolveMapStyle(): Promise<string | typeof FALLBACK_STYLE> {
  if (resolved) return resolved;
  try {
    const res = await fetch(MAP_STYLE, { signal: AbortSignal.timeout(4000), cache: "force-cache" });
    resolved = res.ok ? MAP_STYLE : FALLBACK_STYLE;
  } catch {
    resolved = FALLBACK_STYLE;
  }
  return resolved;
}

export function isFallback(style: unknown) {
  return style === FALLBACK_STYLE;
}
