import { NextResponse } from "next/server";
import { z } from "zod";
import { similarReports } from "@/lib/queries/reports";

export const dynamic = "force-dynamic";

const Query = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  kategori: z.string().uuid().optional(),
});

/**
 * Aynı sorunun tekrar tekrar bildirilmesini azaltmak için, kullanıcı bildirim
 * oluştururken yakındaki benzer kayıtları önerir.
 */
export async function GET(request: Request) {
  const parsed = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ items: [] });

  const items = await similarReports(parsed.data.lat, parsed.data.lng, parsed.data.kategori ?? null, 250);
  return NextResponse.json({ items });
}
