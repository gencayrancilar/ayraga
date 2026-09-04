"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { withRls, dbErrorMessage } from "../db";
import { getClaims, requireMuhtar, AuthError } from "../auth/session";

/**
 * Muhtar eylemleri.
 *
 * Buradaki her yazma, veritabanındaki RLS politikalarıyla ikinci kez
 * korunur: bu dosyadaki kontrol atlanabilse bile muhtar kendi mahallesi
 * dışına yazamaz. Durum değiştirme burada bilerek yoktur — muhtar ne
 * yaptığını anlatır, kaydın durumunu dernek belirler.
 */

export type MuhtarState = { ok: boolean; error?: string; message?: string };

function fail(err: unknown, fallback: string): MuhtarState {
  if (err instanceof AuthError) return { ok: false, error: err.message };
  const message = dbErrorMessage(err) ?? "";
  if (message.includes("row-level security")) {
    return { ok: false, error: "Bu işlem yalnızca kendi mahallenizde yapılabilir." };
  }
  if (message.includes("announcements_title_check") || message.includes("char_length")) {
    return { ok: false, error: "Başlık 6-140, metin 10-4000 karakter olmalı." };
  }
  console.error(fallback, err);
  return { ok: false, error: fallback };
}

/** FormData boş alanları null döndürür; zod'un optional'ı null'u kabul etmez. */
function tarih(v: string | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function metin(v: FormDataEntryValue | null): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

const DuyuruSemasi = z.object({
  neighborhoodId: z.string().uuid("Mahalle seçilmedi."),
  kind: z.enum(["duyuru", "kesinti", "calisma", "toplanti", "guncelleme"]),
  title: z.string().trim().min(6, "Başlık en az 6 karakter olmalı.").max(140, "Başlık en fazla 140 karakter."),
  body: z.string().trim().min(10, "Metin en az 10 karakter olmalı.").max(4000, "Metin en fazla 4000 karakter."),
  // datetime-local alanı "2026-09-01T09:00" biçiminde gelir; zod sürümleri
  // arasında bu biçimin kabulü değiştiği için tarihi kendimiz doğruluyoruz.
  startsAt: z.string().max(40).optional(),
  endsAt: z.string().max(40).optional(),
});

export async function duyuruYayinla(_prev: MuhtarState, formData: FormData): Promise<MuhtarState> {
  const parsed = DuyuruSemasi.safeParse({
    neighborhoodId: metin(formData.get("neighborhoodId")),
    kind: metin(formData.get("kind")) ?? "duyuru",
    title: metin(formData.get("title")),
    body: metin(formData.get("body")),
    startsAt: metin(formData.get("startsAt")),
    endsAt: metin(formData.get("endsAt")),
  });
  if (!parsed.success) {
    const sorun = parsed.error.issues[0];
    return { ok: false, error: sorun?.message ?? `Geçersiz alan: ${sorun?.path.join(".") ?? "?"}` };
  }
  const d = parsed.data;

  try {
    const { id, mahalleler } = await requireMuhtar();
    if (!mahalleler.some((m) => m.id === d.neighborhoodId)) {
      return { ok: false, error: "Bu mahalleye duyuru yazma yetkiniz yok." };
    }
    const claims = await getClaims();

    const [satir] = await withRls(claims, (tx) => tx`
      insert into public.announcements
        (neighborhood_id, author_id, kind, title, body, starts_at, ends_at)
      values
        (${d.neighborhoodId}, ${id}, ${d.kind}::public.announcement_kind,
         ${d.title}, ${d.body},
         ${tarih(d.startsAt)},
         ${tarih(d.endsAt)})
      returning id
    `);
    if (!satir) return { ok: false, error: "Duyuru kaydedilemedi." };

    const mahalle = mahalleler.find((m) => m.id === d.neighborhoodId);
    revalidatePath("/muhtar/duyurular");
    if (mahalle) revalidatePath(`/mahalle/${mahalle.slug}`);
    return { ok: true, message: "Duyuru yayımlandı." };
  } catch (err) {
    return fail(err, "Duyuru yayımlanamadı.");
  }
}

export async function duyuruKaldir(_prev: MuhtarState, formData: FormData): Promise<MuhtarState> {
  const id = String(formData.get("id") ?? "");
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Geçersiz istek." };

  try {
    const { id: kullanici } = await requireMuhtar();
    const claims = await getClaims();
    // Muhtar kendi duyurusunu siler; gizleme (moderasyon kaydı bırakan işlem)
    // derneğe aittir. Silme yalnızca kendi yazdığı ve henüz kaldırılmamış
    // duyurular için geçerlidir.
    await withRls(claims, (tx) => tx`
      delete from public.announcements
       where id = ${id} and author_id = ${kullanici} and not is_hidden
    `);
    revalidatePath("/muhtar/duyurular");
    return { ok: true, message: "Duyuru kaldırıldı." };
  } catch (err) {
    return fail(err, "Duyuru kaldırılamadı.");
  }
}

const YanitSemasi = z.object({
  reportId: z.string().uuid("Geçersiz bildirim."),
  body: z.string().trim().min(10, "Yanıt en az 10 karakter olmalı.").max(2000, "Yanıt en fazla 2000 karakter."),
  referenceNo: z.string().trim().max(60, "Başvuru no en fazla 60 karakter.").optional(),
});

/** Bir bildirime resmî yanıt. Kanıt zincirine işlenir, sonradan düzenlenemez. */
export async function resmiYanitYaz(_prev: MuhtarState, formData: FormData): Promise<MuhtarState> {
  const parsed = YanitSemasi.safeParse({
    reportId: metin(formData.get("reportId")),
    body: metin(formData.get("body")),
    referenceNo: metin(formData.get("referenceNo")),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Geçersiz istek." };
  }
  const d = parsed.data;

  try {
    const { id } = await requireMuhtar();
    const claims = await getClaims();

    const [satir] = await withRls(claims, (tx) => tx`
      insert into public.report_official_replies (report_id, author_id, body, reference_no)
      values (${d.reportId}, ${id}, ${d.body}, ${d.referenceNo?.trim() || null})
      returning id, (select slug from public.reports where id = ${d.reportId}) as slug
    `);
    if (!satir) return { ok: false, error: "Yanıt kaydedilemedi." };

    revalidatePath(`/sorun/${satir.slug}`);
    revalidatePath("/muhtar/bildirimler");
    return { ok: true, message: "Yanıtınız yayımlandı ve kanıt zincirine işlendi." };
  } catch (err) {
    return fail(err, "Yanıt yazılamadı.");
  }
}
