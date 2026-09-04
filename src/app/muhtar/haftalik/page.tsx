import { requireMuhtar } from "@/lib/auth/session";
import { haftalikOzetler, haftalikMetin } from "@/lib/queries/haftalik";
import { publicConfig } from "@/lib/public-config";
import { HaftalikKart } from "@/components/muhtar/HaftalikKart";

export const dynamic = "force-dynamic";
export const metadata = { title: "Haftalık özet" };

export default async function MuhtarHaftalikSayfasi() {
  const { mahalleler } = await requireMuhtar();
  const ozetler = await haftalikOzetler(mahalleler.map((m) => m.id));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink-900">Haftalık özet</h1>
        <p className="mt-1 text-sm text-ink-500">
          Tamamlanmış son haftanın dökümü. Muhtarlar toplantısında ya da belediye
          görüşmesinde kullanmak için kopyalayabilir, mahalle grubunda
          paylaşabilirsiniz.
        </p>
      </header>

      {ozetler.map((o) => (
        <HaftalikKart key={o.mahalle_id} baslik={`${o.mahalle} Mahallesi`} metin={haftalikMetin(o, publicConfig.siteUrl)} />
      ))}
    </div>
  );
}
