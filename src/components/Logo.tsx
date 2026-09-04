import { cx } from "@/lib/utils";

/**
 * AYRA logosu.
 *
 * Marka her zaman AYRA'dır. "GA" (Genç Ayrancılar Derneği) sağ üstte küçük,
 * ikincil bir imza olarak durur — asla wordmark'ın bir parçası gibi
 * okunmayacak ölçüde.
 *
 * İşaret: yuvarlatılmış kare içinde bir konum iğnesi. İğnenin gövdesi yolu,
 * teal nokta ise bildirilen sorunu temsil eder.
 */
export function AyraMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      className={className}
      role="img"
      aria-label="AYRA"
    >
      <rect width="40" height="40" rx="11" fill="var(--color-ink-900)" />
      <path
        d="M20 9.5c-4.4 0-8 3.5-8 7.9 0 5.6 6.7 11.6 7.4 12.2a.9.9 0 0 0 1.2 0c.7-.6 7.4-6.6 7.4-12.2 0-4.4-3.6-7.9-8-7.9Z"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.1"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="17.2" r="3.3" fill="var(--color-teal-400)" />
    </svg>
  );
}

export function AyraWordmark({
  className,
  tone = "dark",
  size = "md",
}: {
  className?: string;
  tone?: "dark" | "light";
  size?: "sm" | "md" | "lg";
}) {
  const scale = { sm: "text-lg", md: "text-[1.375rem]", lg: "text-3xl" }[size];
  const badge = { sm: "text-[0.5rem]", md: "text-[0.5625rem]", lg: "text-[0.75rem]" }[size];

  return (
    <span
      className={cx("relative inline-flex select-none items-start font-semibold tracking-[-0.03em]", scale, className)}
    >
      <span className={tone === "light" ? "text-white" : "text-ink-900"}>AYRA</span>
      <span
        aria-hidden="true"
        className={cx(
          "ml-[0.15em] mt-[0.05em] font-bold tracking-[0.02em]",
          badge,
          tone === "light" ? "text-teal-300" : "text-teal-700",
        )}
      >
        GA
      </span>
    </span>
  );
}

export function AyraLogo({
  className,
  tone = "dark",
  size = "md",
  withMark = true,
}: {
  className?: string;
  tone?: "dark" | "light";
  size?: "sm" | "md" | "lg";
  withMark?: boolean;
}) {
  const markSize = { sm: 24, md: 30, lg: 40 }[size];
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      {withMark && <AyraMark size={markSize} />}
      <AyraWordmark tone={tone} size={size} />
      <span className="sr-only">AYRA — Genç Ayrancılar Derneği</span>
    </span>
  );
}
