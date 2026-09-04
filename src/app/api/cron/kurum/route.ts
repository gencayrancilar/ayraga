import { NextResponse } from "next/server";
import { haftalikKurumGonderimi } from "@/lib/kurum-bildirim";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Haftalık kurum gönderimi.
 *
 * Vercel'in ücretsiz planında cron günde bir kez çalışabildiği için bu uç
 * her gün tetiklenir ve yalnızca pazartesi iş görür. Gün kontrolü Türkiye
 * saatine göre yapılır; sunucu UTC'dedir.
 *
 * Yetki: Vercel cron çağrılarına CRON_SECRET ile imza atar. Uç herkese açık
 * olamaz — aksi hâlde birisi tekrar tekrar çağırıp kurumlara posta yağdırabilir.
 */
export async function GET(request: Request) {
  const gizli = process.env.CRON_SECRET;
  const baslik = request.headers.get("authorization");
  if (!gizli || baslik !== `Bearer ${gizli}`) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const url = new URL(request.url);
  const zorla = url.searchParams.get("zorla") === "1";

  const gun = new Date().toLocaleDateString("en-US", {
    timeZone: "Europe/Istanbul", weekday: "short",
  });
  if (gun !== "Mon" && !zorla) {
    return NextResponse.json({ atlandi: true, gun });
  }

  try {
    const sonuc = await haftalikKurumGonderimi();
    return NextResponse.json({ tamam: true, ...sonuc });
  } catch (err) {
    console.error("kurum cron", err);
    return NextResponse.json({ error: "Gönderim başarısız" }, { status: 500 });
  }
}
