import type { Metadata } from "next";
import { getAuthorities } from "@/lib/queries/reference";
import { upsertAuthority } from "@/lib/actions/admin";
import { AdminForm } from "@/components/admin/AdminForm";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Kurumlar · Yönetim", robots: { index: false } };
export const dynamic = "force-dynamic";

const KINDS = [
  ["municipality", "Belediye"], ["utility", "Altyapı / hizmet"], ["transport", "Ulaşım"],
  ["governorate", "Mülki idare"], ["ministry", "Bakanlık / il müdürlüğü"],
  ["police", "Emniyet"], ["other", "Diğer"],
] as const;

const input = "h-10 w-full rounded-xl border-0 bg-surface-muted px-3 text-sm ring-1 ring-inset ring-line focus:ring-2 focus:ring-teal-600";

export default async function AuthoritiesPage() {
  const authorities = await getAuthorities();

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-ink-900">Yetkili kurumlar</h1>
        <p className="mt-1 text-sm text-ink-600">
          Yanıt süresi hedefi, sessizlik sayacının eşiğini belirler.
        </p>
      </header>

      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-line">
        <table className="w-full min-w-[64rem] text-sm">
          <thead className="border-b border-line text-left text-2xs uppercase tracking-wide text-ink-400">
            <tr>
              <th className="px-4 py-3 font-medium">Kurum</th>
              <th className="px-4 py-3 font-medium">Tür</th>
              <th className="px-4 py-3 text-right font-medium">Başvuru</th>
              <th className="px-4 py-3 text-right font-medium">Yanıt</th>
              <th className="px-4 py-3 text-right font-medium">Ort. gün</th>
              <th className="px-4 py-3 font-medium">İletişim ve hedef süre</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {authorities.map((a) => (
              <tr key={a.id as string} className={a.is_active ? "" : "opacity-50"}>
                <td className="px-4 py-3">
                  <p className="font-medium text-ink-900">{a.name as string}</p>
                  {a.website as string && (
                    <a href={a.website as string} target="_blank" rel="noreferrer" className="text-2xs text-teal-700 hover:underline">
                      {a.website as string}
                    </a>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-ink-600">
                  {KINDS.find(([k]) => k === a.kind)?.[1] ?? (a.kind as string)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-ink-700">{formatNumber(Number(a.submission_count))}</td>
                <td className="px-4 py-3 text-right tabular-nums text-ink-700">{formatNumber(Number(a.responded_count))}</td>
                <td className={`px-4 py-3 text-right tabular-nums ${a.avg_response_days != null && Number(a.avg_response_days) > Number(a.response_sla_days) ? "font-medium text-[#a16207]" : "text-ink-700"}`}>
                  {a.avg_response_days != null ? String(a.avg_response_days) : "—"}
                </td>
                {/*
                  Mevcut kurumlar buradan düzenlenir. Aynı upsertAuthority
                  eylemine id ile gönderiliyor; bu yüzden ad, slug ve tür de
                  gizli alan olarak taşınmalı, yoksa kayıt sırasında boşalır.
                */}
                <td className="px-4 py-3">
                  <AdminForm action={upsertAuthority} submitLabel="Kaydet" size="sm" variant="outline" compact>
                    <input type="hidden" name="id" value={a.id as string} />
                    <input type="hidden" name="name" value={a.name as string} />
                    <input type="hidden" name="slug" value={a.slug as string} />
                    <input type="hidden" name="kind" value={a.kind as string} />
                    <input type="hidden" name="shortName" value={(a.short_name as string) ?? ""} />
                    <input type="hidden" name="website" value={(a.website as string) ?? ""} />
                    {a.is_active ? <input type="hidden" name="isActive" value="on" /> : null}
                    <div className="flex flex-wrap gap-1.5">
                      <input
                        name="contactEmail" type="email"
                        defaultValue={(a.contact_email as string) ?? ""}
                        placeholder="e-posta"
                        aria-label={`${a.name as string} e-posta`}
                        className={`${input} w-52`}
                      />
                      <input
                        name="contactPhone" maxLength={30}
                        defaultValue={(a.contact_phone as string) ?? ""}
                        placeholder="telefon"
                        aria-label={`${a.name as string} telefon`}
                        className={`${input} w-36`}
                      />
                      <input
                        name="slaDays" type="number" min={1} max={365} required
                        defaultValue={String(a.response_sla_days)}
                        aria-label={`${a.name as string} yanıt süresi hedefi (gün)`}
                        className={`${input} w-20`}
                      />
                    </div>
                  </AdminForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-line">
        <h2 className="mb-3 text-sm font-semibold text-ink-900">Kurum ekle</h2>
        <AdminForm action={upsertAuthority} submitLabel="Kurumu kaydet">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-ink-700">
              Ad<input name="name" required maxLength={120} className={`mt-1 ${input}`} />
            </label>
            <label className="block text-xs font-medium text-ink-700">
              Kısa ad<input name="shortName" maxLength={40} className={`mt-1 ${input}`} />
            </label>
            <label className="block text-xs font-medium text-ink-700">
              Slug<input name="slug" required pattern="[a-z0-9-]+" placeholder="torbali-belediyesi" className={`mt-1 ${input}`} />
            </label>
            <label className="block text-xs font-medium text-ink-700">
              Tür
              <select name="kind" defaultValue="municipality" className={`mt-1 ${input}`}>
                {KINDS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </label>
            <label className="block text-xs font-medium text-ink-700">
              Web sitesi<input name="website" type="url" placeholder="https://" className={`mt-1 ${input}`} />
            </label>
            <label className="block text-xs font-medium text-ink-700">
              E-posta<input name="contactEmail" type="email" className={`mt-1 ${input}`} />
            </label>
            <label className="block text-xs font-medium text-ink-700">
              Telefon<input name="contactPhone" maxLength={30} className={`mt-1 ${input}`} />
            </label>
            <label className="block text-xs font-medium text-ink-700">
              Yanıt süresi hedefi (gün)
              <input name="slaDays" type="number" min={1} max={365} defaultValue={30} required className={`mt-1 ${input}`} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-xs text-ink-700">
            <input type="checkbox" name="isActive" defaultChecked className="size-4 accent-[#068272]" /> Aktif
          </label>
        </AdminForm>
      </section>
    </div>
  );
}
