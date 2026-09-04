"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withSystem, dbErrorMessage } from "../db";
import { requireModerator, AuthError } from "../auth/session";

/**
 * Kuruma gönderim onayı — yazma tarafı.
 *
 * Onay olmadan hiçbir bildirim kuruma gitmez. Kararlar (report_id, authority_id)
 * çiftinde saklanır ve silinmez: "bunu neden göndermedik" sorusunun cevabı
 * kayıtta durur.
 */

export type OnayState = { ok: boolean; error?: string; message?: string };

const KararSemasi = z.object({
  authorityId: z.string().uuid("Kurum seçilmedi."),
  reportIds: z.array(z.string().uuid()).min(1, "Hiçbir bildirim seçilmedi."),
  decision: z.enum(["approved", "excluded"]),
  note: z.string().trim().max(300).optional(),
});

function hata(err: unknown, yedek: string): OnayState {
  if (err instanceof AuthError) return { ok: false, error: err.message };
  const m = dbErrorMessage(err) ?? String((err as Error)?.message ?? "");
  if (m.includes("row-level security")) return { ok: false, error: "Bu işlem için yetkiniz yok." };
  console.error(yedek, err);
  return { ok: false, error: yedek };
}

function tazele(authorityId?: string) {
  revalidatePath("/yonetim/gonderim-onayi");
  revalidatePath("/yonetim/gonderimler");
  if (authorityId) revalidatePath(`/yonetim/gonderim-onayi?kurum=${authorityId}`);
}

/** Seçilen bildirimleri o kurum için onaylar ya da listeden çıkarır. */
export async function kararVer(_prev: OnayState, formData: FormData): Promise<OnayState> {
  const parsed = KararSemasi.safeParse({
    authorityId: formData.get("authorityId"),
    reportIds: formData.getAll("reportIds").map(String),
    decision: formData.get("decision"),
    note: (formData.get("note") as string | null)?.trim() || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Geçersiz istek." };
  }
  const d = parsed.data;

  if (d.decision === "excluded" && !d.note) {
    // Gerekçesiz hariç tutma, altı ay sonra kimsenin açıklayamayacağı bir boşluk olur.
    return { ok: false, error: "Listeden çıkarırken kısa bir gerekçe yazın." };
  }

  try {
    const user = await requireModerator();

    await withSystem(async (tx) => {
      for (const rid of d.reportIds) {
        await tx`
          insert into public.dispatch_decisions
            (report_id, authority_id, decision, note, decided_by, decided_at)
          values (${rid}, ${d.authorityId}, ${d.decision}, ${d.note ?? null}, ${user.id}, now())
          on conflict (report_id, authority_id) do update
            set decision = excluded.decision, note = excluded.note,
                decided_by = excluded.decided_by, decided_at = now()
        `;
      }
    });

    tazele(d.authorityId);
    const n = d.reportIds.length;
    return {
      ok: true,
      message: d.decision === "approved"
        ? `${n} bildirim onaylandı. İlk gönderimde bu kuruma iletilecek.`
        : `${n} bildirim listeden çıkarıldı; bu kuruma önerilmeyecek.`,
    };
  } catch (err) {
    return hata(err, "Karar kaydedilemedi.");
  }
}

const GeriAlSemasi = z.object({
  authorityId: z.string().uuid(),
  reportId: z.string().uuid(),
});

/** Verilmiş bir kararı kaldırır; bildirim yeniden "karar bekliyor" olur. */
export async function karariGeriAl(_prev: OnayState, formData: FormData): Promise<OnayState> {
  const parsed = GeriAlSemasi.safeParse({
    authorityId: formData.get("authorityId"),
    reportId: formData.get("reportId"),
  });
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  try {
    await requireModerator();
    await withSystem((tx) => tx`
      delete from public.dispatch_decisions
       where report_id = ${parsed.data.reportId} and authority_id = ${parsed.data.authorityId}
    `);
    tazele(parsed.data.authorityId);
    return { ok: true, message: "Karar kaldırıldı; bildirim yeniden karar bekliyor." };
  } catch (err) {
    return hata(err, "Karar kaldırılamadı.");
  }
}

/**
 * Onaylanmış her şeyi beklemeden gönderir.
 *
 * Pazartesi cron'u da aynı işi yapar; bu düğme "hazır, beklemesin" içindir.
 * Geri alınamaz: kurumlara resmî yazı çıkar.
 */
export async function simdiGonder(_prev: OnayState, _formData: FormData): Promise<OnayState> {
  try {
    await requireModerator();
    const { haftalikKurumGonderimi } = await import("../kurum-bildirim");
    const sonuc = await haftalikKurumGonderimi();

    tazele();
    if (sonuc.meshgul) return { ok: false, error: sonuc.ayrinti[0] ?? "Başka bir gönderim sürüyor." };
    if (sonuc.gonderildi === 0 && sonuc.hata === 0) {
      return { ok: true, message: "Gönderilecek onaylı bildirim yoktu." };
    }
    return {
      ok: true,
      message: `${sonuc.gonderildi} kuruma gönderildi`
        + (sonuc.hata ? `, ${sonuc.hata} kurumda hata` : "")
        + ". " + sonuc.ayrinti.join(" · "),
    };
  } catch (err) {
    return hata(err, "Gönderim yapılamadı.");
  }
}

const TasimaSemasi = z.object({
  reportIds: z.array(z.string().uuid()).min(1, "Hiçbir bildirim seçilmedi."),
  authorityId: z.string().uuid("Kurum seçilmedi."),
  note: z.string().trim().max(300).optional(),
});

/**
 * Seçilen bildirimleri başka bir kuruma taşır.
 *
 * Kategoriden hesaplanan kurumu geçersiz kılar. Tek bir bildirim yanlış
 * kategoriye düşmüşse doğru yer burasıdır; ama aynı kategoriden sürekli
 * yanlış yönlenen bildirim geliyorsa asıl düzeltilecek yer Yönlendirme
 * ekranıdır — orada bir kez düzeltilince o kategorinin tamamı düzelir.
 */
export async function kurumaTasi(_prev: OnayState, formData: FormData): Promise<OnayState> {
  const parsed = TasimaSemasi.safeParse({
    reportIds: formData.getAll("reportIds").map(String),
    authorityId: formData.get("hedefKurum"),
    note: (formData.get("note") as string | null)?.trim() || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Geçersiz istek." };
  }
  const d = parsed.data;

  try {
    const user = await requireModerator();
    const ad = await withSystem(async (tx) => {
      for (const rid of d.reportIds) {
        await tx`
          insert into public.report_authority_overrides
            (report_id, authority_id, note, decided_by, decided_at)
          values (${rid}, ${d.authorityId}, ${d.note ?? null}, ${user.id}, now())
          on conflict (report_id) do update
            set authority_id = excluded.authority_id, note = excluded.note,
                decided_by = excluded.decided_by, decided_at = now()
        `;
        // Eski kuruma verilmiş onay, artık o kuruma gitmeyecek bildirim için
        // geçersizdir; kalırsa listede hayalet kayıt olur.
        await tx`
          delete from public.dispatch_decisions
           where report_id = ${rid} and authority_id <> ${d.authorityId}
        `;
      }
      const [k] = await tx`select name from public.authorities where id = ${d.authorityId}`;
      return (k?.name as string) ?? "seçilen kurum";
    });

    tazele(d.authorityId);
    return {
      ok: true,
      message: `${d.reportIds.length} bildirim ${ad} kurumuna taşındı. Onayı yeni kurumun listesinden verin.`,
    };
  } catch (err) {
    return hata(err, "Bildirim taşınamadı.");
  }
}

/** Elle atamayı kaldırır; bildirim yeniden kategorisinin kurumuna döner. */
export async function atamayiKaldir(_prev: OnayState, formData: FormData): Promise<OnayState> {
  const id = formData.get("reportId");
  if (typeof id !== "string" || !z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Geçersiz istek." };
  }
  try {
    await requireModerator();
    await withSystem((tx) => tx`
      delete from public.report_authority_overrides where report_id = ${id}
    `);
    tazele();
    return { ok: true, message: "Elle atama kaldırıldı; bildirim kategorisinin kurumuna döndü." };
  } catch (err) {
    return hata(err, "Atama kaldırılamadı.");
  }
}

const YonlendirmeSemasi = z.object({
  categoryId: z.string().uuid("Kategori seçilmedi."),
  authorityId: z.string().uuid("Kurum seçilmedi."),
});

/**
 * Kategorinin birincil kurumunu değiştirir.
 *
 * Kalıcı düzeltme budur: bir kategori bir kez doğru kuruma bağlandığında o
 * kategorinin bütün gelecek bildirimleri doğru yere gider. Daha önce elle
 * taşınmış bildirimler kendi atamalarını korur.
 */
export async function kategoriKurumuAta(_prev: OnayState, formData: FormData): Promise<OnayState> {
  const parsed = YonlendirmeSemasi.safeParse({
    categoryId: formData.get("categoryId"),
    authorityId: formData.get("authorityId"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Geçersiz istek." };
  }
  try {
    await requireModerator();
    const sonuc = await withSystem(async (tx) => {
      await tx`select public.kategori_kurumu_ata(${parsed.data.categoryId}, ${parsed.data.authorityId})`;
      const [x] = await tx`
        select c.name as kategori, a.name as kurum
          from public.report_categories c, public.authorities a
         where c.id = ${parsed.data.categoryId} and a.id = ${parsed.data.authorityId}
      `;
      return x as { kategori: string; kurum: string } | undefined;
    });
    revalidatePath("/yonetim/yonlendirme");
    revalidatePath("/yonetim/gonderim-onayi");
    return {
      ok: true,
      message: sonuc
        ? `${sonuc.kategori} artık ${sonuc.kurum} kurumuna yönlendiriliyor.`
        : "Yönlendirme güncellendi.",
    };
  } catch (err) {
    return hata(err, "Yönlendirme değiştirilemedi.");
  }
}
