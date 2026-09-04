import { NextResponse } from "next/server";
import sharp from "sharp";
import { getReportBySlug } from "@/lib/queries/reports";
import { STATUS } from "@/lib/status";
import { formatNumber } from "@/lib/format";
import { yazi, genislik, satirla, kirp } from "@/lib/yazi";

export const dynamic = "force-dynamic";

/**
 * Bağlantı önizleme kartı (1200×630).
 *
 * Facebook, LinkedIn ve benzeri mecralar paylaşılan metni yok sayıp yalnızca
 * bu kartı gösterir. Konum kartın içinde yoksa o mecralarda hiç gitmemiş olur;
 * bu yüzden adres ve koordinat karta basılır.
 *
 * Yazılar vektör yoluna çevrilir (src/lib/yazi.ts): sunucuda kurulu yazı tipi
 * bulunmadığı için <text> kullanıldığında her harf boş kutu çıkıyordu.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const detail = await getReportBySlug(slug);
  if (!detail) return new NextResponse("Bulunamadı", { status: 404 });

  const r = detail.report;
  const G = 1200, Y = 630, KENAR = 72;
  const icerikG = G - KENAR * 2;
  const status = STATUS[r.status];
  const yer = [r.neighborhood_name, r.district_name].filter(Boolean).join(", ") || "AYRA";

  const tumSatirlar = satirla(r.title, icerikG, 52, 700);
  const satirlar = tumSatirlar.slice(0, 3);
  if (tumSatirlar.length > 3) {
    satirlar[2] = kirp(`${satirlar[2]} ${tumSatirlar[3]}`, icerikG, 52, 700);
  }
  const adres = r.address ? kirp(r.address, icerikG, 27, 600) : null;
  const koordinat = `${r.latitude.toFixed(5)}, ${r.longitude.toFixed(5)}`;

  const P: string[] = [];
  P.push(`<rect width="${G}" height="${Y}" fill="#0b1c33"/>`);
  P.push(`<rect x="0" y="0" width="10" height="${Y}" fill="${esc(r.category_color)}"/>`);

  // Logo
  const markaG = genislik("AYRA", 34, 700);
  P.push(`<rect x="72" y="64" width="52" height="52" rx="15" fill="#ffffff" fill-opacity="0.08"/>`);
  P.push(`<path d="M98 78c-7.2 0-13 5.7-13 12.9 0 9.1 11.2 21.5 12.1 22.5a1.2 1.2 0 0 0 1.8 0c.9-1 12.1-13.4 12.1-22.5C111 83.7 105.2 78 98 78Z" fill="none" stroke="#ffffff" stroke-width="2.4" stroke-linejoin="round"/>`);
  P.push(`<circle cx="98" cy="90.9" r="4.8" fill="#33bfa7"/>`);
  P.push(yazi("AYRA", { x: 140, y: 102, punto: 34, agirlik: 700, renk: "#ffffff" }));
  P.push(yazi("GA", { x: 140 + markaG + 6, y: 88, punto: 15, agirlik: 700, renk: "#68d8c3" }));

  // Durum ve destek
  const durumG = genislik(status.label, 19, 600);
  const rozetG = durumG + 56;
  P.push(`<rect x="72" y="168" width="${rozetG}" height="42" rx="21" fill="#ffffff" fill-opacity="0.10"/>`);
  P.push(`<circle cx="94" cy="189" r="5" fill="${esc(durumRengi(r.status))}"/>`);
  P.push(yazi(status.label, { x: 108, y: 196, punto: 19, agirlik: 600, renk: "#e5eaf2" }));
  P.push(yazi(
    r.support_count > 0 ? `${formatNumber(r.support_count)} destek` : "ilk destekleyen siz olun",
    { x: 72 + rozetG + 18, y: 196, punto: 19, agirlik: 500, renk: "#6b84a8" },
  ));

  // Başlık
  satirlar.forEach((s, i) => {
    P.push(yazi(s, { x: 72, y: 272 + i * 64, punto: 52, agirlik: 700, renk: "#ffffff" }));
  });

  // Konum
  P.push(`<line x1="72" y1="472" x2="${G - 72}" y2="472" stroke="#ffffff" stroke-opacity="0.14" stroke-width="1"/>`);
  P.push(yazi("KONUM", { x: 72, y: 510, punto: 17, agirlik: 700, renk: "#68d8c3", aralik: 2 }));
  P.push(yazi(adres ?? yer, { x: 72, y: 552, punto: 27, agirlik: 600, renk: "#ffffff" }));
  P.push(yazi(adres ? `${yer} · ${koordinat}` : koordinat, {
    x: 72, y: 590, punto: 21, agirlik: 500, renk: "#9db0cd",
  }));
  P.push(yazi(r.ref_code, { x: G - 72, y: 590, punto: 20, agirlik: 500, renk: "#6b84a8", hiza: "end" }));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${G}" height="${Y}" viewBox="0 0 ${G} ${Y}">${P.join("")}</svg>`;
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 8 }).toBuffer();

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
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
