import { NextResponse } from "next/server";
import { z } from "zod";
import { reportsNearby } from "@/lib/queries/reports";

export const dynamic = "force-dynamic";

const Query = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  r: z.coerce.number().min(50).max(5000).default(500),
});

export async function GET(request: Request) {
  const parsed = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz konum." }, { status: 400 });

  const items = await reportsNearby(parsed.data.lat, parsed.data.lng, parsed.data.r, 30);
  return NextResponse.json({ radius: parsed.data.r, count: items.length, items });
}
