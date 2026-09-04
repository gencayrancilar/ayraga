import { NextResponse } from "next/server";
import { z } from "zod";
import { reportsInBounds } from "@/lib/queries/reports";
import type { ReportStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const Query = z.object({
  minLat: z.coerce.number().min(-90).max(90),
  minLng: z.coerce.number().min(-180).max(180),
  maxLat: z.coerce.number().min(-90).max(90),
  maxLng: z.coerce.number().min(-180).max(180),
  kategori: z.string().optional(),
  durum: z.string().optional(),
  mahalle: z.string().max(80).optional(),
});

/**
 * Haritanın görünen alanındaki bildirimleri GeoJSON olarak döner.
 * Tüm veriyi bir kerede yüklemek yerine viewport bazlı çekilir; kümeleme
 * istemci tarafında MapLibre'nin kendi cluster desteğiyle yapılır.
 */
export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = Query.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Geçersiz sınırlar." }, { status: 400 });
  }

  const { minLat, minLng, maxLat, maxLng, kategori, durum, mahalle } = parsed.data;

  // Aşırı geniş alan istekleri sınırlanır (tüm dünyayı isteyen istemciye karşı)
  if (maxLat - minLat > 3 || maxLng - minLng > 3) {
    return NextResponse.json({ type: "FeatureCollection", features: [], tooWide: true });
  }

  const rows = await reportsInBounds({
    minLat, minLng, maxLat, maxLng,
    categorySlugs: kategori ? kategori.split(",").filter(Boolean) : null,
    statuses: durum ? (durum.split(",").filter(Boolean) as ReportStatus[]) : null,
    neighborhoodSlug: mahalle ?? null,
  });

  return NextResponse.json(
    {
      type: "FeatureCollection",
      features: rows.map((r) => ({
        type: "Feature",
        id: r.id,
        geometry: { type: "Point", coordinates: [r.longitude, r.latitude] },
        properties: {
          id: r.id,
          slug: r.slug,
          title: r.title,
          status: r.status,
          // Liste satırından haritayı o noktaya götürebilmek için koordinat
          // özniteliklerde de taşınır; liste yalnızca properties'i görür.
          lat: r.latitude,
          lng: r.longitude,
          color: r.category_color,
          icon: r.category_icon,
          category: r.category_name,
          rootId: r.root_category_id,
          neighborhood: r.neighborhood_name,
          address: r.address,
          supports: r.support_count,
          cover: r.cover_path,
          createdAt: r.created_at,
          resolved: r.status === "resolved",
          /**
           * Haritada tek bakışta okunan dört durum. Pinin biçimi buna göre
           * değişir; kullanıcının dokuz durumu ezberlemesi gerekmez.
           *   open       — sorun açık, süreç işliyor
           *   overdue    — kuruma iletildi ama yanıt hedefi aşıldı
           *   resolved   — çözüldü
           *   unresolved — sonuçsuz kapandı
           */
          state: mapState(r.status, r.awaiting_response_hours, r.sla_days),
        },
      })),
    },
    { headers: { "Cache-Control": "private, max-age=15" } },
  );
}

export type MapState = "open" | "overdue" | "resolved" | "unresolved";

function mapState(status: ReportStatus, awaitingHours: number | null, slaDays: number): MapState {
  if (status === "resolved") return "resolved";
  if (status === "unresolved") return "unresolved";
  if (awaitingHours != null && awaitingHours > slaDays * 24) return "overdue";
  return "open";
}
