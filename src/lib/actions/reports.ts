"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { withRls, dbErrorMessage } from "../db";
import { getClaims, requireUser, AuthError } from "../auth/session";
import { clientIdentity, enforceRateLimit, RateLimitError } from "../rate-limit";
import { prepareImage, storeImage, removeStored, UploadError, MAX_UPLOAD_BYTES } from "../storage";

export type ActionState = { ok: boolean; error?: string; field?: string; slug?: string };

const CreateSchema = z.object({
  title: z.string().trim().min(8, "Başlık en az 8 karakter olmalı.").max(120, "Başlık en fazla 120 karakter olabilir."),
  description: z.string().trim().max(2000, "Açıklama en fazla 2000 karakter olabilir.").optional().or(z.literal("")),
  categoryId: z.string().uuid("Kategori seçilmedi."),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  address: z.string().trim().max(240).optional().or(z.literal("")),
});

/**
 * Sorun bildirimi oluşturur.
 *
 * Sıra önemlidir: görsel önce bellekte işlenir (EXIF düşer, boyut küçülür),
 * ardından veritabanı kaydı yapılır, en son dosya diske yazılır. Böylece
 * doğrulama hatası durumunda ortada yetim dosya kalmaz.
 */
export async function createReport(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  try {
    user = await requireUser();
  } catch (err) {
    return { ok: false, error: err instanceof AuthError ? err.message : "Giriş gerekli." };
  }

  const parsed = CreateSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    categoryId: formData.get("categoryId"),
    latitude: formData.get("latitude"),
    longitude: formData.get("longitude"),
    address: formData.get("address"),
  });

  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: first.message, field: String(first.path[0]) };
  }

  try {
    await enforceRateLimit("report_create", await clientIdentity(user.id));
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    throw err;
  }

  // Görselleri işle (en fazla 3)
  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 3);
  let prepared;
  try {
    prepared = await Promise.all(files.map((f) => prepareImage(f)));
  } catch (err) {
    if (err instanceof UploadError) return { ok: false, error: err.message, field: "photos" };
    return { ok: false, error: `Görsel işlenemedi (en fazla ${MAX_UPLOAD_BYTES / 1024 / 1024} MB).`, field: "photos" };
  }

  const claims = await getClaims();
  const data = parsed.data;
  const stored: string[] = [];
  let slug: string;
  let reportId: string;
  let urgency = "normal";

  try {
    ({ slug, reportId, urgency } = await withRls(claims, async (tx) => {
      const [report] = await tx`
        insert into public.reports (user_id, title, description, category_id, latitude, longitude, address)
        values (${user.id}, ${data.title}, ${data.description || null}, ${data.categoryId},
                ${data.latitude}, ${data.longitude}, ${data.address || null})
        returning id, slug, urgency::text as urgency
      `;

      for (const [i, image] of prepared.entries()) {
        const media = await storeImage(image);
        stored.push(media.path);
        await tx`
          insert into public.report_media
            (report_id, storage_path, mime_type, width, height, byte_size, kind, sort_order, uploaded_by)
          values (${report.id}, ${media.path}, ${media.mimeType}, ${media.width}, ${media.height},
                  ${media.byteSize}, 'issue', ${i}, ${user.id})
        `;
      }

      // Bildiren kişi kendi sorununu otomatik olarak destekler ve takip eder.
      await tx`insert into public.report_supports (report_id, user_id)
               values (${report.id}, ${user.id}) on conflict do nothing`;

      return {
        slug: report.slug as string,
        reportId: report.id as string,
        urgency: report.urgency as string,
      };
    }));

  } catch (err) {
    // İşlem geri alındıysa yazılmış dosyaları temizle.
    await Promise.all(stored.map((k) => removeStored(k)));
    const message = dbErrorMessage(err) ?? "";
    if (message.includes("reports_title_check")) return { ok: false, error: "Başlık 8-120 karakter olmalı.", field: "title" };
    if (message.includes("violates row-level security")) return { ok: false, error: "Bu işlem için yetkiniz yok." };
    console.error("createReport", err);
    return { ok: false, error: "Bildirim kaydedilemedi. Lütfen tekrar deneyin." };
  }

  // Acil işaretlenen bildirim, kaydedilir kaydedilmez ilgili kuruma iletilir.
  // Gönderim başarısız olsa bile bildirim kaydedilmiş durumdadır; hata
  // outbound_messages'a yazılır ve yönetim ekranında görünür. Bildirimin
  // hayatı postanın gitmesine bağlanamaz.
  if (urgency === "acil") {
    try {
      const { acilBildirimGonder } = await import("../kurum-bildirim");
      await acilBildirimGonder(reportId);
    } catch (err) {
      console.error("acil bildirim gönderilemedi", err);
    }
  }

  revalidatePath("/");
  revalidatePath("/kesfet");
  // redirect() bir istisna fırlatarak çalışır; bu yüzden try bloğunun dışında
  // durur — aksi hâlde başarı yolu hata gibi ele alınıp yüklenen görseller silinir.
  redirect(`/sorun/${slug}?yeni=1`);
}

/** Destekle / desteği geri çek. Bir kullanıcı bir sorunu yalnızca bir kez destekler. */
export async function toggleSupport(reportId: string): Promise<{
  ok: boolean; supported?: boolean; count?: number; error?: string; code?: string;
}> {
  const claims = await getClaims();
  if (!claims) return { ok: false, error: "Desteklemek için giriş yapın.", code: "AUTH_REQUIRED" };

  try {
    await enforceRateLimit("support", await clientIdentity(claims.sub));
    const [row] = await withRls(claims, (tx) => tx`select * from public.toggle_support(${reportId})`);
    return { ok: true, supported: row.supported as boolean, count: row.support_count as number };
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    const message = dbErrorMessage(err) ?? "";
    if (message.includes("ACCOUNT_SUSPENDED")) return { ok: false, error: "Hesabınız askıya alınmış." };
    if (message.includes("AUTH_REQUIRED")) return { ok: false, error: "Giriş gerekli.", code: "AUTH_REQUIRED" };
    console.error("toggleSupport", err);
    return { ok: false, error: "İşlem tamamlanamadı." };
  }
}

const ModerationSchema = z.object({
  reportId: z.string().uuid(),
  reason: z.enum(["spam", "duplicate", "offensive", "personal_data", "political", "commercial", "fake", "other"]),
  detail: z.string().trim().max(1000).optional().or(z.literal("")),
});

export async function reportContent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const claims = await getClaims();
  if (!claims) return { ok: false, error: "İçerik bildirmek için giriş yapın." };

  const parsed = ModerationSchema.safeParse({
    reportId: formData.get("reportId"),
    reason: formData.get("reason"),
    detail: formData.get("detail"),
  });
  if (!parsed.success) return { ok: false, error: "Lütfen bir sebep seçin." };

  try {
    await enforceRateLimit("moderation_report", await clientIdentity(claims.sub));
    await withRls(claims, (tx) => tx`
      insert into public.moderation_reports (report_id, reporter_id, reason, detail)
      values (${parsed.data.reportId}, ${claims.sub}, ${parsed.data.reason}, ${parsed.data.detail || null})
      on conflict (report_id, reporter_id) do update set
        reason = excluded.reason, detail = excluded.detail, status = 'open'
    `);
    return { ok: true };
  } catch (err) {
    if (err instanceof RateLimitError) return { ok: false, error: err.message };
    console.error("reportContent", err);
    return { ok: false, error: "Bildirim gönderilemedi." };
  }
}
