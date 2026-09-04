import { glyphFor } from "../category-glyphs";

/**
 * Harita pinleri.
 *
 * Renk tek başına on iki kategoriyi ayırt ettirmiyor: 8 piksellik iki nokta
 * arasındaki ton farkı, güneş altında telefonla bakan bir kullanıcı için
 * bilgi taşımıyor. Bu yüzden her pin, kategori ikonunu kendi içinde taşır ve
 * durumunu biçimiyle söyler:
 *
 *   open       dolgulu damla, kategori rengi           → sorun açık
 *   overdue    aynı damla + kehribar halka ve nokta    → yanıt hedefi aşıldı
 *   resolved   soluk damla + teal onay rozeti          → çözüldü
 *   unresolved soluk damla + bordo çizgi rozeti        → sonuçsuz kapandı
 *
 * Sprite'lar istemcide bir kez çizilip MapLibre'ye kaydedilir; ağdan görsel
 * indirilmez, bu yüzden çevrimdışı ve yedek stilde de çalışır.
 */

export type PinState = "open" | "overdue" | "resolved" | "unresolved";

export const PIN_W = 40;
export const PIN_H = 52;
const RATIO = 2;

const TEARDROP =
  "M20 2C10.6 2 3 9.5 3 18.8c0 11.2 12.6 25.6 15.7 29a1.8 1.8 0 0 0 2.6 0" +
  "C24.4 44.4 37 30 37 18.8 37 9.5 29.4 2 20 2Z";

/** Soluk durumlar için rengi beyaza doğru karıştırır. */
function mute(hex: string, amount = 0.72): string {
  const n = hex.replace("#", "");
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function pinSvg(icon: string, color: string, state: PinState): string {
  const muted = state === "resolved" || state === "unresolved";
  const body = muted ? mute(color) : color;
  const glyphColor = muted ? color : "#ffffff";
  const glyphWidth = muted ? 2 : 2.2;

  const badge =
    state === "resolved"
      ? '<circle cx="31" cy="11" r="8" fill="#068272" stroke="#fff" stroke-width="2"/>' +
        '<path d="m27.6 11.2 2.4 2.4 4.4-4.6" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
      : state === "unresolved"
        ? '<circle cx="31" cy="11" r="8" fill="#8d0f33" stroke="#fff" stroke-width="2"/>' +
          '<path d="M27.6 11h6.8" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>'
        : state === "overdue"
          ? '<circle cx="31" cy="10" r="7" fill="#b8860b" stroke="#fff" stroke-width="2"/>' +
            '<path d="M31 6.4v4l2.2 1.3" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>'
          : "";

  const ring =
    state === "overdue"
      ? `<path d="${TEARDROP}" fill="none" stroke="#b8860b" stroke-width="4.5" opacity=".28"/>`
      : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_W * RATIO}" height="${PIN_H * RATIO}" viewBox="0 0 ${PIN_W} ${PIN_H}">
  <ellipse cx="20" cy="48.5" rx="5.5" ry="2" fill="rgba(11,28,51,.20)"/>
  ${ring}
  <path d="${TEARDROP}" fill="${body}" stroke="#ffffff" stroke-width="2.4" stroke-linejoin="round"/>
  <g color="${glyphColor}" transform="translate(11.2 9.8) scale(0.735)"
     fill="none" stroke="currentColor" stroke-width="${glyphWidth}" stroke-linecap="round" stroke-linejoin="round">
    ${glyphFor(icon)}
  </g>
  ${badge}
</svg>`;
}

/** Seçili pinin altına çizilen vurgu halkası. */
function haloSvg(): string {
  const size = 64;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size * RATIO}" height="${size * RATIO}" viewBox="0 0 ${size} ${size}">
  <circle cx="32" cy="32" r="28" fill="rgba(8,104,93,.12)"/>
  <circle cx="32" cy="32" r="28" fill="none" stroke="#068272" stroke-width="2.5" opacity=".85"/>
</svg>`;
}

export function pinImageId(icon: string, color: string, state: PinState): string {
  return `pin:${icon}:${color}:${state}`;
}

export const HALO_IMAGE_ID = "pin-halo";

async function toBitmap(svg: string): Promise<ImageBitmap | HTMLImageElement> {
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = new Image();
  image.src = url;
  await image.decode();
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(image);
    } catch {
      /* bazı tarayıcılarda SVG kaynaklı bitmap desteklenmez */
    }
  }
  return image;
}

type ImageHost = {
  hasImage(id: string): boolean;
  addImage(
    id: string,
    image: ImageBitmap | HTMLImageElement,
    options?: { pixelRatio?: number },
  ): void;
};

/**
 * Görünen bildirimler için gereken pin görsellerini üretir ve haritaya kaydeder.
 * Yalnızca eksik olanlar çizilir; aynı kategori/durum çifti bir kez işlenir.
 */
export async function ensurePinImages(
  map: ImageHost,
  needed: Array<{ icon: string; color: string; state: PinState }>,
): Promise<boolean> {
  let added = false;

  if (!map.hasImage(HALO_IMAGE_ID)) {
    map.addImage(HALO_IMAGE_ID, await toBitmap(haloSvg()), { pixelRatio: RATIO });
    added = true;
  }

  const seen = new Set<string>();
  for (const { icon, color, state } of needed) {
    const id = pinImageId(icon, color, state);
    if (seen.has(id) || map.hasImage(id)) continue;
    seen.add(id);
    map.addImage(id, await toBitmap(pinSvg(icon, color, state)), { pixelRatio: RATIO });
    added = true;
  }

  return added;
}

/** Gösterge ve filtre ekranlarında kullanılmak üzere tek bir pinin veri URL'i. */
export function pinDataUrl(icon: string, color: string, state: PinState = "open"): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pinSvg(icon, color, state))}`;
}

export const STATE_META: Record<PinState, { label: string; description: string; color: string }> = {
  open: {
    label: "Açık",
    description: "Sorun kayıtlı, süreç işliyor.",
    color: "var(--color-ink-700)",
  },
  // Not: buradaki renkler METİN için kullanılır ve beyaz zeminde WCAG AA
  // eşiğini geçmelidir. Pin gövdesindeki daha parlak tonlar ayrı tanımlıdır.
  overdue: {
    label: "Yanıt gecikti",
    description: "Kuruma iletildi, yanıt süresi hedefi aşıldı.",
    color: "#7a5406",
  },
  resolved: {
    label: "Çözüldü",
    description: "Sorun giderildi.",
    color: "#08685d",
  },
  unresolved: {
    label: "Çözülemedi",
    description: "Süreç sonuçsuz kapandı.",
    color: "#8d0f33",
  },
};
