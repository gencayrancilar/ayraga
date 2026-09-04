import Link from "next/link";
import { muhtarOzet, muhtarBildirimler } from "@/lib/queries/muhtar";
import { requireMuhtar } from "@/lib/auth/session";
import { MuhtarListe } from "@/components/muhtar/MuhtarListe";

export const dynamic = "force-dynamic";
export const metadata = { title: "Özet" };

function Kutu({
  baslik, deger, alt, vurgu,
}: { baslik: string; deger: number | string; alt?: string; vurgu?: "uyari" | "iyi" }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <p className="text-xs text-ink-500">{baslik}</p>
      <p
        className={
          "mt-1 text-2xl font-semibold tabular-nums " +
          (vurgu === "uyari" ? "text-status-waiting" : vurgu === "iyi" ? "text-teal-600" : "text-ink-900")
        }
      >
        {deger}
      </p>
      {alt && <p className="mt-0.5 text-xs text-ink-400">{alt}</p>}
    </div>
  );
}

function fark(simdi: number, once: number): string {
  if (once === 0) return simdi === 0 ? "geçen dönemle aynı" : `geçen dönem hiç yoktu`;
  const d = simdi - once;
  if (d === 0) return "geçen dönemle aynı";
  return `geçen döneme göre ${d > 0 ? "+" : "−"}${Math.abs(d)}`;
}

export default async function MuhtarOzetSayfasi() {
  const { mahalleler } = await requireMuhtar();
  const [ozet, buHafta, geciken] = await Promise.all([
    muhtarOzet(),
    muhtarBildirimler({ donem: "hafta", limit: 20 }),
    muhtarBildirimler({ donem: "tum", durum: "geciken", limit: 10 }),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-ink-900">
          {mahalleler.map((m) => m.name).join(", ")} Mahallesi
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Mahallenizde bildirilen sorunların özeti. Rakamlar canlı veridir, her
          açtığınızda yeniden hesaplanır.
        </p>
      </header>

      <section aria-label="Bu hafta" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kutu baslik="Bu hafta bildirilen" deger={ozet.bu_hafta} alt={fark(ozet.bu_hafta, ozet.gecen_hafta)} />
        <Kutu baslik="Bu ay bildirilen" deger={ozet.bu_ay} alt={fark(ozet.bu_ay, ozet.gecen_ay)} />
        <Kutu baslik="Açık sorun" deger={ozet.acik} alt={`toplam ${ozet.toplam} kayıt`} />
        <Kutu
          baslik="Kurumda bekleyen"
          deger={ozet.geciken}
          alt="makul süre aşıldı"
          vurgu={ozet.geciken > 0 ? "uyari" : undefined}
        />
      </section>

      <section aria-label="Son 30 gün" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kutu baslik="Son 30 günde çözülen" deger={ozet.cozulen_30g} vurgu={ozet.cozulen_30g > 0 ? "iyi" : undefined} />
        <Kutu baslik="Son 30 günde destek" deger={ozet.destek_30g} alt="mahalleliden gelen destek" />
      </section>

      {geciken.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold text-ink-900">Kurumdan yanıt bekleyenler</h2>
            <Link href="/muhtar/bildirimler?durum=geciken" className="text-xs text-ink-500 hover:text-ink-900">
              tümü →
            </Link>
          </div>
          <p className="mt-1 mb-3 text-sm text-ink-500">
            Yetkili kuruma iletilmiş, kategori için makul kabul edilen sürede yanıt
            gelmemiş kayıtlar. Belediyeyle görüşmenizde elinizdeki en somut liste budur.
          </p>
          <MuhtarListe kayitlar={geciken} />
        </section>
      )}

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-ink-900">Bu hafta bildirilenler</h2>
          <Link href="/muhtar/bildirimler" className="text-xs text-ink-500 hover:text-ink-900">
            tümü →
          </Link>
        </div>
        <div className="mt-3">
          <MuhtarListe kayitlar={buHafta} bosMesaj="Bu hafta henüz bildirim yok." />
        </div>
      </section>
    </div>
  );
}
