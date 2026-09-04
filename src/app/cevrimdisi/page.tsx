import type { Metadata } from "next";
import Link from "next/link";
import { AyraLogo } from "@/components/Logo";

export const metadata: Metadata = { title: "Çevrimdışı", robots: { index: false } };

export default function OfflinePage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
      <AyraLogo size="md" />
      <h1 className="mt-6 text-xl font-semibold text-ink-900">Bağlantı yok</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-600">
        Kent verisi her zaman güncel olmalı, bu yüzden AYRA çevrimdışı eski veri göstermez.
        Bağlantınız geri geldiğinde sayfayı yenileyin.
      </p>
      <Link href="/" className="mt-6 inline-flex h-11 items-center rounded-xl bg-ink-900 px-5 text-sm font-medium text-white">
        Yeniden dene
      </Link>
    </div>
  );
}
