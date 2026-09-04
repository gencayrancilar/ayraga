"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import Link from "next/link";
import { cx } from "@/lib/utils";
import { IconSpinner } from "../icons";

type Variant = "primary" | "secondary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-ink-900 text-white hover:bg-ink-800 active:bg-ink-950 disabled:bg-ink-300",
  secondary:
    "bg-teal-600 text-white hover:bg-teal-700 active:bg-teal-800 disabled:bg-teal-300",
  outline:
    "bg-white text-ink-800 ring-1 ring-line-strong hover:bg-surface-muted active:bg-surface-sunken",
  ghost:
    "bg-transparent text-ink-700 hover:bg-ink-100 active:bg-ink-200",
  danger:
    "bg-white text-[#9f1239] ring-1 ring-[#f6ccd8] hover:bg-[#fdeaef]",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3 text-sm gap-1.5 rounded-lg",
  md: "h-11 px-4 text-base gap-2 rounded-xl",
  lg: "h-13 px-6 text-lg gap-2.5 rounded-xl",
};

const BASE =
  "inline-flex items-center justify-center font-medium transition-colors duration-150 " +
  "disabled:cursor-not-allowed disabled:opacity-60 select-none";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, block, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(BASE, VARIANTS[variant], SIZES[size], block && "w-full", className)}
      {...rest}
    >
      {loading && <IconSpinner size={size === "sm" ? 15 : 17} />}
      {children}
    </button>
  );
});

export function ButtonLink({
  href, variant = "primary", size = "md", block, className, children, ...rest
}: {
  href: string; variant?: Variant; size?: Size; block?: boolean;
  className?: string; children: React.ReactNode;
} & Omit<React.ComponentProps<typeof Link>, "href" | "className">) {
  return (
    <Link
      href={href}
      className={cx(BASE, VARIANTS[variant], SIZES[size], block && "w-full", className)}
      {...rest}
    >
      {children}
    </Link>
  );
}
