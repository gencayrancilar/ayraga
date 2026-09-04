"use server";

import { z } from "zod";
import { AuthError, issueToken, setSessionCookie } from "../auth/session";
import { sifirlamaIste, parolayiDegistir } from "../auth/parola";
import { clientIdentity, enforceRateLimit, RateLimitError } from "../rate-limit";
import { revalidatePath } from "next/cache";

export type ParolaState = { ok: boolean; error?: string; message?: string };

const Email = z.string().trim().toLowerCase().email("Geçerli bir e-posta girin.");
const Parola = z.string().min(8, "Parola en az 8 karakter olmalı.").max(200);

async function sinir() {
  try {
    await enforceRateLimit("auth", await clientIdentity());
  } catch (err) {
    if (err instanceof RateLimitError) throw new AuthError("RATE_LIMITED", err.message);
    throw err;
  }
}

const AYNI_CEVAP =
  "Bu adres kayıtlıysa sıfırlama bağlantısını gönderdik. Gelen kutunuza bakın; "
  + "birkaç dakika içinde ulaşmazsa gereksiz posta klasörünü de kontrol edin.";

/**
 * Sıfırlama bağlantısı ister.
 *
 * Adres kayıtlı olsun olmasın aynı cevabı döndürür — aksi hâlde bu form,
 * kimin AYRA'da hesabı olduğunu öğrenmeye yarayan bir araca dönerdi.
 */
export async function sifirlamaTalebi(_prev: ParolaState, formData: FormData): Promise<ParolaState> {
  const parsed = Email.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  try {
    await sinir();
    await sifirlamaIste(parsed.data);
    return { ok: true, message: AYNI_CEVAP };
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, error: err.message };
    console.error("parola sıfırlama talebi", err);
    // Sunucu hatasını da aynı cevapla örtmüyoruz: kullanıcı boşuna beklemesin.
    return { ok: false, error: "İstek alınamadı. Biraz sonra tekrar deneyin." };
  }
}

const YeniParolaSemasi = z
  .object({
    token: z.string().min(20, "Bağlantı geçersiz."),
    password: Parola,
    passwordRepeat: z.string(),
  })
  .refine((d) => d.password === d.passwordRepeat, {
    message: "Parolalar aynı değil.",
    path: ["passwordRepeat"],
  });

/** Yeni parolayı kaydeder ve kullanıcının oturumunu açar. */
export async function yeniParolaBelirle(_prev: ParolaState, formData: FormData): Promise<ParolaState> {
  const parsed = YeniParolaSemasi.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    passwordRepeat: formData.get("passwordRepeat"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  try {
    await sinir();
    const hesap = await parolayiDegistir(parsed.data.token, parsed.data.password);
    // Kişi e-postasına erişebildiğini kanıtladı; tekrar giriş ekranına
    // göndermek gereksiz bir engel olur.
    await setSessionCookie(await issueToken(hesap.id, hesap.email));
    revalidatePath("/", "layout");
    return { ok: true, message: "Parolanız değişti." };
  } catch (err) {
    if (err instanceof AuthError) return { ok: false, error: err.message };
    console.error("yeni parola", err);
    return { ok: false, error: "Parola değiştirilemedi." };
  }
}
