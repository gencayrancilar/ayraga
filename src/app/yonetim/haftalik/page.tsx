import { requireModerator } from "@/lib/auth/session";
import { haftalikOzetler, haftalikMetin, dernekMetni } from "@/lib/queries/haftalik";
import { publicConfig } from "@/lib/public-config";
import { HaftalikKart } from "@/components/muhtar/HaftalikKart";

export const dynamic = "force-dynamic";
export const metadata = { title: "Haftalık özet" };

export default async function YonetimHaftalikSayfasi() {
  await requireModerator();
  const ozetler = await haftalikOzetler();
  const dolu = ozetler.filter((o) => o.yeni > 0 || o.cozulen > 0 || o.geciken > 0 || o.acik > 0);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink-900">Haftalık özet</h1>
        <p className="mt-1 text-sm text-ink-500">
          Tamamlanmış son haftanın mahalle mahalle dökümü. Her kutuyu kopyalayıp
          ilgili muhtara gönderebilirsiniz; en üstteki dernek özeti de haftalık
          toplantı için hazır.
        </p>
      </header>

      <HaftalikKart baslik="Dernek özeti — tüm mahalleler" metin={dernekMetni(dolu, publicConfig.siteUrl)} />

      {dolu.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-white/60 p-6 text-center text-sm text-ink-500">
          Geçen hafta hiçbir mahallede hareket olmamış.
        </p>
      ) : (
        dolu.map((o) => (
          <HaftalikKart key={o.mahalle_id} baslik={`${o.mahalle} Mahallesi`} metin={haftalikMetin(o, publicConfig.siteUrl)} />
        ))
      )}
    </div>
  );
}
