import type { Metadata } from "next";
import Link from "next/link";
import { jetonuDogrula } from "@/lib/auth/parola";
import { YeniParola } from "@/components/auth/YeniParola";

export const metadata: Metadata = { title: "Yeni parola", robots: { index: false } };
export const dynamic = "force-dynamic";

const SEBEP: Record<string, string> = {
  yok: "Bu bağlantı tanınmadı. Adres kopyalanırken eksik kalmış olabilir.",
  kullanildi: "Bu bağlantı daha önce kullanılmış. Her bağlantı yalnızca bir kez çalışır.",
  "suresi-doldu": "Bu bağlantının süresi dolmuş. Bağlantılar bir saat geçerlidir.",
};

export default async function YeniParolaSayfasi({
  params,
}: {
  params: Promise<{ jeton: string }>;
}) {
  const { jeton } = await params;
  const durum = await jetonuDogrula(jeton);

  if (!durum.gecerli) {
    return (
      <div className="mx-auto max-w-md px-4 py-12">
        <h1 className="text-xl font-semibold text-ink-900">Bağlantı çalışmıyor</h1>
        <p className="mt-2 text-sm text-ink-600">{SEBEP[durum.sebep]}</p>
        <p className="mt-4 text-sm text-ink-600">
          <Link href="/parola-sifirla" className="font-medium text-teal-700 underline underline-offset-2">
            Yeni bir bağlantı isteyin
          </Link>
          {" — "}birkaç saniye sürer.
        </p>
      </div>
    );
  }

  return <YeniParola jeton={jeton} email={durum.email} />;
}
