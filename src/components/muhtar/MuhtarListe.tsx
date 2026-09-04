import Link from "next/link";
import type { MuhtarBildirim } from "@/lib/queries/muhtar";
import { STATUS } from "@/lib/status";
import { timeAgo } from "@/lib/format";
import type { ReportStatus } from "@/lib/types";

/** Muhtar panelindeki bildirim listesi. Salt okunur; eylem bildirim sayfasında. */
export function MuhtarListe({
  kayitlar,
  bosMesaj = "Kayıt yok.",
}: {
  kayitlar: MuhtarBildirim[];
  bosMesaj?: string;
}) {
  if (!kayitlar.length) {
    return (
      <p className="rounded-2xl border border-dashed border-line bg-white/60 p-6 text-center text-sm text-ink-500">
        {bosMesaj}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
      {kayitlar.map((k) => (
        <li key={k.id}>
          <Link href={`/sorun/${k.slug}`} className="flex items-start gap-3 p-4 transition hover:bg-surface-muted">
            <span
              aria-hidden
              className="mt-1.5 size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: k.category_color }}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink-900">{k.title}</span>
              <span className="mt-0.5 block text-xs text-ink-500">
                {k.category_name}
                {k.address ? ` · ${k.address}` : ""} · {timeAgo(k.created_at)}
              </span>
              <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-2xs text-ink-600">
                  {STATUS[k.status as ReportStatus]?.short ?? k.status}
                </span>
                {k.gecikti && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-2xs font-medium text-amber-800">
                    kurumdan yanıt yok
                  </span>
                )}
                {k.yanitlandi && (
                  <span className="rounded-full bg-teal-50 px-2 py-0.5 text-2xs font-medium text-teal-700">
                    yanıtladınız
                  </span>
                )}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block text-sm font-semibold tabular-nums text-ink-900">{k.support_count}</span>
              <span className="block text-2xs text-ink-400">destek</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
