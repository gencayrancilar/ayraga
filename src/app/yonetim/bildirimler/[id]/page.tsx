import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { adminGetReport } from "@/lib/queries/admin";
import { getAuthorities, getCategoriesFlat } from "@/lib/queries/reference";
import {
  changeStatus, addSubmission, recordResponse, addResolutionPhoto,
  mergeReports, updateReportMeta, setHidden,
} from "@/lib/actions/admin";
import { AdminForm } from "@/components/admin/AdminForm";
import { StatusBadge } from "@/components/ui/Badge";
import { STATUS, TRANSITIONS } from "@/lib/status";
import { publicMediaUrl } from "@/lib/public-config";
import { formatDateTime, formatDate, formatNumber, formatElapsed } from "@/lib/format";
import { IconExternal, IconChevronLeft, IconShieldCheck, IconFlag } from "@/components/icons";
import type { ReportStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Bildirim · Yönetim", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminReportDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, authorities, categories] = await Promise.all([
    adminGetReport(id),
    getAuthorities(),
    getCategoriesFlat(),
  ]);
  if (!detail) notFound();

  const { report: r, media, submissions, history, flags, events, duplicates } = detail;
  const transitions = TRANSITIONS[r.status as ReportStatus] ?? [];
  const issueMedia = media.filter((m) => m.kind === "issue");
  const resolutionMedia = media.filter((m) => m.kind === "resolution");
  const openSubmission = submissions.find((s) => !s.response_at);
  const waitingHours = r.first_forwarded_at && !r.first_response_at
    ? (Date.now() - new Date(r.first_forwarded_at).getTime()) / 3_600_000
    : null;

  return (
    <div className="space-y-4">
      <Link href="/yonetim/bildirimler" className="inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-900">
        <IconChevronLeft size={14} /> Bildirimler
      </Link>

      <header className="rounded-2xl bg-white p-4 ring-1 ring-line sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={r.status as ReportStatus} />
          <span className="font-mono text-2xs text-ink-400">{r.ref_code}</span>
          {r.is_hidden && <span className="rounded-full bg-ink-100 px-2 py-0.5 text-2xs font-medium text-ink-600">Yayından kaldırıldı</span>}
          <Link href={`/sorun/${r.slug}`} target="_blank" className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline">
            Kamuya açık sayfa <IconExternal size={12} />
          </Link>
        </div>

        <h1 className="mt-2 text-xl font-semibold text-ink-900">{r.title}</h1>
        {r.description && <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink-600">{r.description}</p>}

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
          <Meta label="Kategori" value={r.category_name} />
          <Meta label="Mahalle" value={r.neighborhood_name ?? "—"} />
          <Meta label="Bildiren" value={r.author_name ?? "Silinmiş hesap"} />
          <Meta label="Oluşturma" value={formatDateTime(r.created_at)} />
          <Meta label="Destek" value={formatNumber(r.support_count)} />
          <Meta label="Görüntülenme" value={formatNumber(r.view_count)} />
          <Meta label="Adres" value={r.address ?? "—"} />
          <Meta label="Koordinat" value={`${Number(r.latitude).toFixed(5)}, ${Number(r.longitude).toFixed(5)}`} />
        </dl>

        {waitingHours != null && (
          <p className={`mt-3 rounded-xl px-3 py-2 text-xs ${waitingHours > r.sla_days * 24 ? "bg-[#fbf3e0] text-[#7a5406]" : "bg-surface-muted text-ink-600"}`}>
            Başvurudan bu yana <strong className="font-semibold">{formatElapsed(waitingHours)}</strong> geçti
            {waitingHours > r.sla_days * 24 && ` — kurumun ${r.sla_days} günlük yanıt hedefi aşıldı.`}
          </p>
        )}

        {(issueMedia.length > 0 || resolutionMedia.length > 0) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {media.map((m) => (
              <div key={m.id} className="relative size-24 overflow-hidden rounded-xl bg-surface-sunken ring-1 ring-line">
                <Image src={publicMediaUrl(m.storage_path)!} alt="" fill sizes="96px" className="object-cover" />
                <span className="absolute bottom-1 left-1 rounded bg-ink-900/75 px-1.5 py-0.5 text-[0.5625rem] font-medium text-white">
                  {m.kind === "resolution" ? "Çözüm" : m.kind === "document" ? "Belge" : "Sorun"}
                </span>
              </div>
            ))}
          </div>
        )}
      </header>

      {flags.filter((f) => f.status === "open").length > 0 && (
        <section className="rounded-2xl bg-[#fdeaef] p-4 ring-1 ring-inset ring-[#f6ccd8]">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-[#8d0f33]">
            <IconFlag size={15} /> Açık moderasyon ihbarları
          </h2>
          <ul className="mt-2 space-y-1.5 text-xs text-[#8d0f33]">
            {flags.filter((f) => f.status === "open").map((f) => (
              <li key={f.id}>
                <strong className="font-medium">{REASON_LABEL[f.reason] ?? f.reason}</strong>
                {f.detail && ` — ${f.detail}`}
                <span className="ml-1 opacity-70">({formatDate(f.created_at)})</span>
              </li>
            ))}
          </ul>
          <Link href="/yonetim/moderasyon" className="mt-2 inline-block text-xs font-medium text-[#8d0f33] underline">
            Moderasyon kuyruğunda işle
          </Link>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Durum değiştir */}
        <section className="rounded-2xl bg-white p-4 ring-1 ring-line">
          <h2 className="mb-3 text-sm font-semibold text-ink-900">Durumu değiştir</h2>
          {transitions.length === 0 ? (
            <p className="text-xs text-ink-500">Bu durumdan geçiş tanımlı değil.</p>
          ) : (
            <AdminForm action={changeStatus} submitLabel="Durumu güncelle">
              <input type="hidden" name="reportId" value={r.id} />
              <label className="block text-xs font-medium text-ink-700">
                Yeni durum
                <select name="status" required className="mt-1 h-10 w-full rounded-xl border-0 bg-surface-muted px-3 text-sm ring-1 ring-inset ring-line focus:ring-2 focus:ring-teal-600">
                  {transitions.map((s) => (
                    <option key={s} value={s}>{STATUS[s].label}</option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-ink-700">
                Not <span className="font-normal text-ink-400">(zaman çizelgesinde görünür)</span>
                <textarea name="note" rows={2} maxLength={500} className="mt-1 w-full rounded-xl border-0 bg-surface-muted px-3 py-2 text-sm ring-1 ring-inset ring-line focus:ring-2 focus:ring-teal-600" />
              </label>
            </AdminForm>
          )}
        </section>

        {/* Resmî başvuru */}
        <section className="rounded-2xl bg-white p-4 ring-1 ring-line">
          <h2 className="mb-3 text-sm font-semibold text-ink-900">Resmî başvuru ekle</h2>
          <AdminForm action={addSubmission} submitLabel="Başvuruyu kaydet" variant="secondary">
            <input type="hidden" name="reportId" value={r.id} />
            <label className="block text-xs font-medium text-ink-700">
              Kurum
              <select name="authorityId" required className="mt-1 h-10 w-full rounded-xl border-0 bg-surface-muted px-3 text-sm ring-1 ring-inset ring-line focus:ring-2 focus:ring-teal-600">
                <option value="">Seçin…</option>
                {authorities.filter((a) => a.is_active).map((a) => (
                  <option key={a.id as string} value={a.id as string}>{a.name as string}</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-medium text-ink-700">
                Kanal
                <select name="channel" defaultValue="cimer" className="mt-1 h-10 w-full rounded-xl border-0 bg-surface-muted px-3 text-sm ring-1 ring-inset ring-line focus:ring-2 focus:ring-teal-600">
                  <option value="cimer">CİMER</option>
                  <option value="email">E-posta</option>
                  <option value="petition">Dilekçe</option>
                  <option value="portal">Kurum portalı</option>
                  <option value="phone">Telefon</option>
                  <option value="in_person">Yüz yüze</option>
                  <option value="other">Diğer</option>
                </select>
              </label>
              <label className="block text-xs font-medium text-ink-700">
                Başvuru tarihi
                <input type="date" name="submittedAt" className="mt-1 h-10 w-full rounded-xl border-0 bg-surface-muted px-3 text-sm ring-1 ring-inset ring-line focus:ring-2 focus:ring-teal-600" />
              </label>
            </div>
            <label className="block text-xs font-medium text-ink-700">
              Başvuru numarası
              <input name="referenceNo" maxLength={80} placeholder="Örn. CIMER-2026-884211" className="mt-1 h-10 w-full rounded-xl border-0 bg-surface-muted px-3 text-sm ring-1 ring-inset ring-line focus:ring-2 focus:ring-teal-600" />
            </label>
            <label className="flex items-center gap-2 text-xs text-ink-700">
              <input type="checkbox" name="autoForward" defaultChecked className="size-4 accent-[#068272]" />
              Durumu otomatik olarak &quot;Yetkili kuruma iletildi&quot; yap
            </label>
          </AdminForm>
        </section>
      </div>

      {/* Başvurular ve yanıtlar */}
      {submissions.length > 0 && (
        <section className="rounded-2xl bg-white p-4 ring-1 ring-line">
          <h2 className="mb-3 text-sm font-semibold text-ink-900">Başvurular</h2>
          <ul className="space-y-3">
            {submissions.map((s) => (
              <li key={s.id} className="rounded-xl bg-surface-muted p-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-ink-900">{s.authority_name}</p>
                  <span className="text-2xs text-ink-500">{formatDate(s.submitted_at)} · {s.channel}</span>
                </div>
                {s.reference_no && <p className="mt-1 font-mono text-2xs text-ink-600">{s.reference_no}</p>}

                {s.response_at ? (
                  <div className="mt-2 border-t border-line pt-2 text-xs">
                    <p className="font-medium text-ink-700">Yanıt · {formatDate(s.response_at)} · {OUTCOME_LABEL[s.outcome] ?? s.outcome}</p>
                    {s.response_text && <p className="mt-1 whitespace-pre-line text-ink-600">{s.response_text}</p>}
                  </div>
                ) : (
                  <details className="mt-2 border-t border-line pt-2">
                    <summary className="cursor-pointer text-xs font-medium text-teal-700">Yanıt kaydet</summary>
                    <div className="mt-2">
                      <AdminForm action={recordResponse} submitLabel="Yanıtı kaydet" size="sm">
                        <input type="hidden" name="submissionId" value={s.id} />
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block text-xs font-medium text-ink-700">
                            Yanıt tarihi
                            <input type="date" name="responseAt" className="mt-1 h-9 w-full rounded-lg border-0 bg-white px-2.5 text-sm ring-1 ring-inset ring-line" />
                          </label>
                          <label className="block text-xs font-medium text-ink-700">
                            Sonuç
                            <select name="outcome" defaultValue="acknowledged" className="mt-1 h-9 w-full rounded-lg border-0 bg-white px-2.5 text-sm ring-1 ring-inset ring-line">
                              <option value="acknowledged">Alındı bildirimi</option>
                              <option value="in_progress">İşleme alındı</option>
                              <option value="resolved">Çözüldü</option>
                              <option value="rejected">Reddedildi</option>
                              <option value="no_response">Yanıt yok</option>
                            </select>
                          </label>
                        </div>
                        <label className="block text-xs font-medium text-ink-700">
                          Kurum yanıtı
                          <textarea name="responseText" rows={3} maxLength={3000} className="mt-1 w-full rounded-lg border-0 bg-white px-2.5 py-2 text-sm ring-1 ring-inset ring-line" />
                        </label>
                        <label className="block text-xs font-medium text-ink-700">
                          Başvuru numarası <span className="font-normal text-ink-400">(sonradan geldiyse)</span>
                          <input name="referenceNo" maxLength={80} className="mt-1 h-9 w-full rounded-lg border-0 bg-white px-2.5 text-sm ring-1 ring-inset ring-line" />
                        </label>
                      </AdminForm>
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
          {openSubmission && (
            <p className="mt-3 text-2xs text-ink-500">
              Yanıt kaydedildiğinde sessizlik sayacı durur ve takipçilere bildirim gider.
            </p>
          )}
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Çözüm görseli */}
        <section className="rounded-2xl bg-white p-4 ring-1 ring-line">
          <h2 className="mb-1 text-sm font-semibold text-ink-900">Çözüm görseli</h2>
          <p className="mb-3 text-xs text-ink-500">
            Yüklenen görsel &quot;önce / sonra&quot; karşılaştırmasında ve kanıt zincirinde görünür.
          </p>
          <AdminForm action={addResolutionPhoto} submitLabel="Görseli yükle" variant="outline">
            <input type="hidden" name="reportId" value={r.id} />
            <input
              type="file"
              name="photo"
              accept="image/jpeg,image/png,image/webp,image/heic"
              required
              className="w-full text-xs text-ink-600 file:mr-3 file:h-9 file:rounded-lg file:border-0 file:bg-ink-900 file:px-3 file:text-xs file:font-medium file:text-white"
            />
          </AdminForm>
        </section>

        {/* Birleştir */}
        <section className="rounded-2xl bg-white p-4 ring-1 ring-line">
          <h2 className="mb-1 text-sm font-semibold text-ink-900">Mükerrer bildirimi birleştir</h2>
          <p className="mb-3 text-xs text-ink-500">
            Bu bildirim, hedef bildirimin mükerreri olarak işaretlenir; destekler hedefe taşınır.
          </p>
          <AdminForm action={mergeReports} submitLabel="Birleştir" variant="outline">
            <input type="hidden" name="sourceId" value={r.id} />
            <label className="block text-xs font-medium text-ink-700">
              Hedef bildirim (AYRA kodu veya slug)
              <input name="targetRef" required placeholder="AYRA-001042" className="mt-1 h-10 w-full rounded-xl border-0 bg-surface-muted px-3 text-sm ring-1 ring-inset ring-line focus:ring-2 focus:ring-teal-600" />
            </label>
          </AdminForm>
          {duplicates.length > 0 && (
            <p className="mt-3 text-2xs text-ink-500">
              Bu kayıtla birleştirilmiş {duplicates.length} bildirim var.
            </p>
          )}
        </section>

        {/* Düzeltme */}
        <section className="rounded-2xl bg-white p-4 ring-1 ring-line">
          <h2 className="mb-3 text-sm font-semibold text-ink-900">Düzeltme</h2>
          <AdminForm action={updateReportMeta} submitLabel="Kaydet" variant="outline">
            <input type="hidden" name="reportId" value={r.id} />
            <label className="block text-xs font-medium text-ink-700">
              Başlık
              <input name="title" defaultValue={r.title} maxLength={120} className="mt-1 h-10 w-full rounded-xl border-0 bg-surface-muted px-3 text-sm ring-1 ring-inset ring-line" />
            </label>
            <label className="block text-xs font-medium text-ink-700">
              Kategori
              <select name="categoryId" defaultValue={r.category_id} className="mt-1 h-10 w-full rounded-xl border-0 bg-surface-muted px-3 text-sm ring-1 ring-inset ring-line">
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.parent_id ? "— " : ""}{c.name}</option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-ink-700">
              Adres
              <input name="address" defaultValue={r.address ?? ""} maxLength={240} className="mt-1 h-10 w-full rounded-xl border-0 bg-surface-muted px-3 text-sm ring-1 ring-inset ring-line" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-medium text-ink-700">
                Enlem
                <input name="latitude" type="number" step="0.000001" defaultValue={Number(r.latitude).toFixed(6)} className="mt-1 h-10 w-full rounded-xl border-0 bg-surface-muted px-3 text-sm ring-1 ring-inset ring-line" />
              </label>
              <label className="block text-xs font-medium text-ink-700">
                Boylam
                <input name="longitude" type="number" step="0.000001" defaultValue={Number(r.longitude).toFixed(6)} className="mt-1 h-10 w-full rounded-xl border-0 bg-surface-muted px-3 text-sm ring-1 ring-inset ring-line" />
              </label>
            </div>
            <p className="text-2xs text-ink-500">Koordinat değişirse mahalle otomatik yeniden hesaplanır.</p>
          </AdminForm>
        </section>

        {/* Yayından kaldır */}
        <section className="rounded-2xl bg-white p-4 ring-1 ring-line">
          <h2 className="mb-1 text-sm font-semibold text-ink-900">
            {r.is_hidden ? "Yeniden yayına al" : "Yayından kaldır"}
          </h2>
          <p className="mb-3 text-xs text-ink-500">
            {r.is_hidden
              ? "Bildirim yeniden herkese açık hâle gelir."
              : "Kişisel veri, hakaret, reklam veya sahte bildirim durumunda kullanın."}
          </p>
          <AdminForm action={setHidden} submitLabel={r.is_hidden ? "Yayına al" : "Yayından kaldır"} variant={r.is_hidden ? "outline" : "danger"}>
            <input type="hidden" name="reportId" value={r.id} />
            <input type="hidden" name="hidden" value={r.is_hidden ? "false" : "true"} />
            {!r.is_hidden && (
              <label className="block text-xs font-medium text-ink-700">
                Gerekçe
                <input name="reason" maxLength={300} className="mt-1 h-10 w-full rounded-xl border-0 bg-surface-muted px-3 text-sm ring-1 ring-inset ring-line" />
              </label>
            )}
          </AdminForm>
        </section>
      </div>

      {/* Zaman çizelgesi */}
      <section className="rounded-2xl bg-white p-4 ring-1 ring-line">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-900">
          <IconShieldCheck size={16} className="text-teal-600" />
          Kanıt zinciri ({events.length} kayıt)
        </h2>
        <ol className="space-y-2 text-xs">
          {events.map((e) => (
            <li key={e.seq} className="flex items-baseline gap-3">
              <span className="w-6 shrink-0 text-right font-mono text-ink-400">{e.seq}</span>
              <span className="min-w-0 flex-1 text-ink-800">{e.summary}</span>
              <time className="shrink-0 text-ink-500" dateTime={e.occurred_at}>{formatDateTime(e.occurred_at)}</time>
              <span className="hidden shrink-0 font-mono text-[0.625rem] text-ink-400 sm:inline">{e.hash.slice(0, 10)}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 border-t border-line pt-2 text-2xs text-ink-500">
          Durum geçmişi: {history.map((h) => STATUS[h.to_status as ReportStatus]?.short).join(" → ")}
        </p>
      </section>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-2xs uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="mt-0.5 truncate text-ink-800" title={value}>{value}</dd>
    </div>
  );
}

const REASON_LABEL: Record<string, string> = {
  spam: "Spam", duplicate: "Mükerrer", offensive: "Hakaret",
  personal_data: "Kişisel veri", political: "Siyasi propaganda",
  commercial: "Ticari reklam", fake: "Sahte bildirim", other: "Diğer",
};

const OUTCOME_LABEL: Record<string, string> = {
  pending: "Beklemede", acknowledged: "Alındı bildirimi", in_progress: "İşleme alındı",
  resolved: "Çözüldü", rejected: "Reddedildi", no_response: "Yanıt yok",
};
