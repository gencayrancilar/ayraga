import Link from "next/link";
import { AyraLogo } from "./Logo";
import { IconSearch, IconPin, IconChart } from "./icons";
import type { SessionUser } from "@/lib/auth/session";

const DESKTOP_LINKS = [
  { href: "/", label: "Harita" },
  { href: "/kesfet", label: "Keşfet" },
  { href: "/mahalle", label: "Mahalleler" },
  { href: "/takip", label: "Takip" },
] as const;

export function AppHeader({
  user,
  place = "Ayrancılar, Torbalı",
}: {
  user: SessionUser | null;
  place?: string;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/92 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 lg:h-16">
        <Link href="/" className="shrink-0" aria-label="AYRA ana sayfa">
          <AyraLogo size="sm" />
        </Link>

        <span
          className="hidden items-center gap-1 rounded-full bg-surface-muted px-2.5 py-1 text-xs text-ink-600 sm:inline-flex"
          title="Yayında olan bölge"
        >
          <IconPin size={13} />
          {place}
        </span>

        <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Bölümler">
          {DESKTOP_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <Link
            href="/kesfet?odak=arama"
            aria-label="Sorun ara"
            className="tap-target flex items-center justify-center rounded-xl text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800"
          >
            <IconSearch size={20} />
          </Link>

          {(user?.role === "admin" || user?.role === "moderator") && (
            <Link
              href="/yonetim"
              aria-label="Yönetim paneli"
              className="tap-target flex items-center justify-center rounded-xl text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800"
            >
              <IconChart size={20} />
            </Link>
          )}

          <Link
            href="/bildir"
            className="ml-1 hidden h-10 items-center rounded-xl bg-ink-900 px-4 text-sm font-medium text-white transition-colors hover:bg-ink-800 lg:inline-flex"
          >
            Sorun bildir
          </Link>

          {user ? (
            <Link
              href="/profil"
              className="ml-1 hidden size-9 items-center justify-center rounded-full bg-surface-sunken text-xs font-semibold text-ink-700 transition-colors hover:bg-line lg:flex"
              aria-label={`Profil: ${user.displayName}`}
              title={user.displayName}
            >
              {initials(user.displayName)}
            </Link>
          ) : (
            <Link
              href="/giris"
              className="ml-1 hidden h-10 items-center rounded-xl px-3 text-sm font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900 lg:inline-flex"
            >
              Katıl
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toLocaleUpperCase("tr-TR") ?? "")
    .join("");
}
