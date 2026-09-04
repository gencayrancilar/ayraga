import { NextResponse } from "next/server";
import { adminHeatmapPoints } from "@/lib/queries/admin";
import { AuthError } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const points = await adminHeatmapPoints(url.searchParams.get("kategori"), url.searchParams.get("durum"));
    return NextResponse.json({ points });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }
}
