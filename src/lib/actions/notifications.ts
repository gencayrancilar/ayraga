"use server";

import { revalidatePath } from "next/cache";
import { withRls } from "../db";
import { getClaims } from "../auth/session";

/**
 * Bildirimleri okundu olarak işaretler.
 *
 * Sunucu bileşeninin render'ı sırasında değil, sayfa görüntülendikten sonra
 * istemciden çağrılır: render sırasında yazmak hem çift render'da iki kez
 * çalışır hem de sekme rozetinin güncellenmesi için gereken yeniden
 * doğrulamayı tetikleyemez.
 */
export async function markNotificationsRead(): Promise<{ ok: boolean }> {
  const claims = await getClaims();
  if (!claims) return { ok: false };

  const updated = await withRls(claims, (tx) => tx`
    update public.notifications set read_at = now()
     where user_id = ${claims.sub} and read_at is null
    returning id
  `);

  if (updated.length > 0) revalidatePath("/", "layout");
  return { ok: true };
}
