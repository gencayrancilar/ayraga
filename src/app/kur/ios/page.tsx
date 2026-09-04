import type { Metadata } from "next";
import { KurulumSayfasi } from "@/components/kurulum/KurulumSayfasi";

export const metadata: Metadata = {
  title: "iPhone'a ekle",
  description: "AYRA'yı iPhone veya iPad'inizin ana ekranına üç dokunuşta ekleyin.",
  openGraph: {
    images: [{ url: "/og/kur-ios.png", width: 1200, height: 630, alt: "AYRA'yı iPhone'a ekle" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og/kur-ios.png"],
  },
  alternates: { canonical: "/kur/ios" },
};

export default function Page() {
  return (
    <KurulumSayfasi
      hedef="ios"
      baslik="iPhone'a ekle"
      altBaslik="Safari'de üç dokunuş. AYRA ana ekranınızda kendi simgesiyle, tam ekran açılır."
      digerBaglanti={{ href: "/kur/android", metin: "Android kullanıyorum →" }}
    />
  );
}
