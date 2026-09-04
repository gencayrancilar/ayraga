"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withSystem, dbErrorMessage } from "../db";
import { requireUser, requireModerator, AuthError } from "../auth/session";

/**
 * Muhtar atamasının yönetimi.
 *
 * Muhtar için ayrı hesap açmıyoruz: kişi herkes gibi ayraga.com'dan kendi
 * hesabını oluşturur, moderasyon o hesabı mahallenin muhtarı olarak
 * işaretler. Yetki hesabın kendisinde değil atamada durur; atama kalkınca
 * yetki de kalkar, hesap ve geçmişi yerinde kalır.
 */

export type YonetimState = { ok: boolean; error?: string; message?: string };

const AtamaSemasi = z.object({
  profileId: z.string().uuid("Kullanıcı seçilmedi."),
  neighborhoodId: z.string().uuid("Mahalle seçilmedi."),
  title: z.string().trim().max(60).optional(),
});

function metin(v: FormDataEntryValue | null): string | undefined {
  if (v == null) return undefined;
  const t = String(v).trim();
  return t === "" ? undefined : t;
}

function fail(err: unknown, fallback: string): YonetimState {
  if (err instanceof AuthError) return { ok: false, error: err.message };
  const message = dbErrorMessage(err) ?? String((err as Error)?.message ?? "");
  if (message.includes("row-level security")) return { ok: false, error: "Bu işlem için yetkiniz yok." };
  console.error(fallback, err);
  return { ok: false, error: fallback };
}

/** Var olan bir hesabı mahallenin muhtarı olarak işaretler. */
export async function muhtarAta(_prev: YonetimState, formData: FormData): Promise<YonetimState> {
  const parsed = AtamaSemasi.safeParse({
    profileId: metin(formData.get("profileId")),
    neighborhoodId: metin(formData.get("neighborhoodId")),
    title: metin(formData.get("title")),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Geçersiz istek." };
  }
  const d = parsed.data;

  try {
    await requireModerator();

    const sonuc = await withSystem(async (tx) => {
      const [hesap] = await tx`
        select p.id, p.display_name, p.role::text as role, p.is_anonymous, u.email
          from public.profiles p
          left join auth.users u on u.id = p.id
         where p.id = ${d.profileId}
      `;
      if (!hesap) return { hata: "Hesap bulunamadı." };
      if (hesap.is_anonymous || !hesap.email) {
        // Takma adlı hesap yalnızca tarayıcı çerezinde yaşar; kişi başka bir
        // cihazdan giremez. Muhtarlık kalıcı bir görev, kalıcı hesap ister.
        return {
          hata: `${hesap.display_name} takma adlı bir hesap. Muhtar atamadan önce `
              + "kendisinden profil ekranından e-posta ve parola eklemesini isteyin.",
        };
      }

      await tx`
        insert into public.neighborhood_officials (neighborhood_id, profile_id, title, term_start)
        values (${d.neighborhoodId}, ${d.profileId}, ${d.title ?? "Mahalle Muhtarı"}, current_date)
        on conflict (neighborhood_id, profile_id)
          do update set is_active = true, term_end = null, title = excluded.title
      `;
      // Rol yalnızca etiket içindir; yetki atamadan gelir. Moderatör ya da
      // yöneticinin rolünü muhtara düşürmüyoruz.
      await tx`update public.profiles set role = 'muhtar' where id = ${d.profileId} and role = 'citizen'`;

      const [m] = await tx`select name from public.neighborhoods where id = ${d.neighborhoodId}`;
      return { ad: hesap.display_name as string, mahalle: (m?.name as string) ?? "" };
    });

    if ("hata" in sonuc && sonuc.hata) return { ok: false, error: sonuc.hata };

    revalidatePath("/yonetim/muhtarlar");
    revalidatePath("/yonetim/kullanicilar");
    return { ok: true, message: `${sonuc.ad}, ${sonuc.mahalle} mahallesinin muhtarı olarak işaretlendi.` };
  } catch (err) {
    return fail(err, "Atama yapılamadı.");
  }
}

/** Görevi biten muhtarın yetkisini kaldırır. Hesap ve geçmişi silinmez. */
export async function muhtarGoreviBitir(_prev: YonetimState, formData: FormData): Promise<YonetimState> {
  const id = metin(formData.get("id"));
  if (!id || !z.string().uuid().safeParse(id).success) return { ok: false, error: "Geçersiz istek." };

  try {
    await requireModerator();
    await withSystem(async (tx) => {
      const [kayit] = await tx`
        update public.neighborhood_officials
           set is_active = false, term_end = current_date
         where id = ${id}
        returning profile_id
      `;
      if (kayit) {
        // Başka aktif ataması kalmadıysa rol etiketini geri al.
        await tx`
          update public.profiles set role = 'citizen'
           where id = ${kayit.profile_id} and role = 'muhtar'
             and not exists (select 1 from public.neighborhood_officials o
                              where o.profile_id = ${kayit.profile_id} and o.is_active)
        `;
      }
    });
    revalidatePath("/yonetim/muhtarlar");
    revalidatePath("/yonetim/kullanicilar");
    return { ok: true, message: "Muhtarlık görevi sonlandırıldı; hesap ve geçmişi duruyor." };
  } catch (err) {
    return fail(err, "İşlem tamamlanamadı.");
  }
}

const GizleSemasi = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().min(5, "Gerekçe en az 5 karakter olmalı.").max(300),
});

/** Kural dışı bir duyuruyu yayından kaldırır. Gerekçe muhtara görünür. */
export async function duyuruGizle(_prev: YonetimState, formData: FormData): Promise<YonetimState> {
  const parsed = GizleSemasi.safeParse({ id: formData.get("id"), reason: formData.get("reason") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Geçersiz istek." };
  }

  try {
    const user = await requireUser();
    if (user.role !== "admin" && user.role !== "moderator") {
      throw new AuthError("FORBIDDEN", "Yetkiniz yok.");
    }
    await withSystem((tx) => tx`
      update public.announcements
         set is_hidden = true, hidden_reason = ${parsed.data.reason},
             hidden_at = now(), hidden_by = ${user.id}
       where id = ${parsed.data.id}
    `);
    revalidatePath("/yonetim/muhtarlar");
    return { ok: true, message: "Duyuru yayından kaldırıldı; gerekçe muhtara görünecek." };
  } catch (err) {
    return fail(err, "Duyuru kaldırılamadı.");
  }
}
