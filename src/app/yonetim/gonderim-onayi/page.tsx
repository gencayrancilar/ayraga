import { requireModerator } from "@/lib/auth/session";
import { gonderimOzeti, kurumAdaylari, kurumSecenekleri } from "@/lib/queries/gonderim-onayi";
import { GonderimOnayi } from "@/components/admin/GonderimOnayi";

export const dynamic = "force-dynamic";
export const metadata = { title: "Gönderim onayı" };

export default async function GonderimOnayiSayfasi({
  searchParams,
}: {
  searchParams: Promise<{ kurum?: string }>;
}) {
  await requireModerator();
  const { kurum } = await searchParams;

  const [kurumlar, secenekler] = await Promise.all([gonderimOzeti(), kurumSecenekleri()]);
  // Varsayılan: kararı en çok bekleyen kurum. İş nerede birikiyorsa orası açılsın.
  const secili =
    kurumlar.find((k) => k.authority_id === kurum) ??
    [...kurumlar].sort((a, b) => b.bekleyen - a.bekleyen)[0];

  const adaylar = secili ? await kurumAdaylari(secili.authority_id) : [];

  return (
    <GonderimOnayi
      kurumlar={kurumlar}
      secili={secili ?? null}
      adaylar={adaylar}
      secenekler={secenekler}
    />
  );
}
