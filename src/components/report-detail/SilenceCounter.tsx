"use client";

import { useEffect, useState } from "react";
import { formatElapsed } from "@/lib/format";
import { IconClock } from "../icons";

/**
 * Yetkili sessizlik sayacı.
 *
 * Bilinçli olarak nesnel bir dil kullanır: "başvurudan bu yana geçen süre".
 * Kimseyi suçlamaz, yalnızca kamuya açık bir olguyu gösterir. Kurumun kendi
 * yanıt süresi hedefi (SLA) aşıldığında ton sertleşmez; yalnızca hedefin
 * aşıldığı bilgisi eklenir.
 */
export function SilenceCounter({
  since, slaDays, authorityName,
}: {
  since: string;
  slaDays: number;
  authorityName: string | null;
}) {
  const [hours, setHours] = useState(() => (Date.now() - new Date(since).getTime()) / 3_600_000);

  useEffect(() => {
    const id = setInterval(() => {
      setHours((Date.now() - new Date(since).getTime()) / 3_600_000);
    }, 60_000);
    return () => clearInterval(id);
  }, [since]);

  const overdue = hours > slaDays * 24;

  return (
    <section
      className={`rounded-2xl p-4 ring-1 ring-inset ${overdue ? "bg-[#fbf3e0] ring-[#f0e0b8]" : "bg-surface-muted ring-line"}`}
      aria-label="Başvurudan bu yana geçen süre"
    >
      <div className="flex items-start gap-3">
        <span className={overdue ? "text-[#a16207]" : "text-ink-400"}>
          <IconClock size={20} />
        </span>
        <div className="min-w-0">
          <p className={`text-2xs font-medium uppercase tracking-wide ${overdue ? "text-[#a16207]" : "text-ink-500"}`}>
            Başvurudan bu yana geçen süre
          </p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums text-ink-900">
            {formatElapsed(Math.max(hours, 0))}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-ink-600">
            {authorityName ? `${authorityName} tarafından ` : ""}henüz yazılı bir yanıt kaydedilmedi.
            {overdue
              ? ` Kurumun kendi yanıt süresi hedefi ${slaDays} gündür.`
              : ` Kurumun yanıt süresi hedefi ${slaDays} gün.`}
          </p>
        </div>
      </div>
    </section>
  );
}
