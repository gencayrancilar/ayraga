import { formatDateTime } from "@/lib/format";

export type ResmiYanitKaydi = {
  id: string;
  body: string;
  reference_no: string | null;
  created_at: string;
  author_name: string | null;
  author_title: string | null;
  neighborhood_name: string | null;
};

/** Muhtarın bu bildirime yazdığı resmî yanıtlar — kamuya açık. */
export function OfficialReplies({ yanitlar }: { yanitlar: ResmiYanitKaydi[] }) {
  if (!yanitlar.length) return null;

  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-line sm:p-5">
      <h2 className="mb-1 text-base font-semibold text-ink-900">Muhtardan yanıt</h2>
      <p className="mb-3 text-xs text-ink-500">
        Aşağıdaki metin mahalle muhtarına aittir; AYRA değiştirmez, kısaltmaz.
      </p>
      <ul className="space-y-3">
        {yanitlar.map((y) => (
          <li key={y.id} className="rounded-xl bg-surface-muted p-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-ink-900">
                {y.author_title ?? "Mahalle Muhtarı"}
                {y.neighborhood_name ? ` · ${y.neighborhood_name}` : ""}
              </p>
              <time className="text-2xs text-ink-500" dateTime={y.created_at}>
                {formatDateTime(y.created_at)}
              </time>
            </div>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-700">{y.body}</p>
            {y.reference_no && (
              <p className="mt-2 font-mono text-2xs text-ink-600">Başvuru no: {y.reference_no}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
