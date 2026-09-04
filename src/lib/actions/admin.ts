"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { withRls, dbErrorMessage } from "../db";
import { getClaims, requireModerator, AuthError } from "../auth/session";
import { prepareImage, storeImage, removeStored, UploadError } from "../storage";
import { TRANSITIONS } from "../status";
import type { ReportStatus } from "../types";

export type AdminState = { ok: boolean; error?: string; message?: string };

async function guard() {
  try {
    await requireModerator();
    return await getClaims();
  } catch (err) {
    throw err instanceof AuthError ? err : new AuthError("FORBIDDEN", "Yetkiniz yok.");
  }
}

function fail(err: unknown, fallback: string): AdminState {
  if (err instanceof AuthError) return { ok: false, error: err.message };
  const message = dbErrorMessage(err) ?? "";
  if (message.includes("row-level security")) return { ok: false, error: "Bu işlem için yetkiniz yok." };
  console.error(fallback, err);
  return { ok: false, error: fallback };
}

/** Durum değiştirir. Geçiş kuralları hem burada hem veritabanında korunur. */
export async function changeStatus(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const parsed = z
    .object({
      reportId: z.string().uuid(),
      status: z.string(),
      note: z.string().trim().max(500).optional().or(z.literal("")),
    })
    .safeParse({
      reportId: formData.get("reportId"),
      status: formData.get("status"),
      note: formData.get("note"),
    });
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  try {
    const claims = await guard();
    const next = parsed.data.status as ReportStatus;

    await withRls(claims, async (tx) => {
      const [current] = await tx`select status, slug from public.reports where id = ${parsed.data.reportId}`;
      if (!current) throw new AuthError("NOT_FOUND", "Bildirim bulunamadı.");

      const allowed = TRANSITIONS[current.status as ReportStatus] ?? [];
      if (!allowed.includes(next)) {
        throw new AuthError("INVALID_TRANSITION", `"${current.status}" durumundan bu duruma geçilemez.`);
      }

      await tx`
        insert into public.report_status_history (report_id, from_status, to_status, note, actor_id)
        values (${parsed.data.reportId}, ${current.status}::public.report_status,
                ${next}::public.report_status, ${parsed.data.note || null}, ${claims!.sub})`;

      revalidatePath(`/sorun/${current.slug}`);
    });

    revalidatePath("/yonetim/bildirimler");
    revalidatePath("/");
    return { ok: true, message: "Durum güncellendi." };
  } catch (err) {
    return fail(err, "Durum güncellenemedi.");
  }
}

/** Yetkili kuruma yapılan başvuruyu kaydeder. */
export async function addSubmission(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const parsed = z
    .object({
      reportId: z.string().uuid(),
      authorityId: z.string().uuid("Kurum seçilmedi."),
      channel: z.enum(["cimer", "email", "petition", "phone", "portal", "in_person", "other"]),
      referenceNo: z.string().trim().max(80).optional().or(z.literal("")),
      submittedAt: z.string().optional().or(z.literal("")),
      autoForward: z.string().optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    const claims = await guard();
    const d = parsed.data;

    await withRls(claims, async (tx) => {
      await tx`
        insert into public.authority_submissions
          (report_id, authority_id, channel, reference_no, submitted_by, submitted_at)
        values (${d.reportId}, ${d.authorityId}, ${d.channel}, ${d.referenceNo || null},
                ${claims!.sub}, ${d.submittedAt ? new Date(d.submittedAt) : new Date()})`;

      const [current] = await tx`select status, slug from public.reports where id = ${d.reportId}`;
      // Başvuru kaydedildiğinde durum henüz "iletildi" değilse otomatik ilerlet.
      if (d.autoForward === "on" && current && ["new", "verified"].includes(current.status)) {
        if (current.status === "new") {
          await tx`insert into public.report_status_history (report_id, from_status, to_status, actor_id)
                   values (${d.reportId}, 'new', 'verified', ${claims!.sub})`;
        }
        await tx`insert into public.report_status_history (report_id, from_status, to_status, actor_id)
                 values (${d.reportId}, 'verified', 'forwarded', ${claims!.sub})`;
      }
      if (current) revalidatePath(`/sorun/${current.slug}`);
    });

    revalidatePath("/yonetim/bildirimler");
    return { ok: true, message: "Başvuru kaydedildi." };
  } catch (err) {
    return fail(err, "Başvuru kaydedilemedi.");
  }
}

/** Kurumdan gelen yanıtı kaydeder. */
export async function recordResponse(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const parsed = z
    .object({
      submissionId: z.string().uuid(),
      responseText: z.string().trim().max(3000).optional().or(z.literal("")),
      outcome: z.enum(["acknowledged", "in_progress", "resolved", "rejected", "no_response"]),
      responseAt: z.string().optional().or(z.literal("")),
      referenceNo: z.string().trim().max(80).optional().or(z.literal("")),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  try {
    const claims = await guard();
    const d = parsed.data;
    await withRls(claims, async (tx) => {
      const [row] = await tx`
        update public.authority_submissions set
          response_at = ${d.responseAt ? new Date(d.responseAt) : new Date()},
          response_text = ${d.responseText || null},
          outcome = ${d.outcome},
          reference_no = coalesce(nullif(${d.referenceNo || ""}, ''), reference_no)
        where id = ${d.submissionId}
        returning report_id`;
      if (row) {
        const [r] = await tx`select slug from public.reports where id = ${row.report_id}`;
        if (r) revalidatePath(`/sorun/${r.slug}`);
      }
    });
    revalidatePath("/yonetim/bildirimler");
    return { ok: true, message: "Yanıt kaydedildi." };
  } catch (err) {
    return fail(err, "Yanıt kaydedilemedi.");
  }
}

/** Çözüm görseli yükler. */
export async function addResolutionPhoto(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const reportId = String(formData.get("reportId") ?? "");
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Görsel seçilmedi." };

  let stored: string | null = null;
  try {
    const claims = await guard();
    const image = await prepareImage(file);

    await withRls(claims, async (tx) => {
      const media = await storeImage(image, "resolutions");
      stored = media.path;
      await tx`
        insert into public.report_media
          (report_id, storage_path, mime_type, width, height, byte_size, kind, uploaded_by)
        values (${reportId}, ${media.path}, ${media.mimeType}, ${media.width}, ${media.height},
                ${media.byteSize}, 'resolution', ${claims!.sub})`;
      const [r] = await tx`select slug from public.reports where id = ${reportId}`;
      if (r) revalidatePath(`/sorun/${r.slug}`);
    });

    revalidatePath("/yonetim/bildirimler");
    return { ok: true, message: "Çözüm görseli eklendi." };
  } catch (err) {
    if (stored) await removeStored(stored);
    if (err instanceof UploadError) return { ok: false, error: err.message };
    return fail(err, "Görsel yüklenemedi.");
  }
}

/** İki bildirimi birleştirir: kaynak, hedefin mükerreri olur. */
export async function mergeReports(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const parsed = z
    .object({ sourceId: z.string().uuid(), targetRef: z.string().trim().min(3) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Hedef bildirim referansı gerekli." };

  try {
    const claims = await guard();
    const result = await withRls(claims, async (tx) => {
      const [target] = await tx`
        select id, slug, title, ref_code from public.reports
         where ref_code = upper(${parsed.data.targetRef}) or slug = ${parsed.data.targetRef}
         limit 1`;
      if (!target) throw new AuthError("NOT_FOUND", "Hedef bildirim bulunamadı.");
      if (target.id === parsed.data.sourceId) throw new AuthError("INVALID", "Bir bildirim kendisiyle birleştirilemez.");

      const [before] = await tx`select status from public.reports where id = ${parsed.data.sourceId}`;
      if (!before) throw new AuthError("NOT_FOUND", "Kaynak bildirim bulunamadı.");
      if (before.status === "duplicate") throw new AuthError("INVALID", "Bu bildirim zaten birleştirilmiş.");
      const previousStatus = before.status as string;

      // Destekleri hedefe taşı (tekrarları yok sayarak)
      await tx`
        insert into public.report_supports (report_id, user_id, created_at)
        select ${target.id}, s.user_id, s.created_at
          from public.report_supports s where s.report_id = ${parsed.data.sourceId}
        on conflict do nothing`;

      const [source] = await tx`
        update public.reports set duplicate_of_id = ${target.id}, status = 'duplicate'
         where id = ${parsed.data.sourceId}
        returning slug`;

      // Geçmişe ve kanıt zincirine işle. Durum zaten "duplicate" olduğu için
      // tetikleyici tekrar güncelleme yapmaz, yalnızca kaydı ekler.
      await tx`
        insert into public.report_status_history (report_id, from_status, to_status, note, actor_id)
        values (${parsed.data.sourceId}, ${previousStatus}::public.report_status, 'duplicate',
                ${"Birleştirildi: " + target.ref_code + " — " + target.title}, ${claims!.sub})`;

      if (source) revalidatePath(`/sorun/${source.slug}`);
      revalidatePath(`/sorun/${target.slug}`);
      return target.title as string;
    });

    revalidatePath("/yonetim/bildirimler");
    return { ok: true, message: `"${result}" ile birleştirildi.` };
  } catch (err) {
    return fail(err, "Birleştirme başarısız.");
  }
}

/** Kategori veya konum düzeltmesi. */
export async function updateReportMeta(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const parsed = z
    .object({
      reportId: z.string().uuid(),
      categoryId: z.string().uuid().optional().or(z.literal("")),
      latitude: z.coerce.number().min(-90).max(90).optional(),
      longitude: z.coerce.number().min(-180).max(180).optional(),
      address: z.string().trim().max(240).optional().or(z.literal("")),
      title: z.string().trim().min(8).max(120).optional().or(z.literal("")),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    const claims = await guard();
    const d = parsed.data;
    await withRls(claims, async (tx) => {
      await tx`
        update public.reports set
          category_id = coalesce(nullif(${d.categoryId || ""}, '')::uuid, category_id),
          latitude    = coalesce(${d.latitude ?? null}, latitude),
          longitude   = coalesce(${d.longitude ?? null}, longitude),
          address     = coalesce(nullif(${d.address || ""}, ''), address),
          title       = coalesce(nullif(${d.title || ""}, ''), title),
          neighborhood_id = case
            when ${d.latitude ?? null} is not null
            then public.resolve_neighborhood(${d.latitude ?? null}, ${d.longitude ?? null})
            else neighborhood_id end
        where id = ${d.reportId}`;
      const [r] = await tx`select slug from public.reports where id = ${d.reportId}`;
      if (r) revalidatePath(`/sorun/${r.slug}`);
    });
    revalidatePath("/yonetim/bildirimler");
    return { ok: true, message: "Bildirim güncellendi." };
  } catch (err) {
    return fail(err, "Güncelleme başarısız.");
  }
}

/** Moderasyon: yayından kaldır / geri al. */
export async function setHidden(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const parsed = z
    .object({
      reportId: z.string().uuid(),
      hidden: z.enum(["true", "false"]),
      reason: z.string().trim().max(300).optional().or(z.literal("")),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  try {
    const claims = await guard();
    const hide = parsed.data.hidden === "true";
    await withRls(claims, (tx) => tx`
      update public.reports
         set is_hidden = ${hide}, hidden_reason = ${hide ? parsed.data.reason || null : null}
       where id = ${parsed.data.reportId}`);
    revalidatePath("/yonetim/moderasyon");
    revalidatePath("/yonetim/bildirimler");
    revalidatePath("/");
    return { ok: true, message: hide ? "Yayından kaldırıldı." : "Yeniden yayına alındı." };
  } catch (err) {
    return fail(err, "İşlem başarısız.");
  }
}

export async function resolveFlag(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const parsed = z
    .object({
      flagId: z.string().uuid(),
      status: z.enum(["actioned", "dismissed", "reviewing"]),
      note: z.string().trim().max(300).optional().or(z.literal("")),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  try {
    const claims = await guard();
    await withRls(claims, (tx) => tx`
      update public.moderation_reports set
        status = ${parsed.data.status},
        resolved_by = ${claims!.sub},
        resolved_at = now(),
        resolution_note = ${parsed.data.note || null}
      where id = ${parsed.data.flagId}`);
    revalidatePath("/yonetim/moderasyon");
    return { ok: true, message: "İhbar sonuçlandırıldı." };
  } catch (err) {
    return fail(err, "İşlem başarısız.");
  }
}

/** Kategori düzenleme — mimari yönetim panelinden değiştirilebilir. */
export async function upsertCategory(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const parsed = z
    .object({
      id: z.string().uuid().optional().or(z.literal("")),
      name: z.string().trim().min(2).max(60),
      slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/, "Slug yalnızca küçük harf, rakam ve tire içerebilir."),
      parentId: z.string().uuid().optional().or(z.literal("")),
      icon: z.string().trim().min(1).max(30),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Renk #RRGGBB biçiminde olmalı."),
      weight: z.coerce.number().min(0.1).max(3),
      slaDays: z.coerce.number().int().min(1).max(365),
      sortOrder: z.coerce.number().int().min(0).max(999),
      isActive: z.string().optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    const claims = await guard();
    const d = parsed.data;
    await withRls(claims, (tx) => tx`
      insert into public.report_categories
        (id, parent_id, name, slug, icon, color, weight, sla_days, sort_order, is_active)
      values (
        coalesce(nullif(${d.id || ""}, '')::uuid, gen_random_uuid()),
        nullif(${d.parentId || ""}, '')::uuid,
        ${d.name}, ${d.slug}, ${d.icon}, ${d.color},
        ${d.weight}, ${d.slaDays}, ${d.sortOrder}, ${d.isActive === "on"})
      on conflict (id) do update set
        parent_id = excluded.parent_id, name = excluded.name, slug = excluded.slug,
        icon = excluded.icon, color = excluded.color, weight = excluded.weight,
        sla_days = excluded.sla_days, sort_order = excluded.sort_order,
        is_active = excluded.is_active`);
    revalidateTag("categories");
    revalidatePath("/yonetim/kategoriler");
    return { ok: true, message: "Kategori kaydedildi." };
  } catch (err) {
    return fail(err, "Kategori kaydedilemedi.");
  }
}

/** Yetkili kurum ekleme / düzenleme. */
export async function upsertAuthority(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const parsed = z
    .object({
      id: z.string().uuid().optional().or(z.literal("")),
      name: z.string().trim().min(3).max(120),
      slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/),
      shortName: z.string().trim().max(40).optional().or(z.literal("")),
      kind: z.enum(["municipality", "utility", "transport", "governorate", "ministry", "police", "other"]),
      website: z.string().url().optional().or(z.literal("")),
      contactEmail: z.string().email().optional().or(z.literal("")),
      contactPhone: z.string().trim().max(30).optional().or(z.literal("")),
      slaDays: z.coerce.number().int().min(1).max(365),
      isActive: z.string().optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  try {
    const claims = await guard();
    const d = parsed.data;
    await withRls(claims, (tx) => tx`
      insert into public.authorities
        (id, name, slug, short_name, kind, website, contact_email, contact_phone, response_sla_days, is_active)
      values (
        coalesce(nullif(${d.id || ""}, '')::uuid, gen_random_uuid()),
        ${d.name}, ${d.slug}, ${d.shortName || null}, ${d.kind},
        ${d.website || null}, ${d.contactEmail || null}, ${d.contactPhone || null},
        ${d.slaDays}, ${d.isActive === "on"})
      on conflict (id) do update set
        name = excluded.name, slug = excluded.slug, short_name = excluded.short_name,
        kind = excluded.kind, website = excluded.website, contact_email = excluded.contact_email,
        contact_phone = excluded.contact_phone, response_sla_days = excluded.response_sla_days,
        is_active = excluded.is_active`);
    revalidatePath("/yonetim/kurumlar");
    return { ok: true, message: "Kurum kaydedildi." };
  } catch (err) {
    return fail(err, "Kurum kaydedilemedi.");
  }
}

/** Mahalle nüfusu — AYRA Skorunun doğruluğu için gereklidir. */
export async function updateNeighborhood(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const parsed = z
    .object({
      id: z.string().uuid(),
      population: z.coerce.number().int().min(0).max(5_000_000).optional(),
      centerLat: z.coerce.number().min(-90).max(90).optional(),
      centerLng: z.coerce.number().min(-180).max(180).optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Geçersiz değer." };

  try {
    const claims = await guard();
    const d = parsed.data;
    await withRls(claims, async (tx) => {
      await tx`
        update public.neighborhoods set
          population = coalesce(${d.population ?? null}, population),
          center_lat = coalesce(${d.centerLat ?? null}, center_lat),
          center_lng = coalesce(${d.centerLng ?? null}, center_lng)
        where id = ${d.id}`;
      await tx`select public.refresh_neighborhood_scores()`;
    });
    revalidatePath("/yonetim/mahalleler");
    revalidatePath("/mahalle");
    return { ok: true, message: "Mahalle güncellendi." };
  } catch (err) {
    return fail(err, "Mahalle güncellenemedi.");
  }
}

export async function refreshScores(): Promise<AdminState> {
  try {
    const claims = await guard();
    await withRls(claims, (tx) => tx`select public.refresh_neighborhood_scores()`);
    revalidatePath("/mahalle");
    return { ok: true, message: "Skorlar yeniden hesaplandı." };
  } catch (err) {
    return fail(err, "Skorlar hesaplanamadı.");
  }
}
