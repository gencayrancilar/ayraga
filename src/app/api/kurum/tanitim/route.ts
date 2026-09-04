import { NextResponse } from "next/server";
import { tanitimGonder } from "@/lib/kurum-tanitim";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Kurumlara tanıtım yazısı gönderimi. Elle tetiklenir, bir kereye mahsustur.
 *
 * Varsayılan davranış DENEMEDİR: uç, kime hangi metnin gideceğini listeler ve
 * hiçbir şey göndermez. Gerçekten göndermek için ?onay=1 gerekir. Kuruma
 * resmî bir yazı göndermek geri alınamaz; bu yüzden varsayılan, göndermemek.
 */
export async function GET(request: Request) {
  const gizli = process.env.CRON_SECRET;
  const baslik = request.headers.get("authorization");
  if (!gizli || baslik !== `Bearer ${gizli}`) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const onay = new URL(request.url).searchParams.get("onay") === "1";

  try {
    const sonuc = await tanitimGonder(onay);
    return NextResponse.json({ tamam: true, ...sonuc });
  } catch (err) {
    console.error("tanitim", err);
    return NextResponse.json({ error: "Gönderim başarısız" }, { status: 500 });
  }
}
