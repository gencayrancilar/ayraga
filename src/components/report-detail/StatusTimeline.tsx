import { LIFECYCLE, STATUS } from "@/lib/status";
import type { ReportStatus } from "@/lib/types";
import { cx } from "@/lib/utils";

/** Yaşam döngüsünün neresinde olduğunu tek bakışta gösteren şerit. */
export function StatusTimeline({ status }: { status: ReportStatus }) {
  const current = STATUS[status].step;
  const failed = status === "unresolved";
  const steps = failed
    ? [...LIFECYCLE.slice(0, 5), "unresolved" as ReportStatus]
    : LIFECYCLE;

  return (
    <div aria-label="Sorun durumu" className="rounded-2xl bg-white p-4 ring-1 ring-line">
      <ol className="flex items-start gap-1">
        {steps.map((s) => {
          const meta = STATUS[s];
          const done = meta.step < current;
          const active = meta.step === current;
          return (
            <li key={s} className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
              <span
                className={cx(
                  "h-1.5 w-full rounded-full",
                  done ? "bg-ink-800" : active ? (failed ? "bg-status-unresolved" : "bg-teal-500") : "bg-surface-sunken",
                )}
              />
              <span
                className={cx(
                  "text-[0.625rem] leading-tight",
                  active ? "font-semibold text-ink-900" : done ? "text-ink-600" : "text-ink-400",
                )}
              >
                {meta.short}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-xs text-ink-600">{STATUS[status].description}</p>
    </div>
  );
}
