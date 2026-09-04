import type { Metadata } from "next";
import Link from "next/link";
import { adminModerationQueue } from "@/lib/queries/admin";
import { resolveFlag, setHidden } from "@/lib/actions/admin";
import { AdminForm } from "@/components/admin/AdminForm";
import { formatDateTime } from "@/lib/format";
import { IconFlag, IconExternal } from "@/components/icons";

export const metadata: Metadata = { title: "Moderasyon · Yönetim", robots: { index: false } };
export const dynamic = "force-dynamic";

const REASON: Record<string, string> = {
  spam: "Spam veya alakasız", duplicate: "Mükerrer bildirim", offensive: "Hakaret / nefret söylemi",
  personal_data: "Kişisel veri (yüz, plaka, adres)", political: "Siyasi propaganda",
  commercial: "Ticari reklam", fake: "Sahte bildirim", other: "Diğer",
};

export default async function ModerationPage() {
  const queue = await adminModerationQueue();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-ink-900">Moderasyon</h1>
        <p className="mt-1 text-sm text-ink-600">
          Kullanıcı ihbarları. Karar verirken bildirimin kamuya açık sayfasını da inceleyin.
        </p>
      </header>

      {queue.length === 0 ? (
        <div className="rounded-2xl bg-white p-10 text-center ring-1 ring-line">
          <IconFlag size={28} className="mx-auto text-ink-300" />
          <p className="mt-2 text-sm font-medium text-ink-800">Kuyruk temiz</p>
          <p className="mt-1 text-xs text-ink-500">Bekleyen ihbar yok.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {queue.map((f) => (
            <li key={f.id as string} className="rounded-2xl bg-white p-4 ring-1 ring-line">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#fdeaef] px-2.5 py-1 text-2xs font-medium text-[#8d0f33]">
                      {REASON[f.reason as string] ?? (f.reason as string)}
                    </span>
                    {Number(f.flags_on_report) > 1 && (
                      <span className="rounded-full bg-ink-100 px-2 py-0.5 text-2xs font-medium text-ink-600">
                        bu bildirimde {String(f.flags_on_report)} ihbar
                      </span>
                    )}
                    {f.is_hidden as boolean && (
                      <span className="rounded-full bg-ink-100 px-2 py-0.5 text-2xs font-medium text-ink-600">yayında değil</span>
                    )}
                  </p>
                  <Link href={`/yonetim/bildirimler/${f.report_id}`} className="mt-1.5 block text-sm font-medium text-ink-900 hover:underline">
                    {f.title as string}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-2xs text-ink-500">
                    <span className="font-mono">{f.ref_code as string}</span>
                    <span>{f.reporter_name as string ?? "Anonim"}</span>
                    <time dateTime={f.created_at as string}>{formatDateTime(f.created_at as string)}</time>
                    <Link href={`/sorun/${f.slug}`} target="_blank" className="inline-flex items-center gap-1 text-teal-700 hover:underline">
                      Sayfayı aç <IconExternal size={11} />
                    </Link>
                  </p>
                  {f.detail as string && (
                    <p className="mt-2 rounded-lg bg-surface-muted px-3 py-2 text-xs text-ink-700">{f.detail as string}</p>
                  )}
                </div>
              </div>

              <div className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
                <AdminForm action={resolveFlag} submitLabel="İhbarı sonuçlandır" size="sm" variant="outline">
                  <input type="hidden" name="flagId" value={f.id as string} />
                  <div className="flex gap-2">
                    <select name="status" defaultValue="dismissed" aria-label="İhbar sonucu" className="h-9 flex-1 rounded-lg border-0 bg-surface-muted px-2.5 text-sm ring-1 ring-inset ring-line">
                      <option value="dismissed">Yersiz — kapat</option>
                      <option value="actioned">Haklı — işlem yapıldı</option>
                      <option value="reviewing">İncelemede</option>
                    </select>
                  </div>
                  <input name="note" maxLength={300} aria-label="Moderasyon notu" placeholder="Not (isteğe bağlı)" className="h-9 w-full rounded-lg border-0 bg-surface-muted px-2.5 text-sm ring-1 ring-inset ring-line" />
                </AdminForm>

                <AdminForm
                  action={setHidden}
                  submitLabel={(f.is_hidden as boolean) ? "Yayına al" : "Yayından kaldır"}
                  size="sm"
                  variant={(f.is_hidden as boolean) ? "outline" : "danger"}
                >
                  <input type="hidden" name="reportId" value={f.report_id as string} />
                  <input type="hidden" name="hidden" value={(f.is_hidden as boolean) ? "false" : "true"} />
                  {!(f.is_hidden as boolean) && (
                    <input name="reason" maxLength={300} aria-label="Yayından kaldırma gerekçesi" placeholder="Gerekçe" className="h-9 w-full rounded-lg border-0 bg-surface-muted px-2.5 text-sm ring-1 ring-inset ring-line" />
                  )}
                </AdminForm>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
