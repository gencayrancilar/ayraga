import { NextResponse } from "next/server";
import { readLocal } from "@/lib/storage";

/**
 * Yerel depolama sağlayıcısında görselleri sunar.
 * STORAGE_PROVIDER=supabase olduğunda görseller doğrudan Supabase Storage
 * CDN'inden gelir ve bu route hiç kullanılmaz.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  const { path } = await ctx.params;
  const key = path.join("/");

  if (key.includes("..") || !/^[\w\-/]+\.webp$/.test(key)) {
    return new NextResponse("Geçersiz yol", { status: 400 });
  }

  const data = await readLocal(key);
  if (!data) return new NextResponse("Bulunamadı", { status: 404 });

  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(data.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
