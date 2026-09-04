import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { JoinPanel } from "@/components/auth/JoinPanel";
import { getMuhtarMahalleleri, getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Katıl", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function JoinPage() {
  const user = await getSessionUser();
  if (user) {
    // Muhtar hesabıyla giren kişi doğrudan kendi paneline gider: bu hesaplar
    // gezinmek için değil, mahalleyi yönetmek için verilir.
    const mahalleler = await getMuhtarMahalleleri(user.id);
    redirect(mahalleler.length ? "/muhtar" : "/profil");
  }
  return <JoinPanel />;
}
