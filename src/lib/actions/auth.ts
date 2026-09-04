"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuthError, clearSessionCookie, getClaims, issueToken, setSessionCookie } from "../auth/session";
import {
  createAnonymousAccount, registerAccount, signIn, upgradeAnonymousAccount,
} from "../auth/accounts";
import { clientIdentity, enforceRateLimit, RateLimitError } from "../rate-limit";

export type AuthState = { ok: boolean; error?: string; field?: string };

const Email = z.string().trim().toLowerCase().email("Geçerli bir e-posta girin.");
const Password = z.string().min(8, "Parola en az 8 karakter olmalı.").max(200);
const DisplayName = z.string().trim().min(2, "En az 2 karakter.").max(40, "En fazla 40 karakter.");

async function limit() {
  try {
    await enforceRateLimit("auth", await clientIdentity());
  } catch (err) {
    if (err instanceof RateLimitError) throw new AuthError("RATE_LIMITED", err.message);
    throw err;
  }
}

/** Takma adla katılım — e-posta istemeden bildirim yapabilmek için. */
export async function continueAnonymously(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const raw = String(formData.get("displayName") ?? "").trim();
  if (raw) {
    const parsed = DisplayName.safeParse(raw);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message, field: "displayName" };
  }
  try {
    await limit();
    const account = await createAnonymousAccount(raw || undefined);
    await setSessionCookie(await issueToken(account.id, null));
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof AuthError ? err.message : "Hesap oluşturulamadı." };
  }
}

export async function register(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z
    .object({ email: Email, password: Password, displayName: DisplayName.optional().or(z.literal("")) })
    .safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
      displayName: formData.get("displayName"),
    });
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { ok: false, error: i.message, field: String(i.path[0]) };
  }
  try {
    await limit();
    const account = await registerAccount(parsed.data.email, parsed.data.password, parsed.data.displayName || undefined);
    await setSessionCookie(await issueToken(account.id, account.email));
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof AuthError ? err.message : "Kayıt tamamlanamadı." };
  }
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z.object({ email: Email, password: z.string().min(1, "Parola girin.") }).safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { ok: false, error: i.message, field: String(i.path[0]) };
  }
  try {
    await limit();
    const account = await signIn(parsed.data.email, parsed.data.password);
    await setSessionCookie(await issueToken(account.id, account.email));
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof AuthError ? err.message : "Giriş yapılamadı." };
  }
}

/** Takma adlı hesabı e-posta ile kalıcı hâle getirir; bildirim geçmişi korunur. */
export async function upgradeAccount(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const claims = await getClaims();
  if (!claims) return { ok: false, error: "Oturum bulunamadı." };

  const parsed = z.object({ email: Email, password: Password }).safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { ok: false, error: i.message, field: String(i.path[0]) };
  }
  try {
    await limit();
    const account = await upgradeAnonymousAccount(claims.sub, parsed.data.email, parsed.data.password);
    await setSessionCookie(await issueToken(account.id, account.email));
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof AuthError ? err.message : "Hesap güncellenemedi." };
  }
}

export async function logout() {
  await clearSessionCookie();
  revalidatePath("/", "layout");
}
