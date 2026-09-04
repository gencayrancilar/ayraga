import { cx } from "@/lib/utils";
import { STATUS } from "@/lib/status";
import type { ReportStatus } from "@/lib/types";

export function Badge({
  children, className, tone = "neutral",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "neutral" | "teal" | "warn";
}) {
  const tones = {
    neutral: "bg-ink-100 text-ink-700 ring-ink-200",
    teal: "bg-teal-50 text-teal-800 ring-teal-200",
    warn: "bg-[#fbf3e0] text-[#7a5406] ring-[#f0e0b8]",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({
  status, className, showDot = true,
}: {
  status: ReportStatus;
  className?: string;
  showDot?: boolean;
}) {
  const meta = STATUS[status];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-medium ring-1 ring-inset whitespace-nowrap",
        meta.tone,
        className,
      )}
      title={meta.description}
    >
      {showDot && <span className={cx("size-1.5 rounded-full", meta.dot)} aria-hidden="true" />}
      {meta.label}
    </span>
  );
}

export function CategoryChip({
  name, color, className,
}: {
  name: string; color: string; className?: string;
}) {
  return (
    <span
      className={cx("inline-flex items-center gap-1.5 text-2xs font-medium text-ink-600", className)}
    >
      <span className="size-2 rounded-[3px]" style={{ background: color }} aria-hidden="true" />
      {name}
    </span>
  );
}
