"use client";

import { useActionState } from "react";
import type { AdminState } from "@/lib/actions/admin";
import { Button } from "../ui/Button";
import { IconCheck, IconAlert } from "../icons";

/**
 * Yönetim formlarının ortak sarmalayıcısı: eylem durumunu okur, başarı ve
 * hata geri bildirimini tek bir yerde tutar.
 */
export function AdminForm({
  action, submitLabel, children, variant = "primary", size = "md", compact,
}: {
  action: (prev: AdminState, formData: FormData) => Promise<AdminState>;
  submitLabel: string;
  children?: React.ReactNode;
  variant?: "primary" | "secondary" | "outline" | "danger";
  size?: "sm" | "md";
  compact?: boolean;
}) {
  const [state, formAction, pending] = useActionState<AdminState, FormData>(action, { ok: false });

  return (
    <form action={formAction} className={compact ? "space-y-2" : "space-y-3"}>
      {children}
      {state.error && (
        <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-[#fdeaef] px-2.5 py-2 text-xs text-[#8d0f33]">
          <IconAlert size={14} className="mt-px shrink-0" /> {state.error}
        </p>
      )}
      {state.ok && state.message && (
        <p role="status" className="flex items-start gap-1.5 rounded-lg bg-teal-50 px-2.5 py-2 text-xs text-teal-800">
          <IconCheck size={14} className="mt-px shrink-0" /> {state.message}
        </p>
      )}
      <Button type="submit" size={size} variant={variant} loading={pending} block={!compact}>
        {submitLabel}
      </Button>
    </form>
  );
}
