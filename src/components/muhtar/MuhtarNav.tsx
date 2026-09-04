"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/utils";

const BAGLANTILAR = [
  { href: "/muhtar", label: "Özet", tam: true },
  { href: "/muhtar/bildirimler", label: "Bildirimler" },
  { href: "/muhtar/harita", label: "Isı haritası" },
  { href: "/muhtar/haftalik", label: "Haftalık özet" },
  { href: "/muhtar/duyurular", label: "Duyurular" },
];

export function MuhtarNav() {
  const yol = usePathname();

  return (
    <nav aria-label="Muhtar paneli gezinme" className="lg:w-52 lg:shrink-0">
      <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {BAGLANTILAR.map((b) => {
          const aktif = b.tam ? yol === b.href : yol.startsWith(b.href);
          return (
            <li key={b.href}>
              <Link
                href={b.href}
                aria-current={aktif ? "page" : undefined}
                className={cx(
                  "block whitespace-nowrap rounded-xl px-3.5 py-2.5 text-sm transition",
                  aktif
                    ? "bg-ink-900 font-medium text-white"
                    : "text-ink-600 hover:bg-white hover:text-ink-900",
                )}
              >
                {b.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
