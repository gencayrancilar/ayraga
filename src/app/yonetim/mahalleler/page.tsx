import type { Metadata } from "next";
import { getNeighborhoods } from "@/lib/queries/reference";
import { updateNeighborhood } from "@/lib/actions/admin";
import { AdminForm } from "@/components/admin/AdminForm";
import { RefreshScoresButton } from "@/components/admin/RefreshScoresButton";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Mahalleler · Yönetim", robots: { index: false } };
export const dynamic = "force-dynamic";

const input = "h-9 w-full rounded-lg border-0 bg-surface-muted px-2.5 text-sm ring-1 ring-inset ring-line focus:ring-2 focus:ring-teal-600";

export default async function AdminNeighborhoodsPage() {
  const neighborhoods = await getNeighborhoods();

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Mahalleler</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-600">
            AYRA Skoru, açık sorun sayısını nüfusa oranlar. Nüfus girilmemiş mahallelerde
            varsayılan değer kullanılır ve bu kamuya açık sayfada belirtilir — doğru skor için
            TÜİK nüfusunu girin.
          </p>
        </div>
        <RefreshScoresButton />
      </header>

      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-line">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="border-b border-line text-left text-2xs uppercase tracking-wide text-ink-400">
            <tr>
              <th className="px-4 py-3 font-medium">Mahalle</th>
              <th className="px-4 py-3 text-right font-medium">Açık</th>
              <th className="px-4 py-3 text-right font-medium">Çözüldü</th>
              <th className="px-4 py-3 text-right font-medium">Skor</th>
              <th className="px-4 py-3 font-medium">Nüfus / merkez koordinat</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {neighborhoods.map((n) => (
              <tr key={n.id}>
                <td className="px-4 py-2.5">
                  <p className="font-medium text-ink-900">{n.name}</p>
                  <p className="text-2xs text-ink-500">{n.district_name}</p>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink-700">{formatNumber(n.open_count)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink-700">{formatNumber(n.resolved_count)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink-700">{n.score ?? "—"}</td>
                <td className="px-4 py-2.5">
                  <AdminForm action={updateNeighborhood} submitLabel="Kaydet" size="sm" variant="outline" compact>
                    <input type="hidden" name="id" value={n.id} />
                    <div className="flex gap-1.5">
                      <input name="population" type="number" min={0} defaultValue={n.population ?? ""} placeholder="nüfus" aria-label={`${n.name} nüfusu`} className={`${input} w-24`} />
                      <input name="centerLat" type="number" step="0.000001" defaultValue={n.center_lat ?? ""} placeholder="enlem" aria-label={`${n.name} enlem`} className={`${input} w-28`} />
                      <input name="centerLng" type="number" step="0.000001" defaultValue={n.center_lng ?? ""} placeholder="boylam" aria-label={`${n.name} boylam`} className={`${input} w-28`} />
                    </div>
                  </AdminForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
