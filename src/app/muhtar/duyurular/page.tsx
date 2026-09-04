import { muhtarDuyurulari } from "@/lib/queries/muhtar";
import { requireMuhtar } from "@/lib/auth/session";
import { DuyuruFormu } from "@/components/muhtar/DuyuruFormu";
import { DuyuruListesi } from "@/components/muhtar/DuyuruListesi";

export const dynamic = "force-dynamic";
export const metadata = { title: "Duyurular" };

export default async function MuhtarDuyurularSayfasi() {
  const { mahalleler } = await requireMuhtar();
  const duyurular = await muhtarDuyurulari();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-ink-900">Duyurular</h1>
        <p className="mt-1 text-sm text-ink-500">
          Yazdığınız duyuru onay beklemeden yayımlanır ve mahalle sayfanızda
          görünür. Topluluk kurallarına aykırı bir duyuruyu dernek gerekçesini
          yazarak kaldırabilir; kaldırma gerekçesi size burada görünür.
        </p>
      </header>

      <DuyuruFormu mahalleler={mahalleler} />

      <section>
        <h2 className="text-base font-semibold text-ink-900">Yazdığınız duyurular</h2>
        <div className="mt-3">
          <DuyuruListesi duyurular={duyurular} />
        </div>
      </section>
    </div>
  );
}
