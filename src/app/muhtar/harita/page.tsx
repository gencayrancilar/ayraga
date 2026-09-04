import { muhtarIsiNoktalari, muhtarKategoriDagilimi } from "@/lib/queries/muhtar";
import { requireMuhtar } from "@/lib/auth/session";
import { withSystem } from "@/lib/db";
import { IsiHaritasi } from "@/components/muhtar/IsiHaritasi";
import { publicConfig } from "@/lib/public-config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Isı haritası" };

export default async function MuhtarHaritaSayfasi() {
  const { mahalleler } = await requireMuhtar();
  const [noktalar, kategoriler] = await Promise.all([
    muhtarIsiNoktalari(),
    muhtarKategoriDagilimi(),
  ]);

  // Harita mahallenin merkezine açılır; merkez tanımlı değilse uygulamanın
  // varsayılan merkezine düşer.
  const satirlar = await withSystem(
    (tx) => tx`
      select avg(center_lat)::float8 as lat, avg(center_lng)::float8 as lng
        from public.neighborhoods
       where id = any(${mahalleler.map((m) => m.id)}::uuid[]) and center_lat is not null
    `,
  );
  const merkez =
    satirlar[0]?.lat != null
      ? { lat: Number(satirlar[0].lat), lng: Number(satirlar[0].lng) }
      : { lat: publicConfig.defaultCenter.lat, lng: publicConfig.defaultCenter.lng };

  const enBuyuk = Math.max(1, ...kategoriler.map((k) => k.adet));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-ink-900">Isı haritası</h1>
        <p className="mt-1 text-sm text-ink-500">
          {mahalleler.map((m) => m.name).join(", ")} mahallesindeki açık sorunların
          coğrafi dağılımı. Çözülmüş kayıtlar haritaya girmez.
        </p>
      </header>

      {noktalar.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-white/60 p-8 text-center text-sm text-ink-500">
          Mahallenizde henüz açık bildirim yok; harita boş.
        </p>
      ) : (
        <IsiHaritasi noktalar={noktalar} merkez={merkez} />
      )}

      {kategoriler.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-ink-900">Kategori dağılımı</h2>
          <p className="mt-1 mb-3 text-sm text-ink-500">
            Mahallenizde bugüne kadar bildirilen tüm kayıtların türlere göre dökümü.
          </p>
          <ul className="space-y-2">
            {kategoriler.map((k) => (
              <li key={k.slug} className="rounded-xl border border-line bg-white p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-ink-800">{k.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-ink-500">
                    {k.adet} kayıt · {k.destek} destek
                  </span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(k.adet / enBuyuk) * 100}%`, backgroundColor: k.color }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
