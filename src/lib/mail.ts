import "server-only";

/**
 * E-posta gönderimi.
 *
 * Resend'in HTTP API'si doğrudan çağrılır; ek bir paket kurmuyoruz. Gönderim
 * hiçbir zaman çağıran akışı düşürmez: anahtar tanımlı değilse ya da sağlayıcı
 * hata verirse fonksiyon `ok:false` döner, çağıran taraf bunu kayda geçirir.
 * Bir bildirimin kaydedilmesi, e-postanın gitmesine bağlı olamaz.
 */

const API = "https://api.resend.com/emails";

export type MailSonuc = { ok: true; id: string } | { ok: false; hata: string };

export function mailAcik(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export function gonderenAdresi(): string {
  return process.env.MAIL_FROM ?? "AYRA <info@ayraga.com>";
}

export async function mailGonder(opts: {
  to: string[];
  subject: string;
  text: string;
  replyTo?: string;
}): Promise<MailSonuc> {
  const anahtar = process.env.RESEND_API_KEY;
  if (!anahtar) {
    return { ok: false, hata: "RESEND_API_KEY tanımlı değil" };
  }
  const alicilar = opts.to.map((a) => a.trim()).filter(Boolean);
  if (!alicilar.length) return { ok: false, hata: "Alıcı adresi yok" };

  try {
    const yanit = await fetch(API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${anahtar}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: gonderenAdresi(),
        to: alicilar,
        subject: opts.subject,
        text: opts.text,
        reply_to: opts.replyTo ?? process.env.MAIL_REPLY_TO ?? "info@ayraga.com",
      }),
      // Gönderim uzarsa çağıran akışı bekletmeyelim.
      signal: AbortSignal.timeout(15_000),
    });

    if (!yanit.ok) {
      const govde = await yanit.text().catch(() => "");
      return { ok: false, hata: `Resend ${yanit.status}: ${govde.slice(0, 300)}` };
    }
    const veri = (await yanit.json()) as { id?: string };
    return { ok: true, id: veri.id ?? "" };
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    return { ok: false, hata: m.slice(0, 300) };
  }
}
