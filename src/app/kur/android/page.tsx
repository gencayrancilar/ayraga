import type { Metadata } from "next";
import { KurulumSayfasi } from "@/components/kurulum/KurulumSayfasi";

export const metadata: Metadata = {
  title: "Android'e ekle",
  description: "AYRA'yı Android telefonunuzun ana ekranına tek dokunuşla ekleyin.",
  openGraph: {
    images: [{ url: "/og/kur-android.png", width: 1200, height: 630, alt: "AYRA'yı Android'e ekle" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og/kur-android.png"],
  },
  alternates: { canonical: "/kur/android" },
};

export default function Page() {
  return (
    <KurulumSayfasi
      hedef="android"
      baslik="Android'e ekle"
      altBaslik="Chrome kurulumu doğrudan başlatabiliyor: tek dokunuş yeterli."
      digerBaglanti={{ href: "/kur/ios", metin: "iPhone kullanıyorum →" }}
    />
  );
}
