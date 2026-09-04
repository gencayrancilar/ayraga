import { NextResponse } from "next/server";
import sharp, { type OverlayOptions } from "sharp";
import { getReportBySlug } from "@/lib/queries/reports";
import { mediaUrl, readLocal } from "@/lib/storage";
import { STATUS } from "@/lib/status";
import { formatNumber } from "@/lib/format";
import { publicConfig } from "@/lib/public-config";
import { yazi, genislik, satirla, kirp } from "@/lib/yazi";

export const dynamic = "force-dynamic";

/**
 * Sosyal medyada paylaşılacak görsel — hikâye (1080×1920) veya kare (1080×1080).
 *
 * Neden ayrı bir görsel: Instagram hikâyesine bir web sayfasından metin ya da
 * konum yazdırmanın yolu yok. Hikâyeye giden tek şey bir görseldir. O yüzden
 * sorunun adresi, koordinatı ve referans kodu görselin *içine* basılıyor;
 * paylaşan kişi hiçbir şey yazmak zorunda kalmıyor, gören kişi de sorunun
 * nerede olduğunu görselden okuyor.
 *
 * Yerleşim, Instagram'ın hikâye arayüzünü hesaba katar: üstteki ve alttaki
 * yaklaşık 250 piksellik şeritler uygulama tarafından kapatıldığı için tüm
 * yazılar bu güvenli alanın içinde tutulur.
 */

type Bicim = "hikaye" | "kare";
const KENAR = 72;

export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const bicim: Bicim =
    new URL(request.url).searchParams.get("bicim") === "kare" ? "kare" : "hikaye";

  const detail = await getReportBySlug(slug);
  if (!detail) return new NextResponse("Bulunamadı", { status: 404 });

  const r = detail.report;
  const G = 1080;
  const Y = bicim === "hikaye" ? 1920 : 1080;
  const fotoY = bicim === "hikaye" ? 900 : 560;

  const foto = await kapak(r.cover_path);
  const katmanlar: OverlayOptions[] = [];
  if (foto) {
    const kirpilmis = await sharp(foto)
      .resize(G, fotoY, { fit: "cover", position: "attention" })
      .toBuffer();
    katmanlar.push({ input: kirpilmis, top: 0, left: 0 });
  }

  const svg = yerlesim({
    bicim, G, Y, fotoY, fotoVar: foto !== null,
    baslik: r.title,
    durum: STATUS[r.status].label,
    durumRengi: durumRengi(r.status),
    vurgu: r.category_color,
    kategori: r.category_name,
    adres: r.address,
    mahalle: [r.neighborhood_name, r.district_name].filter(Boolean).join(", "),
    enlem: r.latitude,
    boylam: r.longitude,
    destek: r.support_count,
    kod: r.ref_code,
    adresSatiri: `${alanAdi()}/sorun/${slug}`,
  });
  katmanlar.push({ input: Buffer.from(svg), top: 0, left: 0 });

  const png = await sharp({
    create: { width: G, height: Y, channels: 4, background: "#0b1c33" },
  })
    .composite(katmanlar)
    .png({ compressionLevel: 8 })
    .toBuffer();

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `inline; filename="ayra-${r.ref_code}-${bicim}.png"`,
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

/** Kapak görselinin baytları. Yerel depolamada diskten, Supabase'de CDN'den. */
async function kapak(coverPath: string | null): Promise<Buffer | null> {
  if (!coverPath) return null;
  try {
    const url = mediaUrl(coverPath);
    if (url && /^https?:\/\//.test(url)) {
      const y = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!y.ok) return null;
      return Buffer.from(await y.arrayBuffer());
    }
    return await readLocal(coverPath);
  } catch {
    // Görsel gelmezse kart yazıyla üretilir; paylaşım hiç çalışmamaktan iyidir.
    return null;
  }
}

function alanAdi() {
  return publicConfig.siteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function yerlesim(o: {
  bicim: Bicim; G: number; Y: number; fotoY: number; fotoVar: boolean;
  baslik: string; durum: string; durumRengi: string; vurgu: string; kategori: string;
  adres: string | null; mahalle: string; enlem: number; boylam: number;
  destek: number; kod: string; adresSatiri: string;
}) {
  const hikaye = o.bicim === "hikaye";
  const icerikG = o.G - KENAR * 2;
  const P: string[] = [];

  // Hikâyede alt 300 piksel uygulamanın kendi düğmeleriyle kaplanır.
  const taban = hikaye ? o.Y - 300 : o.Y - 56;

  const baslikPunto = hikaye ? 60 : 44;
  const baslikSatiri = hikaye ? 76 : 56;
  const enFazlaSatir = hikaye ? 3 : 2;
  const adresPunto = hikaye ? 36 : 29;
  const ikincilPunto = hikaye ? 30 : 25;
  const koordinatPunto = hikaye ? 28 : 23;
  const altPunto = hikaye ? 28 : 23;

  const tumSatirlar = satirla(o.baslik, icerikG, baslikPunto, 700);
  const baslikSatirlari = tumSatirlar.slice(0, enFazlaSatir);
  if (tumSatirlar.length > enFazlaSatir) {
    const i = baslikSatirlari.length - 1;
    baslikSatirlari[i] = kirp(`${baslikSatirlari[i]} ${tumSatirlar[enFazlaSatir]}`, icerikG, baslikPunto, 700);
  }

  const adresSatirlari = o.adres ? satirla(o.adres, icerikG, adresPunto, 600).slice(0, 2) : [];
  const koordinat = `${o.enlem.toFixed(5)}, ${o.boylam.toFixed(5)}`;

  // Alttan yukarı diziliyor: taban sabit, içerik ne kadarsa o kadar yer kaplıyor.
  let y = taban;
  const altBilgiY = y;                        y -= hikaye ? 64 : 50;
  const koordinatY = y;                       y -= hikaye ? 52 : 42;
  const mahalleY = y;
  if (o.mahalle && adresSatirlari.length) y -= hikaye ? 52 : 42;
  const adresAltY = y;
  y -= Math.max(0, adresSatirlari.length - 1) * (hikaye ? 46 : 38);
  const adresUstY = y;                        y -= hikaye ? 46 : 38;
  const etiketY = y;                          y -= hikaye ? 40 : 32;
  const cizgiY = y;                           y -= hikaye ? 56 : 44;
  const baslikAltY = y;
  const baslikUstY = baslikAltY - (baslikSatirlari.length - 1) * baslikSatiri;
  const rozetY = baslikUstY - (hikaye ? 96 : 76);

  // ── Zemin ──────────────────────────────────────────────────────────────
  if (!o.fotoVar) P.push(`<rect width="${o.G}" height="${o.Y}" fill="#0b1c33"/>`);
  else {
    P.push(`<rect x="0" y="${Math.max(0, o.fotoY - 320)}" width="${o.G}" height="320" fill="url(#scrim)"/>`);
    P.push(`<rect x="0" y="${o.fotoY}" width="${o.G}" height="${o.Y - o.fotoY}" fill="#0b1c33"/>`);
  }
  P.push(`<rect x="0" y="0" width="12" height="${o.Y}" fill="${esc(o.vurgu)}"/>`);
  if (!o.fotoVar) P.push(marka(KENAR, hikaye ? 400 : 190, hikaye));

  // ── Durum ve kategori ──────────────────────────────────────────────────
  const durumG = genislik(o.durum, 24, 600);
  const rozetG = durumG + 70;
  P.push(`<rect x="${KENAR}" y="${rozetY - 34}" width="${rozetG}" height="52" rx="26" fill="#ffffff" fill-opacity="0.12"/>`);
  P.push(`<circle cx="${KENAR + 26}" cy="${rozetY - 8}" r="7" fill="${esc(o.durumRengi)}"/>`);
  P.push(yazi(o.durum, { x: KENAR + 44, y: rozetY, punto: 24, agirlik: 600, renk: "#e5eaf2" }));
  P.push(yazi(o.kategori, { x: KENAR + rozetG + 20, y: rozetY, punto: 24, agirlik: 500, renk: "#9db0cd" }));

  // ── Başlık ─────────────────────────────────────────────────────────────
  baslikSatirlari.forEach((s, i) => {
    P.push(yazi(s, {
      x: KENAR, y: baslikUstY + i * baslikSatiri,
      punto: baslikPunto, agirlik: 700, renk: "#ffffff",
    }));
  });

  P.push(`<line x1="${KENAR}" y1="${cizgiY}" x2="${o.G - KENAR}" y2="${cizgiY}" stroke="#ffffff" stroke-opacity="0.16" stroke-width="1"/>`);

  // ── Konum ──────────────────────────────────────────────────────────────
  P.push(yazi("KONUM", {
    x: KENAR, y: etiketY, punto: hikaye ? 22 : 19, agirlik: 700,
    renk: "#68d8c3", aralik: 2.4,
  }));
  if (adresSatirlari.length) {
    adresSatirlari.forEach((s, i) => {
      P.push(yazi(s, {
        x: KENAR, y: adresUstY + i * (hikaye ? 46 : 38),
        punto: adresPunto, agirlik: 600, renk: "#ffffff",
      }));
    });
    if (o.mahalle) {
      P.push(yazi(o.mahalle, { x: KENAR, y: mahalleY, punto: ikincilPunto, agirlik: 500, renk: "#9db0cd" }));
    }
  } else if (o.mahalle) {
    P.push(yazi(o.mahalle, { x: KENAR, y: adresAltY, punto: adresPunto, agirlik: 600, renk: "#ffffff" }));
  }
  P.push(yazi(koordinat, { x: KENAR, y: koordinatY, punto: koordinatPunto, agirlik: 500, renk: "#9db0cd" }));

  // ── Alt bilgi ──────────────────────────────────────────────────────────
  const markaG = genislik("AYRA", altPunto, 700);
  P.push(yazi("AYRA", { x: KENAR, y: altBilgiY, punto: altPunto, agirlik: 700, renk: "#ffffff" }));
  P.push(yazi(o.adresSatiri, {
    x: KENAR + markaG + (hikaye ? 18 : 15), y: altBilgiY,
    punto: altPunto, agirlik: 500, renk: "#68d8c3",
  }));
  P.push(yazi(o.destek > 0 ? `${formatNumber(o.destek)} destek · ${o.kod}` : o.kod, {
    x: o.G - KENAR, y: altBilgiY, punto: hikaye ? 24 : 20, agirlik: 500,
    renk: "#6b84a8", hiza: "end",
  }));

  const gradyan = o.fotoVar
    ? `<defs><linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
         <stop offset="0" stop-color="#0b1c33" stop-opacity="0"/>
         <stop offset="1" stop-color="#0b1c33" stop-opacity="1"/>
       </linearGradient></defs>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${o.G}" height="${o.Y}" viewBox="0 0 ${o.G} ${o.Y}">${gradyan}${P.join("")}</svg>`;
}

/**
 * Fotoğrafı olmayan bildirimde üst yarı boş kalmasın diye marka bloğu.
 * Boş bir alan, görseli "eksik basılmış" gösterir.
 */
function marka(x: number, y: number, hikaye: boolean): string {
  const o = hikaye ? 1 : 0.8;
  const adG = genislik("AYRA", 52, 700);
  return `<g transform="translate(${x} ${y}) scale(${o})">
    <rect x="0" y="0" width="96" height="96" rx="28" fill="#ffffff" fill-opacity="0.08"/>
    <path d="M48 24c-13.3 0-24 10.6-24 23.8 0 16.8 20.7 39.8 22.4 41.7a2.2 2.2 0 0 0 3.2 0C51.3 87.6 72 64.6 72 47.8 72 34.6 61.3 24 48 24Z"
          fill="none" stroke="#ffffff" stroke-width="4" stroke-linejoin="round"/>
    <circle cx="48" cy="46" r="9" fill="#33bfa7"/>
    ${yazi("AYRA", { x: 126, y: 52, punto: 52, agirlik: 700, renk: "#ffffff" })}
    ${yazi("GA", { x: 126 + adG + 8, y: 34, punto: 22, agirlik: 700, renk: "#68d8c3" })}
    ${yazi("Gör. Bildir. Destekle. Takip et.", { x: 126, y: 88, punto: 25, agirlik: 500, renk: "#9db0cd" })}
  </g>`;
}

function esc(value: string) {
  return value.replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!,
  );
}

function durumRengi(status: string) {
  const harita: Record<string, string> = {
    new: "#9db0cd", verified: "#5b9bd8", forwarded: "#8f94f0",
    in_review: "#e0b64a", awaiting_resolution: "#e09a4a",
    resolved: "#33bfa7", unresolved: "#e07a92",
    duplicate: "#6b84a8", rejected: "#6b84a8",
  };
  return harita[status] ?? "#9db0cd";
}
