import type { Metadata } from "next";
import { KurulumSayfasi } from "@/components/kurulum/KurulumSayfasi";

export const metadata: Metadata = {
  title: "AYRA'yı ana ekranına ekle",
  description:
    "AYRA'yı telefonunuzun ana ekranına ekleyin. iPhone ve Android için adım adım kurulum.",
  openGraph: {
    images: [{ url: "/og/kur.png", width: 1200, height: 630, alt: "AYRA'yı ana ekranına ekle" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og/kur.png"],
  },
  alternates: { canonical: "/kur" },
};

export default function Page() {
  return (
    <KurulumSayfasi
      hedef="auto"
      baslik="AYRA'yı ana ekranına ekle"
      altBaslik="Telefonunuzu tanıdık; size uygun adımları gösteriyoruz. Uygulama mağazasına gitmenize gerek yok."
    />
  );
}
