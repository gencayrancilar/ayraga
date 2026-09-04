import { cx } from "@/lib/utils";

export function Panel({
  children, className, padded = true,
}: { children: React.ReactNode; className?: string; padded?: boolean }) {
  return (
    <section
      className={cx(
        "rounded-2xl bg-white ring-1 ring-line shadow-card",
        padded && "p-4 sm:p-5",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PanelHeader({
  title, action, description,
}: { title: React.ReactNode; action?: React.ReactNode; description?: React.ReactNode }) {
  return (
    <header className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-ink-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({
  icon, title, description, action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl bg-white px-6 py-12 text-center ring-1 ring-line">
      {icon && <div className="mb-3 text-ink-300">{icon}</div>}
      <p className="text-base font-medium text-ink-800">{title}</p>
      {description && <p className="mt-1 max-w-xs text-sm text-ink-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
