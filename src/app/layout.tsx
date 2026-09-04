import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "@/styles/globals.css";
import { publicConfig } from "@/lib/public-config";
import { ServiceWorker } from "@/components/ServiceWorker";

/**
 * Inter, Google Fonts'tan çağrılmak yerine uygulamayla birlikte sunulur.
 * Böylece hiçbir üçüncü taraf isteği yapılmaz (KVKK açısından daha temiz),
 * ilk boyama hızlanır ve uygulama çevrimdışı da doğru fontla açılır.
 * latin-ext alt kümesi Türkçe karakterler için gereklidir.
 */
const inter = localFont({
  src: [
    { path: "../fonts/inter-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
    { path: "../fonts/inter-latin-ext-wght-normal.woff2", weight: "100 900", style: "normal" },
  ],
  display: "swap",
  variable: "--font-inter",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});

export const metadata: Metadata = {
  metadataBase: new URL(publicConfig.siteUrl),
  title: {
    default: "AYRA — Gör. Bildir. Destekle. Takip et.",
    template: "%s · AYRA",
  },
  description:
    "AYRA, yaşadığınız bölgedeki sorunları harita üzerinde görünür kılan, "
    + "toplumsal destek oluşturan ve çözüm sürecini şeffaf biçimde takip edilebilir hâle getiren bağımsız kent platformudur.",
  applicationName: "AYRA",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "AYRA" },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    locale: "tr_TR",
    siteName: "AYRA",
    title: "AYRA — Gör. Bildir. Destekle. Takip et.",
    description: "Ayrancılar ve çevresindeki kent sorunlarını bildirin, destekleyin ve çözüm sürecini takip edin.",
  },
  twitter: { card: "summary_large_image" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr" className={inter.variable}>
      <body>
        <a href="#icerik" className="sr-only-focusable">İçeriğe atla</a>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
