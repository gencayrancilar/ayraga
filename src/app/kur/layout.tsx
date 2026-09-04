import Link from "next/link";
import { AyraWordmark } from "@/components/Logo";

export default function KurLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-surface-muted">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-lg items-center justify-between px-5 py-4">
          <Link href="/" aria-label="AYRA ana sayfa">
            <AyraWordmark />
          </Link>
          <Link href="/" className="text-sm text-ink-500 hover:text-ink-900">
            Haritaya git
          </Link>
        </div>
      </header>
      <main id="icerik" className="flex-1">
        <div className="mx-auto w-full max-w-lg px-5 py-8 sm:py-12">{children}</div>
      </main>
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto max-w-lg px-5 py-5 text-xs text-ink-400">
          AYRA · Genç Ayrancılar Derneği ·{" "}
          <Link href="/gizlilik" className="underline underline-offset-2 hover:text-ink-700">
            Gizlilik
          </Link>
        </div>
      </footer>
    </div>
  );
}
