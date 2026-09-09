"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AyraMark } from "@/components/Logo";

/**
 * "Ana ekrana ekle" şeridi.
 *
 * Görünürlük kuralları bilinçli olarak cimri:
 *  · ilk sayfada çıkmaz — kişi en az iki sayfa gezdikten sonra görünür,
 *  · kapatılırsa üç ay boyunca bir daha çıkmaz,
 *  · uygulama zaten kuruluysa hiç çıkmaz,
 *  · bildirim akışında ve yönetim ekranlarında çıkmaz.
 *
 * Android'de tarayıcı gerçek kurulum çağrısı verdiyse düğme doğrudan kurar.
 * iPhone'da böyle bir API yok; oradaki düğme adımların anlatıldığı /kur
 * sayfasına götürür. Kurmuyormuş gibi görünen bir düğme koymuyoruz.
 */

const KAPATMA_ANAHTARI = "ayra.kurulum.kapatildi";
const SAYAC_ANAHTARI = "ayra.kurulum.goruntuleme";
const SESSIZLIK_GUNU = 90;
const ESIK = 2; // kaçıncı sayfa görüntülemesinden sonra görünsün

interface YuklemeOlayi extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Tarayıcı deposu her ortamda yazılabilir değil (gizli sekme, kısıtlı ayar). */
function oku(anahtar: string): string | null {
  try {
    return window.localStorage.getItem(anahtar);
  } catch {
    return null;
  }
}
function yaz(anahtar: string, deger: string) {
  try {
    window.localStorage.setItem(anahtar, deger);
  } catch {
    /* yazamıyorsak şerit her oturumda yeniden çıkar; kabul edilebilir */
  }
}

/**
 * Şeridin çıkmayacağı ekranlar.
 *
 * Harita ekranı (/) listeye çıkışın da olduğu yerdir: alt kenarda "N bildirimi
 * listele" düğmesi durur ve şerit tam onun üzerine oturuyordu. Kullanıcı
 * haritadaki bildirimlerin listesini ne görebiliyor ne de dokunabiliyordu.
 * Tanıtım amaçlı bir şerit, işleyen bir düğmenin önüne geçemez.
 *
 * Muhtar paneli de dışarıda: orası bir çalışma ekranı, vitrin değil.
 */
function gizlenecekYol(yol: string): boolean {
  return (
    yol === "/" ||
    yol.startsWith("/kur") ||
    yol.startsWith("/bildir") ||
    yol.startsWith("/yonetim") ||
    yol.startsWith("/muhtar") ||
    yol.startsWith("/giris")
  );
}

function kuruluMu(): boolean {
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return Boolean(iosStandalone) || window.matchMedia("(display-mode: standalone)").matches;
}

function iosMu(): boolean {
  const ua = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function KurulumSeridi() {
  const yol = usePathname();
  const [gorunur, setGorunur] = useState(false);
  const [olay, setOlay] = useState<YuklemeOlayi | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const yakala = (e: Event) => {
      e.preventDefault();
      setOlay(e as YuklemeOlayi);
    };
    const kuruldu = () => {
      setGorunur(false);
      yaz(KAPATMA_ANAHTARI, String(Date.now()));
    };
    window.addEventListener("beforeinstallprompt", yakala);
    window.addEventListener("appinstalled", kuruldu);
    return () => {
      window.removeEventListener("beforeinstallprompt", yakala);
      window.removeEventListener("appinstalled", kuruldu);
    };
  }, []);

  useEffect(() => {
    if (gizlenecekYol(yol)) {
      setGorunur(false);
      return;
    }
    if (kuruluMu()) return;

    const kapatilma = Number(oku(KAPATMA_ANAHTARI) ?? 0);
    if (kapatilma && Date.now() - kapatilma < SESSIZLIK_GUNU * 86_400_000) return;

    const sayac = Number(oku(SAYAC_ANAHTARI) ?? 0) + 1;
    yaz(SAYAC_ANAHTARI, String(sayac));
    if (sayac < ESIK) return;

    setIos(iosMu());
    const zamanlayici = window.setTimeout(() => setGorunur(true), 1200);
    return () => window.clearTimeout(zamanlayici);
  }, [yol]);

  const kapat = useCallback(() => {
    setGorunur(false);
    yaz(KAPATMA_ANAHTARI, String(Date.now()));
  }, []);

  const kur = useCallback(async () => {
    if (!olay) return;
    await olay.prompt();
    const secim = await olay.userChoice;
    setOlay(null);
    if (secim.outcome === "accepted") {
      setGorunur(false);
      yaz(KAPATMA_ANAHTARI, String(Date.now()));
    }
  }, [olay]);

  if (!gorunur) return null;

  const dogrudanKurulum = Boolean(olay) && !ios;

  return (
    <div
      className={
        "pointer-events-none fixed inset-x-0 z-40 px-3 " +
        "bottom-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)] lg:bottom-6 lg:px-6"
      }
    >
      <div
        role="region"
        aria-label="AYRA'yı ana ekrana ekleme önerisi"
        className={
          "pointer-events-auto mx-auto flex max-w-lg items-center gap-3 rounded-2xl " +
          "border border-line bg-white/95 p-3 shadow-raise backdrop-blur-md " +
          "motion-safe:animate-[seritGir_.25s_ease-out]"
        }
      >
        <AyraMark size={36} className="shrink-0" />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink-900">Ana ekranına ekle</p>
          <p className="truncate text-xs text-ink-500">
            {dogrudanKurulum
              ? "Tek dokunuş, indirme yok."
              : ios
                ? "Safari'de üç dokunuş."
                : "İndirme yok."}
          </p>
        </div>

        {dogrudanKurulum ? (
          <button
            type="button"
            onClick={kur}
            className="shrink-0 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition active:bg-teal-800"
          >
            Ekle
          </button>
        ) : (
          <Link
            href="/kur"
            className="shrink-0 rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white transition active:bg-ink-700"
          >
            Nasıl?
          </Link>
        )}

        <button
          type="button"
          onClick={kapat}
          aria-label="Kapat"
          className="-mr-1 shrink-0 rounded-lg p-1.5 text-ink-400 transition hover:bg-surface-sunken hover:text-ink-700"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
