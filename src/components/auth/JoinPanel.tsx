"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { continueAnonymously, login, register, type AuthState } from "@/lib/actions/auth";
import { Button } from "../ui/Button";
import { Field, Input, ErrorNote } from "../ui/Field";
import { IconUser, IconShieldCheck } from "../icons";
import { cx } from "@/lib/utils";

type Mode = "quick" | "login" | "register";

/**
 * Katılım paneli.
 *
 * Kamusal bir sorunu bildirmek için kimlik doğrulaması bir engel olmamalı;
 * bu yüzden takma adla katılım birinci seçenektir. E-posta yalnızca hesabı
 * cihazlar arasında taşımak isteyenler içindir.
 */
export function JoinPanel({
  title = "Devam etmek için katılın",
  description = "Bildirim yapmak ve desteklemek için bir kimlik yeterli. E-posta zorunlu değil.",
  compact = false,
}: {
  title?: string;
  description?: string;
  compact?: boolean;
}) {
  const [mode, setMode] = useState<Mode>("quick");

  const [quickState, quickAction, quickPending] = useActionState<AuthState, FormData>(continueAnonymously, { ok: false });
  const [loginState, loginAction, loginPending] = useActionState<AuthState, FormData>(login, { ok: false });
  const [regState, regAction, regPending] = useActionState<AuthState, FormData>(register, { ok: false });

  // Giriş başarılı olduğunda sayfa kendiliğinden değişmiyordu: eylem çerezi
  // yazıyor ama istemci aynı formda kalıyordu. refresh(), sunucu bileşenini
  // yeniden çalıştırır; /giris oturum açmış kişiyi rolüne göre yönlendirir
  // (muhtar → /muhtar, diğerleri → /profil).
  const router = useRouter();
  const girisOldu = quickState.ok || loginState.ok || regState.ok;
  useEffect(() => {
    if (girisOldu) router.refresh();
  }, [girisOldu, router]);

  return (
    <div className={cx("mx-auto w-full max-w-md", !compact && "px-4 py-8")}>
      <div className="rounded-2xl bg-white p-5 ring-1 ring-line shadow-card">
        <h1 className="text-xl font-semibold text-ink-900">{title}</h1>
        <p className="mt-1 text-sm text-ink-600">{description}</p>

        <div className="mt-5 flex rounded-xl bg-surface-sunken p-1" role="tablist" aria-label="Katılım yöntemi">
          <Tab active={mode === "quick"} onClick={() => setMode("quick")}>Takma adla</Tab>
          <Tab active={mode === "login"} onClick={() => setMode("login")}>Giriş</Tab>
          <Tab active={mode === "register"} onClick={() => setMode("register")}>Kayıt</Tab>
        </div>

        {mode === "quick" && (
          <form action={quickAction} className="mt-5 space-y-4">
            <Field
              label="Görünen ad"
              htmlFor="join-name"
              hint="Bildirimlerinizde bu ad görünür. Gerçek adınızı yazmak zorunda değilsiniz."
              error={quickState.field === "displayName" ? quickState.error : undefined}
            >
              <Input id="join-name" name="displayName" placeholder="Örn. Mahalle sakini" maxLength={40} autoComplete="nickname" />
            </Field>
            {quickState.error && !quickState.field && <ErrorNote>{quickState.error}</ErrorNote>}
            <Button type="submit" size="lg" block loading={quickPending}>
              <IconUser size={18} /> Takma adla devam et
            </Button>
            <p className="flex items-start gap-2 text-2xs leading-relaxed text-ink-500">
              <IconShieldCheck size={14} className="mt-0.5 shrink-0 text-teal-600" />
              E-posta veya telefon istenmez. Hesabınızı daha sonra profil ekranından
              e-postayla kalıcı hâle getirebilirsiniz.
            </p>
          </form>
        )}

        {mode === "login" && (
          <form action={loginAction} className="mt-5 space-y-4">
            <Field label="E-posta" required htmlFor="login-email" error={loginState.field === "email" ? loginState.error : undefined}>
              <Input id="login-email" name="email" type="email" autoComplete="email" required placeholder="ornek@eposta.com" />
            </Field>
            <Field label="Parola" required htmlFor="login-password" error={loginState.field === "password" ? loginState.error : undefined}>
              <Input id="login-password" name="password" type="password" autoComplete="current-password" required />
            </Field>
            {loginState.error && !loginState.field && <ErrorNote>{loginState.error}</ErrorNote>}
            <Button type="submit" size="lg" block loading={loginPending}>Giriş yap</Button>
            <p className="text-center text-sm text-ink-500">
              <Link href="/parola-sifirla" className="underline underline-offset-2 hover:text-ink-900">
                Parolamı unuttum
              </Link>
            </p>
          </form>
        )}

        {mode === "register" && (
          <form action={regAction} className="mt-5 space-y-4">
            <Field label="Görünen ad" htmlFor="reg-name" error={regState.field === "displayName" ? regState.error : undefined}>
              <Input id="reg-name" name="displayName" maxLength={40} placeholder="Örn. Mahalle sakini" autoComplete="nickname" />
            </Field>
            <Field label="E-posta" required htmlFor="reg-email" error={regState.field === "email" ? regState.error : undefined}>
              <Input id="reg-email" name="email" type="email" autoComplete="email" required />
            </Field>
            <Field label="Parola" required htmlFor="reg-password" hint="En az 8 karakter." error={regState.field === "password" ? regState.error : undefined}>
              <Input id="reg-password" name="password" type="password" autoComplete="new-password" required minLength={8} />
            </Field>
            {regState.error && !regState.field && <ErrorNote>{regState.error}</ErrorNote>}
            <Button type="submit" size="lg" block loading={regPending}>Hesap oluştur</Button>
          </form>
        )}

        <p className="mt-4 text-2xs leading-relaxed text-ink-500">
          Devam ederek <Link href="/kurallar" className="underline underline-offset-2 hover:text-ink-700">topluluk kurallarını</Link> kabul etmiş olursunuz.
        </p>
      </div>
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cx(
        "h-9 flex-1 rounded-lg text-xs font-medium transition-colors",
        active ? "bg-white text-ink-900 shadow-card" : "text-ink-500 hover:text-ink-700",
      )}
    >
      {children}
    </button>
  );
}
