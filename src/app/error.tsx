"use client";

import { useEffect } from "react";
import Link from "next/link";
import { diagnose } from "@/lib/db-diagnosis";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("AYRA hata:", error);
  }, [error]);

  // Kurulum hatalarını (parola, adres, eksik şema) tanıyıp ne yapılacağını
  // söyler. Üretimde Next.js hata metnini gizler, bu yüzden yalnız
  // geliştirme sırasında görünür — son kullanıcıya sızmaz.
  const setup = process.env.NODE_ENV === "development" ? diagnose(error) : null;

  if (setup) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <p className="text-2xs font-semibold uppercase tracking-widest text-ink-400">Kurulum</p>
        <h1 className="mt-2 text-xl font-semibold text-ink-900">{setup.title}</h1>
        <p className="mt-2 text-sm text-ink-600">{setup.detail}</p>

        {setup.file && (
          <p className="mt-4 inline-flex items-center rounded-lg bg-ink-50 px-2.5 py-1 font-mono text-xs text-ink-700 ring-1 ring-line">
            {setup.file}
          </p>
        )}

        <ol className="mt-5 space-y-2.5">
          {setup.steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-ink-700">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-900 text-2xs font-semibold text-white">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>

        <p className="mt-6 rounded-xl bg-ink-50 px-4 py-3 text-xs text-ink-600 ring-1 ring-line">
          Terminalde <code className="font-mono text-ink-800">npm run db:check</code> yazarak
          bağlantıyı tek komutla sınayabilirsiniz.
        </p>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-11 items-center rounded-xl bg-ink-900 px-5 text-sm font-medium text-white"
          >
            Tekrar dene
          </button>
        </div>

        <p className="mt-8 text-2xs text-ink-400">
          Bu ekran yalnızca geliştirme sırasında görünür.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-semibold text-ink-900">Bir şeyler ters gitti</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-600">
        Bu sayfa yüklenirken beklenmedik bir hata oluştu. Tekrar deneyebilir veya haritaya dönebilirsiniz.
      </p>
      {error.digest && <p className="mt-2 font-mono text-2xs text-ink-400">Hata kodu: {error.digest}</p>}
      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-11 items-center rounded-xl bg-ink-900 px-5 text-sm font-medium text-white"
        >
          Tekrar dene
        </button>
        <Link href="/" className="inline-flex h-11 items-center rounded-xl bg-white px-5 text-sm font-medium text-ink-700 ring-1 ring-line">
          Haritaya dön
        </Link>
      </div>
    </div>
  );
}
