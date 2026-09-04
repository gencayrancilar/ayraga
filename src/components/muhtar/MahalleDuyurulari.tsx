import type { Duyuru } from "@/lib/queries/muhtar";
import { formatDateTime, timeAgo } from "@/lib/format";

const TUR: Record<string, { etiket: string; sinif: string }> = {
  duyuru:     { etiket: "Duyuru",              sinif: "bg-ink-100 text-ink-700" },
  kesinti:    { etiket: "Kesinti",             sinif: "bg-amber-100 text-amber-900" },
  calisma:    { etiket: "Çalışma",             sinif: "bg-[#eeeffb] text-[#3a3f9e]" },
  toplanti:   { etiket: "Toplantı",            sinif: "bg-teal-100 text-teal-800" },
  guncelleme: { etiket: "Muhtar güncellemesi", sinif: "bg-[#eaf2fb] text-[#1c4a7d]" },
};

/**
 * Mahalle sayfasındaki muhtar duyuruları.
 *
 * Metin muhtara aittir; AYRA'nın kendi sesiyle karışmasın diye kutunun
 * üstünde kaynağı açıkça yazıyoruz.
 */
export function MahalleDuyurulari({ duyurular }: { duyurular: Duyuru[] }) {
  if (!duyurular.length) return null;

  return (
    <section aria-label="Muhtar duyuruları" className="mb-5">
      <h2 className="mb-2 text-sm font-semibold text-ink-900">Muhtardan</h2>
      <ul className="space-y-2">
        {duyurular.map((d) => {
          const t = TUR[d.kind] ?? TUR.duyuru;
          return (
            <li key={d.id} className="rounded-2xl border border-line bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-2xs font-medium ${t.sinif}`}>{t.etiket}</span>
                <span className="text-2xs text-ink-400">{timeAgo(d.created_at)}</span>
              </div>
              <h3 className="mt-1.5 text-sm font-medium text-ink-900">{d.title}</h3>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-700">{d.body}</p>
              {(d.starts_at || d.ends_at) && (
                <p className="mt-2 text-2xs text-ink-500">
                  {d.starts_at && <>Başlangıç: {formatDateTime(d.starts_at)}</>}
                  {d.starts_at && d.ends_at && " · "}
                  {d.ends_at && <>Bitiş: {formatDateTime(d.ends_at)}</>}
                </p>
              )}
              <p className="mt-2 text-2xs text-ink-400">
                Bu metin mahalle muhtarına aittir.
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
