import { NextResponse } from "next/server";
import { withSystem } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Kurum gönderim durumu — yalnızca rapor verir, HİÇBİR ŞEY GÖNDERMEZ.
 *
 * Bu uç eskiden pazartesileri kendiliğinden posta gönderiyordu. Kaldırıldı:
 * kuruma resmî yazı göndermek geri alınamaz bir iştir ve yanlış yönlendirilmiş
 * bir bildirimin fark edilme şansı, gönderimden önce bir insanın listeye
 * bakmasına bağlıdır. Gönderim artık Yönetim → Gönderim onayı ekranından,
 * kurum kurum, elle yapılır.
 *
 * Uç, ne kadar işin beklediğini görmek için duruyor. Acil bildirimler bu
 * akışın dışındadır; onlar kaydedilir kaydedilmez iletilir.
 */
export async function GET(request: Request) {
  const gizli = process.env.CRON_SECRET;
  const baslik = request.headers.get("authorization");
  if (!gizli || baslik !== `Bearer ${gizli}`) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  }

  const ozet = await withSystem((tx) => tx`select * from public.gonderim_ozeti()`);

  return NextResponse.json({
    tamam: true,
    gonderim: "kapalı — gönderim Yönetim → Gönderim onayı ekranından elle yapılır",
    kurumlar: (ozet as unknown as Array<{
      authority_name: string; bekleyen: number; onayli: number;
    }>)
      .filter((k) => k.bekleyen > 0 || k.onayli > 0)
      .map((k) => ({ kurum: k.authority_name, kararBekleyen: k.bekleyen, gonderimeHazir: k.onayli })),
  });
}
