"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/utils";
import { IconMap, IconCompass, IconPlus, IconBell, IconUser } from "./icons";

const TABS = [
  { href: "/", label: "Harita", Icon: IconMap, match: (p: string) => p === "/" },
  { href: "/kesfet", label: "Keşfet", Icon: IconCompass, match: (p: string) => p.startsWith("/kesfet") },
  { href: "/takip", label: "Takip", Icon: IconBell, match: (p: string) => p.startsWith("/takip") },
  { href: "/profil", label: "Profil", Icon: IconUser, match: (p: string) => p.startsWith("/profil") },
] as const;

/**
 * Alt navigasyon.
 *
 * Dört sekme ve ortada yükseltilmiş bir "Bildir" eylemi. "Bildirimler" ayrı
 * bir sekme olarak değil, "Takip" içinde toplanır: kullanıcının
 * "bunu bildirdik, sonra ne oldu?" sorusunun tek bir cevap yeri olur.
 */
export function BottomNav({ unreadCount = 0 }: { unreadCount?: number }) {
  const pathname = usePathname();

  // Bildirim akışı odaklanmış bir görevdir: kendi alt eylem çubuğu vardır ve
  // sekme çubuğu hem onu örter hem de dikkati dağıtır.
  if (pathname.startsWith("/bildir")) return null;

  return (
    <nav
      aria-label="Ana gezinme"
      // Yükseklik sabit tutulur: harita ekranı kendi yüksekliğini bu ölçüye
      // göre hesaplıyor, değişken bir yükseklik haritanın altını kapatır.
      className="sticky bottom-0 z-30 h-16 border-t border-line bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto grid h-16 max-w-lg grid-cols-5 items-center">
        {TABS.slice(0, 2).map((tab) => (
          <NavItem key={tab.href} {...tab} active={tab.match(pathname)} />
        ))}

        <li className="flex justify-center">
          <Link
            href="/bildir"
            aria-label="Sorun bildir"
            className={cx(
              "-mt-5 flex size-14 items-center justify-center rounded-2xl bg-ink-900 text-white",
              "shadow-raise transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2",
              pathname.startsWith("/bildir") && "bg-teal-600",
            )}
          >
            <IconPlus size={24} strokeWidth={2} />
          </Link>
        </li>

        {TABS.slice(2).map((tab) => (
          <NavItem
            key={tab.href}
            {...tab}
            active={tab.match(pathname)}
            badge={tab.href === "/takip" ? unreadCount : 0}
          />
        ))}
      </ul>
    </nav>
  );
}

function NavItem({
  href, label, Icon, active, badge = 0,
}: {
  href: string;
  label: string;
  Icon: (p: { size?: number }) => React.ReactElement;
  active: boolean;
  badge?: number;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cx(
          "tap-target flex flex-col items-center gap-0.5 px-1 py-2 text-2xs font-medium transition-colors",
          active ? "text-ink-900" : "text-ink-400 hover:text-ink-600",
        )}
      >
        <span className="relative">
          <Icon size={22} />
          {badge > 0 && (
            <span
              className="absolute -right-1.5 -top-1 min-w-4 rounded-full bg-teal-600 px-1 text-center text-[0.5625rem] font-bold leading-4 text-white"
              aria-label={`${badge} okunmamış`}
            >
              {badge > 9 ? "9+" : badge}
            </span>
          )}
        </span>
        {label}
      </Link>
    </li>
  );
}
