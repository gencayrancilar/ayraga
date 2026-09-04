import "server-only";
import opentype from "opentype.js";
import { INTER_500 } from "./fontlar/inter-500";
import { INTER_600 } from "./fontlar/inter-600";
import { INTER_700 } from "./fontlar/inter-700";

/**
 * Paylaşım görsellerindeki yazılar.
 *
 * SVG'de <text> kullanmıyoruz: Vercel'in sunucusunda kurulu yazı tipi yok,
 * dolayısıyla her harf boş kutu olarak çiziliyordu. Bunun yerine yazı burada
 * vektör yoluna çevriliyor — çizim hiçbir sistem fontuna bağlı kalmıyor,
 * görsel her ortamda birebir aynı çıkıyor.
 *
 * Yan fayda: artık yazının gerçek genişliğini ölçebiliyoruz. Satır kırma ve
 * sağa hizalama karakter saymaya değil, piksele dayanıyor.
 */

export type Agirlik = 500 | 600 | 700;

const KAYNAK: Record<Agirlik, string> = {
  500: INTER_500,
  600: INTER_600,
  700: INTER_700,
};

const onbellek = new Map<Agirlik, opentype.Font>();

function font(agirlik: Agirlik): opentype.Font {
  const hazir = onbellek.get(agirlik);
  if (hazir) return hazir;
  const bayt = Buffer.from(KAYNAK[agirlik], "base64");
  const f = opentype.parse(
    bayt.buffer.slice(bayt.byteOffset, bayt.byteOffset + bayt.byteLength) as ArrayBuffer,
  );
  onbellek.set(agirlik, f);
  return f;
}

/** Yazının piksel genişliği. Harf aralığı verilirse hesaba katılır. */
export function genislik(metin: string, punto: number, agirlik: Agirlik, aralik = 0): number {
  if (!metin) return 0;
  const f = font(agirlik);
  const temel = f.getAdvanceWidth(metin, punto);
  return temel + aralik * Math.max(0, [...metin].length - 1);
}

export type YaziSecenek = {
  x: number;
  y: number;               // taban çizgisi
  punto: number;
  agirlik: Agirlik;
  renk: string;
  hiza?: "start" | "end";
  aralik?: number;         // harf aralığı (letter-spacing)
  opaklik?: number;
};

/** Yazıyı <path> olarak döndürür. */
export function yazi(metin: string, o: YaziSecenek): string {
  if (!metin) return "";
  const f = font(o.agirlik);
  const aralik = o.aralik ?? 0;
  const g = genislik(metin, o.punto, o.agirlik, aralik);
  const baslangic = o.hiza === "end" ? o.x - g : o.x;
  const opaklik = o.opaklik != null ? ` fill-opacity="${o.opaklik}"` : "";

  // Aralık yoksa tek seferde çiz: kerning korunur, yol daha kısa olur.
  if (aralik === 0) {
    const d = f.getPath(metin, baslangic, o.y, o.punto).toPathData(2);
    return d ? `<path d="${d}" fill="${o.renk}"${opaklik}/>` : "";
  }

  const parcalar: string[] = [];
  let x = baslangic;
  for (const harf of metin) {
    const glif = f.charToGlyph(harf);
    const d = glif.getPath(x, o.y, o.punto).toPathData(2);
    if (d) parcalar.push(d);
    x += (glif.advanceWidth ?? 0) / f.unitsPerEm * o.punto + aralik;
  }
  return parcalar.length ? `<path d="${parcalar.join(" ")}" fill="${o.renk}"${opaklik}/>` : "";
}

/**
 * Metni verilen piksel genişliğine sığacak satırlara böler.
 * Karakter saymak yerine ölçtüğü için Türkçe metinlerde de doğru kırar.
 */
export function satirla(
  metin: string, enFazlaGenislik: number, punto: number, agirlik: Agirlik,
): string[] {
  const kelimeler = metin.split(/\s+/).filter(Boolean);
  const satirlar: string[] = [];
  let simdiki = "";
  for (const k of kelimeler) {
    const deneme = simdiki ? `${simdiki} ${k}` : k;
    if (genislik(deneme, punto, agirlik) > enFazlaGenislik && simdiki) {
      satirlar.push(simdiki);
      simdiki = k;
    } else {
      simdiki = deneme;
    }
  }
  if (simdiki) satirlar.push(simdiki);
  return satirlar;
}

/** Tek satıra sığmayan metni keser ve üç nokta ekler. */
export function kirp(
  metin: string, enFazlaGenislik: number, punto: number, agirlik: Agirlik,
): string {
  if (genislik(metin, punto, agirlik) <= enFazlaGenislik) return metin;
  let s = metin;
  while (s.length > 1 && genislik(`${s}…`, punto, agirlik) > enFazlaGenislik) {
    s = s.slice(0, -1);
  }
  return `${s.trimEnd()}…`;
}
