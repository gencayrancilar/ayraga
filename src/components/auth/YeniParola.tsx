"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { yeniParolaBelirle, type ParolaState } from "@/lib/actions/parola";

export function YeniParola({ jeton, email }: { jeton: string; email: string }) {
  const [durum, eylem, bekliyor] = useActionState<ParolaState, FormData>(
    yeniParolaBelirle, { ok: false },
  );
  const router = useRouter();

  useEffect(() => {
    if (durum.ok) {
      // Parola değişince oturum açıldı; kişiyi kendi sayfasına bırakalım.
      router.replace("/profil");
    }
  }, [durum.ok, router]);

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-xl font-semibold text-ink-900">Yeni parola belirleyin</h1>
      <p className="mt-2 text-sm text-ink-600">
        <span className="text-ink-800">{email}</span> hesabı için yeni bir parola
        seçin. Kaydettiğinizde oturumunuz açılacak.
      </p>

      <form action={eylem} className="mt-6 space-y-3">
        <input type="hidden" name="token" value={jeton} />

        <div>
          <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-ink-800">
            Yeni parola
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            autoFocus
            className="h-11 w-full rounded-xl border-0 bg-surface-muted px-3 text-base ring-1 ring-inset ring-line focus:ring-2 focus:ring-teal-600"
          />
          <p className="mt-1 text-xs text-ink-400">En az 8 karakter.</p>
        </div>

        <div>
          <label htmlFor="passwordRepeat" className="mb-1.5 block text-sm font-medium text-ink-800">
            Yeni parola (tekrar)
          </label>
          <input
            id="passwordRepeat"
            name="passwordRepeat"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            className="h-11 w-full rounded-xl border-0 bg-surface-muted px-3 text-base ring-1 ring-inset ring-line focus:ring-2 focus:ring-teal-600"
          />
        </div>

        {durum.error && (
          <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
            {durum.error}
          </p>
        )}

        <button
          type="submit"
          disabled={bekliyor || durum.ok}
          className="h-11 w-full rounded-xl bg-ink-900 text-base font-medium text-white hover:bg-ink-800 disabled:opacity-60"
        >
          {bekliyor ? "Kaydediliyor…" : durum.ok ? "Yönlendiriliyorsunuz…" : "Parolayı kaydet"}
        </button>
      </form>
    </div>
  );
}
