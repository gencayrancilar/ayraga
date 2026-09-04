"use client";

import Link from "next/link";
import { useActionState } from "react";
import { sifirlamaTalebi, type ParolaState } from "@/lib/actions/parola";
import { IconCheck } from "../icons";

export function SifirlamaTalebi() {
  const [durum, eylem, bekliyor] = useActionState<ParolaState, FormData>(
    sifirlamaTalebi, { ok: false },
  );

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-xl font-semibold text-ink-900">Parolamı unuttum</h1>
      <p className="mt-2 text-sm text-ink-600">
        Hesabınızın e-posta adresini yazın; parolanızı yenilemeniz için bir
        bağlantı gönderelim.
      </p>

      {durum.ok ? (
        <div className="mt-6 rounded-2xl border border-teal-200 bg-teal-50 p-4">
          <p className="flex items-start gap-2 text-sm text-teal-900">
            <IconCheck size={16} className="mt-0.5 shrink-0 text-teal-700" />
            <span>{durum.message}</span>
          </p>
        </div>
      ) : (
        <form action={eylem} className="mt-6 space-y-3">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink-800">
              E-posta
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              autoFocus
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
            disabled={bekliyor}
            className="h-11 w-full rounded-xl bg-ink-900 text-base font-medium text-white hover:bg-ink-800 disabled:opacity-60"
          >
            {bekliyor ? "Gönderiliyor…" : "Bağlantı gönder"}
          </button>
        </form>
      )}

      <p className="mt-6 text-sm text-ink-500">
        <Link href="/giris" className="underline underline-offset-2 hover:text-ink-900">
          Giriş ekranına dön
        </Link>
      </p>

      <p className="mt-4 text-xs leading-relaxed text-ink-400">
        Takma adla katıldıysanız hesabınızın e-postası yoktur; parola sıfırlama
        da işlemez. Bu durumda yeni bir hesap açmanız gerekir.
      </p>
    </div>
  );
}
