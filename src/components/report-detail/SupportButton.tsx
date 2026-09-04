"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleSupport } from "@/lib/actions/reports";
import { formatNumber } from "@/lib/format";
import { cx } from "@/lib/utils";
import { IconArrowUp, IconCheck, IconSpinner } from "../icons";

/**
 * Destek düğmesi.
 *
 * Bir kullanıcı bir sorunu yalnızca bir kez destekleyebilir; sayı iyimser
 * olarak güncellenir, sunucu reddederse eski değere döner. Beğeni değil,
 * öncelik sinyalidir — bu yüzden dil "destekliyorum", metrik "kişi".
 */
export function SupportButton({
  reportId, initialCount, initialSupported, isAuthenticated, size = "lg",
}: {
  reportId: string;
  initialCount: number;
  initialSupported: boolean;
  isAuthenticated: boolean;
  size?: "md" | "lg";
}) {
  const router = useRouter();
  const [count, setCount] = useState(initialCount);
  const [supported, setSupported] = useState(initialSupported);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onClick = () => {
    if (!isAuthenticated) {
      router.push("/giris");
      return;
    }
    const prev = { count, supported };
    setSupported(!supported);
    setCount(count + (supported ? -1 : 1));
    setError(null);

    startTransition(async () => {
      const result = await toggleSupport(reportId);
      if (!result.ok) {
        setCount(prev.count);
        setSupported(prev.supported);
        setError(result.error ?? "İşlem tamamlanamadı.");
        if (result.code === "AUTH_REQUIRED") router.push("/giris");
        return;
      }
      setCount(result.count ?? prev.count);
      setSupported(result.supported ?? prev.supported);
      router.refresh();
    });
  };

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-pressed={supported}
        className={cx(
          "inline-flex w-full items-center justify-center gap-2 rounded-xl font-medium transition-colors",
          size === "lg" ? "h-13 text-base" : "h-11 text-sm",
          supported
            ? "bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-300"
            : "bg-teal-600 text-white hover:bg-teal-700",
          pending && "opacity-70",
        )}
      >
        {pending ? <IconSpinner size={18} /> : supported ? <IconCheck size={18} /> : <IconArrowUp size={18} />}
        {supported ? "Destekliyorsunuz" : "Destekle"}
        <span
          className={cx(
            "rounded-full px-2 py-0.5 text-xs tabular-nums",
            supported ? "bg-teal-100 text-teal-900" : "bg-teal-800 text-white",
          )}
        >
          {formatNumber(count)}
        </span>
      </button>
      {error && <p role="alert" className="text-xs text-[#9f1239]">{error}</p>}
      {!supported && !error && (
        <p className="text-center text-2xs text-ink-500">
          Destek, sorunun kuruma iletilirken taşıdığı ağırlığı belirler.
        </p>
      )}
    </div>
  );
}
