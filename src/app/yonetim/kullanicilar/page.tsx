import { kullanicilar, katilimOzeti } from "@/lib/queries/kullanicilar";
import { withSystem } from "@/lib/db";
import { KullaniciListesi } from "@/components/admin/KullaniciListesi";

export const dynamic = "force-dynamic";
export const metadata = { title: "Katılanlar" };

type Arama = { q?: string; tur?: string };

export default async function KullanicilarSayfasi({
  searchParams,
}: {
  searchParams: Promise<Arama>;
}) {
  const sp = await searchParams;
  const tur = (["hepsi", "kalici", "takma", "muhtar", "yetkili"].includes(sp.tur ?? "")
    ? sp.tur
    : "hepsi") as "hepsi" | "kalici" | "takma" | "muhtar" | "yetkili";

  const [ozet, liste, mahalleler] = await Promise.all([
    katilimOzeti(),
    kullanicilar({ arama: sp.q ?? null, tur, limit: 150 }),
    withSystem((tx) => tx`
      select id, name from public.neighborhoods
       where is_active and center_lat is not null order by name
    `),
  ]);

  return (
    <KullaniciListesi
      ozet={ozet}
      kullanicilar={liste}
      mahalleler={mahalleler as unknown as Array<{ id: string; name: string }>}
      arama={sp.q ?? ""}
      tur={tur}
    />
  );
}
