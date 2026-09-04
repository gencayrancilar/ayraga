import Link from "next/link";
import { timeAgo } from "@/lib/format";

type Gonderim = {
  id: string; kind: string; subject: string; body: string; status: string;
  error: string | null; recipients: string[]; created_at: string; sent_at: string | null;
  authority_name: string | null; ref_code: string | null;
};
type Kurum = { name: string; contact_email: string | null; bekleyen: number; karar_bekleyen: number };

const DURUM: Record<string, { etiket: string; sinif: string }> = {
  sent:    { etiket: "gönderildi", sinif: "bg-teal-50 text-teal-700" },
  failed:  { etiket: "hata",       sinif: "bg-red-50 text-red-700" },
  skipped: { etiket: "atlandı",    sinif: "bg-amber-50 text-amber-800" },
  pending: { etiket: "bekliyor",   sinif: "bg-ink-100 text-ink-700" },
};

export function GonderimListesi({
  gonderimler, kurumlar, ozet,
}: {
  gonderimler: Gonderim[];
  kurumlar: Kurum[];
  ozet: { gonderildi: number; hata: number; atlanan: number };
}) {
  const adressiz = kurumlar.filter((k) => !k.contact_email && k.bekleyen > 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-ink-900">Kuruma gönderimler</h1>
        <p className="mt-1 text-sm text-ink-500">
          Acil bildirimler kaydedilir kaydedilmez gider. Diğerleri, Gönderim
          onayı ekranında onaylandıktan sonra pazartesi sabahı toplu liste
          hâlinde iletilir. Giden her e-posta burada kayıtlıdır —
          gönderilemeyenler de.
        </p>
      </header>

      <section className="grid grid-cols-3 gap-3">
        {[
          { b: "Gönderildi", d: ozet?.gonderildi ?? 0 },
          { b: "Hata", d: ozet?.hata ?? 0 },
          { b: "Atlandı", d: ozet?.atlanan ?? 0 },
        ].map((x) => (
          <div key={x.b} className="rounded-2xl border border-line bg-white p-4">
            <p className="text-xs text-ink-500">{x.b}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{x.d}</p>
          </div>
        ))}
      </section>

      {adressiz.length > 0 && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">
            E-posta adresi eksik olan kurumlar
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            Bu kurumlara bildirim birikiyor ama gönderilemiyor. Adresleri
            {" "}
            <Link href="/yonetim/kurumlar" className="underline underline-offset-2">
              Kurumlar
            </Link>{" "}
            ekranından girin.
          </p>
          <ul className="mt-2 space-y-1">
            {adressiz.map((k) => (
              <li key={k.name} className="text-sm text-amber-900">
                {k.name} — {k.bekleyen} sorun bekliyor
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-base font-semibold text-ink-900">Kurumlarda gönderime hazır</h2>
        <p className="mb-3 text-sm text-ink-500">
          Onaylanmış, ilk gönderimde yola çıkacak bildirimler. Henüz karar
          verilmemiş olanlar{" "}
          <Link href="/yonetim/gonderim-onayi" className="underline underline-offset-2">Gönderim onayı</Link>{" "}
          ekranında bekliyor.
        </p>
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          {kurumlar.map((k) => (
            <li key={k.name} className="flex items-center justify-between gap-3 p-3.5">
              <div className="min-w-0">
                <p className="text-sm text-ink-900">{k.name}</p>
                <p className="text-2xs text-ink-400">{k.contact_email ?? "e-posta yok"}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 text-2xs">
                {k.karar_bekleyen > 0 && (
                  <span className="rounded-full bg-ink-100 px-2 py-0.5 tabular-nums text-ink-700">
                    {k.karar_bekleyen} karar bekliyor
                  </span>
                )}
                <span className="rounded-full bg-teal-50 px-2 py-0.5 tabular-nums text-teal-700">
                  {k.bekleyen} hazır
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-base font-semibold text-ink-900">Son gönderimler</h2>
        {gonderimler.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-white/60 p-6 text-center text-sm text-ink-500">
            Henüz gönderim yok.
          </p>
        ) : (
          <ul className="space-y-3">
            {gonderimler.map((g) => {
              const d = DURUM[g.status] ?? DURUM.pending;
              return (
                <li key={g.id} className="rounded-2xl border border-line bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-2xs font-medium ${d.sinif}`}>{d.etiket}</span>
                    <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-2xs text-ink-600">
                      {g.kind === "acil" ? "acil" : g.kind === "haftalik" ? "haftalık" : "test"}
                    </span>
                    <span className="text-2xs text-ink-400">
                      {g.authority_name ?? "—"}
                      {g.ref_code ? ` · ${g.ref_code}` : ""} · {timeAgo(g.created_at)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm font-medium text-ink-900">{g.subject}</p>
                  {g.recipients.length > 0 && (
                    <p className="mt-0.5 text-2xs text-ink-400">→ {g.recipients.join(", ")}</p>
                  )}
                  {g.error && <p className="mt-1.5 text-xs text-red-800">{g.error}</p>}
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-ink-500 hover:text-ink-900">
                      Gönderilen metni gör
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-surface-muted p-3 font-sans text-xs leading-relaxed text-ink-700">
                      {g.body}
                    </pre>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
