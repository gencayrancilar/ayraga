import { NextResponse } from "next/server";
import { z } from "zod";
import { withSystem } from "@/lib/db";

export const dynamic = "force-dynamic";

const Query = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

const cache = new Map<string, { value: string | null; at: number }>();
const TTL = 1000 * 60 * 60 * 24;
let lastCall = 0;

/**
 * Koordinattan adres üretir.
 *
 * Önce Nominatim (OpenStreetMap) denenir — ücretsizdir, anahtar gerektirmez,
 * ancak saniyede bir istek sınırı vardır ve her zaman erişilebilir olmayabilir.
 * Ulaşılamazsa veritabanındaki mahalle bilgisiyle anlamlı bir adres üretilir;
 * kullanıcı her hâlükârda adresi elle düzeltebilir. Akış hiçbir durumda
 * dış servise bağımlı kalmaz.
 */
export async function GET(request: Request) {
  const parsed = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ address: null, source: "invalid" }, { status: 400 });

  const { lat, lng } = parsed.data;
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const context = await place(lat, lng);

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) {
    return NextResponse.json({ address: hit.value, source: "cache", ...context });
  }

  let address: string | null = null;

  if (Date.now() - lastCall > 1100) {
    lastCall = Date.now();
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=tr&zoom=18`,
        {
          headers: { "User-Agent": "AYRA/1.0 (Genc Ayrancilar Dernegi; civic reporting platform)" },
          signal: AbortSignal.timeout(4000),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as { address?: Record<string, string> };
        const a = data.address ?? {};
        address =
          [a.road ?? a.pedestrian ?? a.footway, a.house_number, a.suburb ?? a.neighbourhood]
            .filter(Boolean)
            .join(" ")
            .trim() || null;
      }
    } catch {
      address = null;
    }
  }

  if (!address && context.neighborhood) {
    address = [context.neighborhood, context.district].filter(Boolean).join(", ");
  }

  cache.set(key, { value: address, at: Date.now() });
  if (cache.size > 500) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }

  return NextResponse.json({ address, source: address ? "geocoder" : "none", ...context });
}

async function place(lat: number, lng: number) {
  const [row] = await withSystem(
    (tx) => tx`
      select n.id, n.name as neighborhood, d.name as district, c.name as city
        from public.neighborhoods n
        join public.districts d on d.id = n.district_id
        join public.cities c on c.id = d.city_id
       where n.id = public.resolve_neighborhood(${lat}, ${lng})
       limit 1
    `,
  );
  return {
    neighborhoodId: (row?.id as string) ?? null,
    neighborhood: (row?.neighborhood as string) ?? null,
    district: (row?.district as string) ?? null,
    city: (row?.city as string) ?? null,
  };
}
