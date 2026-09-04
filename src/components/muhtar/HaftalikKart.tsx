"use client";

import { useState } from "react";

/**
 * Haftalık özetin metin hâli ve kopyalama düğmesi.
 *
 * Metin bilerek düz: WhatsApp'ta kalın harf, tablo ve markdown bozuk görünür.
 * Kopyalama başarısız olursa metni gizlemiyoruz — kişi elle seçip
 * kopyalayabilsin diye kutu her zaman görünür durur.
 */
export function HaftalikKart({ baslik, metin }: { baslik: string; metin: string }) {
  const [kopyalandi, setKopyalandi] = useState(false);
  const [hata, setHata] = useState(false);

  async function kopyala() {
    try {
      await navigator.clipboard.writeText(metin);
      setKopyalandi(true);
      setHata(false);
      setTimeout(() => setKopyalandi(false), 2500);
    } catch {
      setHata(true);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-ink-900">{baslik}</h2>
        <div className="flex gap-2">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(metin)}`}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-xl border border-line px-3 py-2 text-xs font-medium text-ink-700 hover:bg-surface-sunken"
          >
            WhatsApp&apos;ta aç
          </a>
          <button
            type="button"
            onClick={kopyala}
            className="rounded-xl bg-ink-900 px-3 py-2 text-xs font-semibold text-white active:bg-ink-700"
          >
            {kopyalandi ? "Kopyalandı ✓" : "Metni kopyala"}
          </button>
        </div>
      </div>

      <pre className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-surface-muted p-3.5 font-sans text-sm leading-relaxed text-ink-800">
        {metin}
      </pre>

      {hata && (
        <p className="mt-2 text-xs text-ink-500">
          Tarayıcı kopyalamaya izin vermedi; yukarıdaki metni elle seçip kopyalayabilirsiniz.
        </p>
      )}
    </section>
  );
}
