"use client";

import { useActionState, useState } from "react";
import { cx } from "@/lib/utils";
import { logout, upgradeAccount, type AuthState } from "@/lib/actions/auth";
import { Button } from "../ui/Button";
import { Field, Input, ErrorNote } from "../ui/Field";
import { IconCheck, IconShieldCheck } from "../icons";

/**
 * Sekmeler. İçerikler sunucuda hazırlanıp React düğümü olarak geçilir;
 * istemci bileşenine fonksiyon aktarılmaz.
 */
export function ProfileTabs({
  tabs,
}: {
  tabs: Array<{ key: string; label: string; count: number; content: React.ReactNode }>;
}) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  const current = tabs.find((t) => t.key === active) ?? tabs[0];
  return (
    <>
      <div className="scrollbar-none -mx-4 mb-3 flex gap-2 overflow-x-auto px-4" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active === t.key}
            onClick={() => setActive(t.key)}
            className={cx(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-medium transition-colors",
              active === t.key ? "bg-ink-900 text-white" : "bg-white text-ink-600 ring-1 ring-line hover:bg-surface-muted",
            )}
          >
            {t.label}
            <span className={active === t.key ? "text-white/70" : "text-ink-400"}>{t.count}</span>
          </button>
        ))}
      </div>
      <div role="tabpanel">{current?.content}</div>
    </>
  );
}

/** Takma adlı hesabı e-postayla kalıcı hâle getirme. */
export function UpgradePanel() {
  const [state, action, pending] = useActionState<AuthState, FormData>(upgradeAccount, { ok: false });
  const [open, setOpen] = useState(false);

  if (state.ok) {
    return (
      <p className="flex items-center gap-2 rounded-2xl bg-teal-50 p-3.5 text-sm text-teal-800 ring-1 ring-inset ring-teal-200">
        <IconCheck size={16} /> Hesabınız artık e-postanıza bağlı.
      </p>
    );
  }

  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-line">
      <div className="flex items-start gap-3">
        <IconShieldCheck size={20} className="mt-0.5 shrink-0 text-teal-600" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-ink-900">Hesabınızı kalıcı hâle getirin</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-600">
            Şu anda takma adla katıldınız. Bir e-posta eklerseniz başka bir cihazdan da
            giriş yapabilir, bildirim geçmişinizi kaybetmezsiniz. Görünen adınız değişmez.
          </p>
          {!open && (
            <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => setOpen(true)}>
              E-posta ekle
            </Button>
          )}
        </div>
      </div>

      {open && (
        <form action={action} className="mt-4 space-y-3 border-t border-line pt-4">
          <Field label="E-posta" required htmlFor="up-email" error={state.field === "email" ? state.error : undefined}>
            <Input id="up-email" name="email" type="email" required autoComplete="email" />
          </Field>
          <Field label="Parola" required htmlFor="up-password" hint="En az 8 karakter." error={state.field === "password" ? state.error : undefined}>
            <Input id="up-password" name="password" type="password" required minLength={8} autoComplete="new-password" />
          </Field>
          {state.error && !state.field && <ErrorNote>{state.error}</ErrorNote>}
          <div className="flex gap-2">
            <Button type="button" variant="outline" block onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button type="submit" block loading={pending}>Kaydet</Button>
          </div>
        </form>
      )}
    </section>
  );
}

export function LogoutButton() {
  return (
    <form action={logout}>
      <Button type="submit" variant="outline" block>Çıkış yap</Button>
    </form>
  );
}
