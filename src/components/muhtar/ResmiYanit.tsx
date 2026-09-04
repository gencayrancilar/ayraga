"use client";

import { useActionState } from "react";
import { resmiYanitYaz, type MuhtarState } from "@/lib/actions/muhtar";

/**
 * Bir bildirime muhtarın resmî yanıtı.
 *
 * Yanıt yayımlandıktan sonra düzenlenemez: kanıt zincirine yazılır ve zincirin
 * anlamı, geçmişe dönük değişikliğin mümkün olmamasıdır. Bunu forma da
 * yazıyoruz ki muhtar ne yaptığını bilerek göndersin.
 */
export function ResmiYanitFormu({ reportId }: { reportId: string }) {
  const [durum, eylem, bekliyor] = useActionState<MuhtarState, FormData>(resmiYanitYaz, { ok: false });

  if (durum.ok) {
    return (
      <section className="rounded-2xl bg-teal-50 p-4 ring-1 ring-teal-200 sm:p-5">
        <p className="text-sm text-teal-900">{durum.message}</p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-line sm:p-5">
      <h2 className="text-base font-semibold text-ink-900">Resmî yanıt yaz</h2>
      <p className="mt-1 text-sm text-ink-500">
        Bu bildirim sizin mahallenizde. Ne yaptığınızı yazarsanız yanıtınız
        muhtar imzasıyla kanıt zincirine işlenir ve sorunu destekleyen herkese
        bildirim gider. Yayımlandıktan sonra değiştirilemez.
      </p>

      <form action={eylem} className="mt-4 space-y-3">
        <input type="hidden" name="reportId" value={reportId} />

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-600">Yanıtınız</span>
          <textarea
            name="body"
            required
            minLength={10}
            maxLength={2000}
            rows={4}
            placeholder="Konuyu belediye fen işleri müdürlüğüne ilettim, önümüzdeki hafta ekip gelecek."
            className="w-full rounded-xl border border-line px-3 py-2.5 text-sm"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-600">
            Başvuru / iş emri numarası <span className="font-normal text-ink-400">(varsa)</span>
          </span>
          <input
            name="referenceNo"
            maxLength={60}
            placeholder="FEN-2026-114"
            className="w-full rounded-xl border border-line px-3 py-2.5 text-sm"
          />
        </label>

        {durum.error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{durum.error}</p>
        )}

        <button
          type="submit"
          disabled={bekliyor}
          className="w-full rounded-xl bg-ink-900 px-5 py-3 text-sm font-semibold text-white transition active:bg-ink-700 disabled:opacity-60 sm:w-auto"
        >
          {bekliyor ? "Gönderiliyor…" : "Yanıtı yayımla"}
        </button>
      </form>
    </section>
  );
}
