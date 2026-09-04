import Link from "next/link";
import { AyraLogo } from "@/components/Logo";

export default function NotFound() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
      <AyraLogo size="md" />
      <h1 className="mt-6 text-xl font-semibold text-ink-900">Bu sayfa bulunamadı</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-600">
        Aradığınız bildirim kaldırılmış veya başka bir kayıtla birleştirilmiş olabilir.
      </p>
      <div className="mt-6 flex gap-2">
        <Link href="/" className="inline-flex h-11 items-center rounded-xl bg-ink-900 px-5 text-sm font-medium text-white">
          Haritaya dön
        </Link>
        <Link href="/kesfet" className="inline-flex h-11 items-center rounded-xl bg-white px-5 text-sm font-medium text-ink-700 ring-1 ring-line">
          Keşfet
        </Link>
      </div>
    </div>
  );
}
