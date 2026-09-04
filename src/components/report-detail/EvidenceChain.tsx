import { formatDateTime } from "@/lib/format";
import { IconCheck, IconShieldCheck, IconAlert, IconLink } from "../icons";
import type { ChainEvent } from "@/lib/types";

const EVENT_TONE: Record<ChainEvent["event_type"], string> = {
  created: "bg-ink-900",
  media_added: "bg-ink-400",
  support_milestone: "bg-teal-500",
  status_changed: "bg-status-verified",
  authority_submitted: "bg-status-forwarded",
  authority_reference_added: "bg-status-forwarded",
  authority_responded: "bg-status-review",
  resolution_evidence: "bg-status-resolved",
  merged: "bg-ink-400",
  moderated: "bg-ink-400",
  note: "bg-ink-300",
};

/**
 * Sorun Kanıt Zinciri.
 *
 * Her olay, kendinden öncekinin özetiyle birlikte hash'lenir. Bir kaydın
 * sonradan değiştirilmesi veya araya kayıt sıkıştırılması zinciri kırar ve
 * doğrulama başarısız olur. Blok zinciri değildir; amaç merkeziyetsizlik
 * değil, "bu sorun için ne yapıldığı kayıt altında" güvenini vermektir.
 */
export function EvidenceChain({
  events, valid,
}: {
  events: ChainEvent[];
  valid: boolean;
}) {
  return (
    <section aria-labelledby="kanit-zinciri" className="rounded-2xl bg-white p-4 ring-1 ring-line sm:p-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 id="kanit-zinciri" className="text-base font-semibold text-ink-900">
            Kanıt zinciri
          </h2>
          <p className="mt-0.5 text-xs text-ink-500">
            Bu sorun için atılan her adım, değiştirilemez biçimde kayıt altında.
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-2xs font-medium ring-1 ring-inset ${
            valid ? "bg-teal-50 text-teal-800 ring-teal-200" : "bg-[#fdeaef] text-[#8d0f33] ring-[#f6ccd8]"
          }`}
          title={valid ? "Zincirdeki tüm kayıtların özeti doğrulandı." : "Zincir bütünlüğü doğrulanamadı."}
        >
          {valid ? <IconShieldCheck size={13} /> : <IconAlert size={13} />}
          {valid ? "Doğrulandı" : "Doğrulanamadı"}
        </span>
      </header>

      <ol className="relative space-y-0">
        {events.map((event, i) => {
          const last = i === events.length - 1;
          const reference = (event.payload?.reference_no as string) ?? null;
          const note = (event.payload?.note as string) ?? null;

          return (
            <li key={event.id} className="relative flex gap-3 pb-5 last:pb-0">
              {!last && (
                <span className="absolute left-[7px] top-4 h-full w-px bg-line" aria-hidden="true" />
              )}
              <span
                className={`relative z-10 mt-1 size-[15px] shrink-0 rounded-full ring-4 ring-white ${EVENT_TONE[event.event_type]}`}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug text-ink-900">{event.summary}</p>
                <p className="mt-0.5 text-2xs text-ink-500">
                  <time dateTime={event.occurred_at}>{formatDateTime(event.occurred_at)}</time>
                  {event.actor_label && <> · {event.actor_label}</>}
                </p>

                {reference && (
                  <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-surface-muted px-2 py-1 font-mono text-2xs text-ink-700">
                    <IconLink size={12} /> {reference}
                  </p>
                )}
                {note && <p className="mt-1.5 text-xs leading-relaxed text-ink-600">{note}</p>}

                <p className="mt-1 truncate font-mono text-[0.625rem] text-ink-400" title={`SHA-256: ${event.hash}`}>
                  {event.hash.slice(0, 16)}…
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {valid && (
        <p className="mt-4 flex items-start gap-2 border-t border-line pt-3 text-2xs leading-relaxed text-ink-500">
          <IconCheck size={13} className="mt-px shrink-0 text-teal-600" />
          Her kayıt, kendinden önceki kaydın özetiyle birlikte imzalanır. Geçmişe dönük
          bir değişiklik zinciri kırar ve burada görünür.
        </p>
      )}
    </section>
  );
}
