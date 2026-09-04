"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { formatDistance, formatNumber } from "@/lib/format";
import { IconCrosshair, IconSpinner, IconArrowRight, IconPin } from "../icons";
import type { ReportCard } from "@/lib/types";

const RADIUS = 500;

/**
 * "Yakınımda" özeti.
 *
 * Amaç yalnızca yakındaki bildirimleri göstermek değil; aynı sorunun defalarca
 * bildirilmesini azaltmak. Kullanıcı bildirim yapmadan önce çevresinde neyin
 * zaten kayıtlı olduğunu görür.
 */
export function NearbyBanner() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "denied">("idle");
  const [items, setItems] = useState<ReportCard[]>([]);

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) { setState("denied"); return; }
    setState("loading");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch(
            `/api/yakinimda?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}&r=${RADIUS}`,
          );
          const data = await res.json();
          setItems(data.items ?? []);
          setState("done");
        } catch {
          setState("denied");
        }
      },
      () => setState("denied"),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 120_000 },
    );
  }, []);

  if (state === "denied") {
    return (
      <p className="rounded-2xl bg-white px-4 py-3 text-xs text-ink-600 ring-1 ring-line">
        Konumunuza erişilemedi. Tarayıcı ayarlarından konum iznini açabilir veya
        aşağıdaki filtrelerle mahalle seçebilirsiniz.
      </p>
    );
  }

  if (state === "idle" || state === "loading") {
    return (
      <button
        type="button"
        onClick={locate}
        disabled={state === "loading"}
        className="flex w-full items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left ring-1 ring-line transition-shadow hover:shadow-card disabled:opacity-70"
      >
        <span className="text-ink-500">
          {state === "loading" ? <IconSpinner size={18} /> : <IconCrosshair size={18} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink-900">Yakınımda ne var?</span>
          <span className="block text-2xs text-ink-500">
            {RADIUS} m çevrenizdeki bildirimleri görün — aynı sorunu tekrar bildirmeyin.
          </span>
        </span>
        <IconArrowRight size={15} className="shrink-0 text-ink-400" />
      </button>
    );
  }

  return (
    <section aria-label="Yakınımdaki bildirimler" className="rounded-2xl bg-white p-4 ring-1 ring-line">
      <p className="text-sm font-medium text-ink-900">
        {items.length > 0
          ? `${RADIUS} m çevrenizde ${formatNumber(items.length)} bildirim`
          : `${RADIUS} m çevrenizde kayıtlı bildirim yok`}
      </p>

      {items.length === 0 ? (
        <p className="mt-1 text-xs text-ink-600">
          Çevrenizde çözüm bekleyen bir durum varsa ilk siz bildirebilirsiniz.
        </p>
      ) : (
        <ul className="mt-2.5 space-y-1.5">
          {items.slice(0, 4).map((r) => (
            <li key={r.id}>
              <Link
                href={`/sorun/${r.slug}`}
                className="flex items-center gap-2 rounded-xl bg-surface-muted px-3 py-2 text-xs transition-colors hover:bg-surface-sunken"
              >
                <span className="size-2 shrink-0 rounded-[3px]" style={{ background: r.category_color }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-medium text-ink-800">{r.title}</span>
                {r.distance_m != null && (
                  <span className="shrink-0 tabular-nums text-2xs text-ink-500">
                    {formatDistance(r.distance_m)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2.5 flex flex-wrap gap-2">
        <Link
          href="/bildir"
          className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-ink-900 px-3 text-xs font-medium text-white"
        >
          <IconPin size={14} /> Yeni sorun bildir
        </Link>
        {items.length > 4 && (
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-xl bg-white px-3 text-xs font-medium text-ink-700 ring-1 ring-line"
          >
            Haritada gör
          </Link>
        )}
      </div>
    </section>
  );
}
