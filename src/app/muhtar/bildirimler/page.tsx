import Link from "next/link";
import { muhtarBildirimler } from "@/lib/queries/muhtar";
import { MuhtarListe } from "@/components/muhtar/MuhtarListe";
import { cx } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bildirimler" };

const DONEMLER = [
  { deger: "hafta", etiket: "Bu hafta" },
  { deger: "ay", etiket: "Bu ay" },
  { deger: "tum", etiket: "Tümü" },
] as const;

const DURUMLAR = [
  { deger: "tum", etiket: "Hepsi" },
  { deger: "acik", etiket: "Açık" },
  { deger: "geciken", etiket: "Kurumdan yanıt yok" },
  { deger: "cozulen", etiket: "Çözülen" },
] as const;

type Arama = { donem?: string; durum?: string };

export default async function MuhtarBildirimlerSayfasi({
  searchParams,
}: {
  searchParams: Promise<Arama>;
}) {
  const sp = await searchParams;
  const donem = (DONEMLER.find((d) => d.deger === sp.donem)?.deger ?? "ay") as "hafta" | "ay" | "tum";
  const durum = (DURUMLAR.find((d) => d.deger === sp.durum)?.deger ?? "tum") as
    | "tum" | "acik" | "geciken" | "cozulen";

  const kayitlar = await muhtarBildirimler({ donem, durum, limit: 200 });

  const bag = (yeni: Partial<Arama>) => {
    const p = new URLSearchParams({ donem, durum, ...yeni });
    return `/muhtar/bildirimler?${p.toString()}`;
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink-900">Bildirimler</h1>
        <p className="mt-1 text-sm text-ink-500">
          Mahallenizde yayımlanmış bildirimler. Bir kaydı açıp resmî yanıt
          yazabilirsiniz; yanıtınız kanıt zincirine muhtar imzasıyla işlenir.
        </p>
      </header>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Dönem">
          {DONEMLER.map((d) => (
            <Link
              key={d.deger}
              href={bag({ donem: d.deger })}
              className={cx(
                "rounded-full px-3 py-1.5 text-xs transition",
                donem === d.deger ? "bg-ink-900 font-medium text-white" : "bg-white text-ink-600 hover:text-ink-900",
              )}
            >
              {d.etiket}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Durum">
          {DURUMLAR.map((d) => (
            <Link
              key={d.deger}
              href={bag({ durum: d.deger })}
              className={cx(
                "rounded-full px-3 py-1.5 text-xs transition",
                durum === d.deger ? "bg-teal-600 font-medium text-white" : "bg-white text-ink-600 hover:text-ink-900",
              )}
            >
              {d.etiket}
            </Link>
          ))}
        </div>
      </div>

      <p className="text-xs text-ink-400">{kayitlar.length} kayıt</p>
      <MuhtarListe kayitlar={kayitlar} bosMesaj="Bu süzgeçle kayıt bulunamadı." />
    </div>
  );
}
