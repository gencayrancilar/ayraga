import { cx } from "@/lib/utils";

export function Field({
  label, hint, error, htmlFor, required, children, className,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-800">
        {label}
        {!required && <span className="ml-1.5 font-normal text-ink-400">(isteğe bağlı)</span>}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-xs text-[#9f1239]">{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}

const CONTROL =
  "w-full rounded-xl border-0 bg-white px-3.5 text-base text-ink-900 ring-1 ring-inset ring-line-strong " +
  "placeholder:text-ink-400 focus:ring-2 focus:ring-teal-600 focus:outline-none transition-shadow";

export function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(CONTROL, "h-12", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(CONTROL, "py-3 leading-relaxed", className)} rows={4} {...rest} />;
}

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(CONTROL, "h-12 appearance-none bg-white pr-9", className)} {...rest}>
      {children}
    </select>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-lg bg-[#fdeaef] px-3 py-2 text-sm text-[#8d0f33] ring-1 ring-inset ring-[#f6ccd8]">
      {children}
    </p>
  );
}
