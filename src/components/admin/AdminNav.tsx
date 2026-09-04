"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/utils";
import { IconChart, IconLayers, IconShieldCheck, IconPin, IconCompass, IconFilter, IconUser } from "../icons";

const LINKS: Array<{ href: string; label: string; Icon: (p: { size?: number }) => React.ReactElement; exact?: boolean }> = [
  { href: "/yonetim", label: "Genel bakış", Icon: IconChart, exact: true },
  { href: "/yonetim/bildirimler", label: "Bildirimler", Icon: IconCompass },
  { href: "/yonetim/moderasyon", label: "Moderasyon", Icon: IconShieldCheck },
  { href: "/yonetim/analitik", label: "Analitik", Icon: IconFilter },
  { href: "/yonetim/kurumlar", label: "Kurumlar", Icon: IconLayers },
  { href: "/yonetim/gonderim-onayi", label: "Gönderim onayı", Icon: IconShieldCheck },
  { href: "/yonetim/yonlendirme", label: "Yönlendirme", Icon: IconFilter },
  { href: "/yonetim/gonderimler", label: "Gönderimler", Icon: IconLayers },
  { href: "/yonetim/kategoriler", label: "Kategoriler", Icon: IconLayers },
  { href: "/yonetim/mahalleler", label: "Mahalleler", Icon: IconPin },
  { href: "/yonetim/haftalik", label: "Haftalık özet", Icon: IconChart },
  { href: "/yonetim/kullanicilar", label: "Katılanlar", Icon: IconUser },
  { href: "/yonetim/muhtarlar", label: "Muhtarlar", Icon: IconPin },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Yönetim menüsü" className="w-full lg:w-52 lg:shrink-0">
      <ul className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
        {LINKS.map(({ href, label, Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex h-10 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm font-medium transition-colors",
                  active ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-white hover:text-ink-900",
                )}
              >
                <Icon size={17} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
