import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { SifirlamaTalebi } from "@/components/auth/SifirlamaTalebi";

export const metadata: Metadata = { title: "Parolamı unuttum", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ParolaSifirlaSayfasi() {
  const user = await getSessionUser();
  if (user) redirect("/profil");
  return <SifirlamaTalebi />;
}
