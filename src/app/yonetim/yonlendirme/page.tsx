import { requireModerator } from "@/lib/auth/session";
import { kategoriYonlendirmesi, kurumSecenekleri } from "@/lib/queries/gonderim-onayi";
import { Yonlendirme } from "@/components/admin/Yonlendirme";

export const dynamic = "force-dynamic";
export const metadata = { title: "Yönlendirme" };

export default async function YonlendirmeSayfasi() {
  await requireModerator();
  const [satirlar, kurumlar] = await Promise.all([kategoriYonlendirmesi(), kurumSecenekleri()]);
  return <Yonlendirme satirlar={satirlar} kurumlar={kurumlar} />;
}
