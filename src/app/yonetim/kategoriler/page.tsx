import type { Metadata } from "next";
import { getCategoriesFlat } from "@/lib/queries/reference";
import { upsertCategory } from "@/lib/actions/admin";
import { AdminForm } from "@/components/admin/AdminForm";
import { CategoryIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Kategoriler · Yönetim", robots: { index: false } };
export const dynamic = "force-dynamic";

const ICONS = ["bus", "road", "trash", "lamp", "tree", "shield", "accessibility", "health", "school", "wifi", "paw", "dots"];
const input = "h-10 w-full rounded-xl border-0 bg-surface-muted px-3 text-sm ring-1 ring-inset ring-line focus:ring-2 focus:ring-teal-600";

export default async function CategoriesPage() {
  const categories = await getCategoriesFlat();
  const roots = categories.filter((c) => !c.parent_id);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-ink-900">Kategoriler</h1>
        <p className="mt-1 text-sm text-ink-600">
          Ağırlık, AYRA Skorundaki payı; hedef süre ise sessizlik eşiğini belirler.
        </p>
      </header>

      <div className="overflow-x-auto rounded-2xl bg-white ring-1 ring-line">
        <table className="w-full min-w-[42rem] text-sm">
          <thead className="border-b border-line text-left text-2xs uppercase tracking-wide text-ink-400">
            <tr>
              <th className="px-4 py-3 font-medium">Kategori</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 text-right font-medium">Ağırlık</th>
              <th className="px-4 py-3 text-right font-medium">Hedef (gün)</th>
              <th className="px-4 py-3 text-right font-medium">Sıra</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {categories.map((c) => (
              <tr key={c.id} className={c.is_active ? "" : "opacity-50"}>
                <td className="px-4 py-2.5">
                  <span className={`flex items-center gap-2 ${c.parent_id ? "pl-6 text-ink-600" : "font-medium text-ink-900"}`}>
                    <span style={{ color: c.color }}><CategoryIcon name={c.icon} size={16} /></span>
                    {c.name}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-2xs text-ink-500">{c.slug}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink-700">{Number(c.weight).toFixed(2)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink-700">{c.sla_days}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink-400">{c.sort_order}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-line">
        <h2 className="mb-3 text-sm font-semibold text-ink-900">Kategori ekle veya düzenle</h2>
        <p className="mb-3 text-xs text-ink-500">
          Mevcut bir kategoriyi düzenlemek için kimliğini girin; boş bırakılırsa yeni kategori oluşur.
        </p>
        <AdminForm action={upsertCategory} submitLabel="Kategoriyi kaydet">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-ink-700">
              Kimlik (UUID) <span className="font-normal text-ink-400">— düzenlemek için</span>
              <input name="id" className={`mt-1 ${input} font-mono text-xs`} placeholder="boş bırakın" />
            </label>
            <label className="block text-xs font-medium text-ink-700">
              Üst kategori
              <select name="parentId" className={`mt-1 ${input}`}>
                <option value="">— ana kategori —</option>
                {roots.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="block text-xs font-medium text-ink-700">
              Ad<input name="name" required maxLength={60} className={`mt-1 ${input}`} />
            </label>
            <label className="block text-xs font-medium text-ink-700">
              Slug<input name="slug" required pattern="[a-z0-9-]+" className={`mt-1 ${input}`} />
            </label>
            <label className="block text-xs font-medium text-ink-700">
              İkon
              <select name="icon" defaultValue="dots" className={`mt-1 ${input}`}>
                {ICONS.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </label>
            <label className="block text-xs font-medium text-ink-700">
              Renk<input name="color" type="color" defaultValue="#0e7c86" required className="mt-1 h-10 w-full rounded-xl border-0 bg-surface-muted px-2 ring-1 ring-inset ring-line" />
            </label>
            <label className="block text-xs font-medium text-ink-700">
              Skor ağırlığı (0,1 – 3,0)
              <input name="weight" type="number" step="0.05" min={0.1} max={3} defaultValue={1} required className={`mt-1 ${input}`} />
            </label>
            <label className="block text-xs font-medium text-ink-700">
              Hedef çözüm süresi (gün)
              <input name="slaDays" type="number" min={1} max={365} defaultValue={30} required className={`mt-1 ${input}`} />
            </label>
            <label className="block text-xs font-medium text-ink-700">
              Sıralama<input name="sortOrder" type="number" min={0} max={999} defaultValue={100} required className={`mt-1 ${input}`} />
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
