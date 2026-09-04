import Link from "next/link";
import { KurulumRehberi } from "./KurulumRehberi";

const OZELLIKLER = [
  "Sorunu haritada gör, konumunla bildir",
  "Destekle — destek, sorunun kuruma iletilirken taşıdığı ağırlığı belirler",
  "Kanıt zinciriyle her adımı takip et",
  "Çevrimdışıyken de açılır",
];

export function KurulumSayfasi({
  hedef,
  baslik,
  altBaslik,
  digerBaglanti,
}: {
  hedef?: "ios" | "android" | "auto";
  baslik: string;
  altBaslik: string;
  digerBaglanti?: { href: string; metin: string };
}) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">{baslik}</h1>
      <p className="mt-2 text-sm leading-6 text-ink-500">{altBaslik}</p>

      <div className="mt-6">
        <KurulumRehberi hedef={hedef} />
      </div>

      <ul className="mt-8 space-y-2.5">
        {OZELLIKLER.map((o) => (
          <li key={o} className="flex gap-2.5 text-sm leading-6 text-ink-700">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-teal-500" />
            {o}
          </li>
        ))}
      </ul>

      <p className="mt-8 text-xs leading-5 text-ink-400">
        AYRA uygulama mağazasında değil; doğrudan ana ekranınıza kuruluyor. İndirme yok,
        hesap zorunluluğu yok, güncelleme beklemek yok — açtığınızda her zaman güncel sürümü
        görürsünüz.
      </p>

      {digerBaglanti && (
        <p className="mt-4 text-sm text-ink-500">
          <Link href={digerBaglanti.href} className="underline underline-offset-2 hover:text-ink-900">
            {digerBaglanti.metin}
          </Link>
        </p>
      )}
    </>
  );
}
