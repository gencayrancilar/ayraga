"use client";

import { useActionState, useState } from "react";
import { reportContent, type ActionState } from "@/lib/actions/reports";
import { Button } from "../ui/Button";
import { ErrorNote } from "../ui/Field";
import { IconFlag, IconClose, IconCheck } from "../icons";

const REASONS = [
  { value: "duplicate", label: "Aynı sorun zaten bildirilmiş" },
  { value: "spam", label: "Spam veya alakasız içerik" },
  { value: "personal_data", label: "Kişisel veri içeriyor (yüz, plaka, adres)" },
  { value: "offensive", label: "Hakaret veya nefret söylemi" },
  { value: "political", label: "Siyasi propaganda" },
  { value: "commercial", label: "Ticari reklam" },
  { value: "fake", label: "Gerçek dışı bildirim" },
  { value: "other", label: "Diğer" },
] as const;

export function ReportAbuseDialog({ reportId, isAuthenticated }: { reportId: string; isAuthenticated: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<ActionState, FormData>(reportContent, { ok: false });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs text-ink-500 transition-colors hover:text-ink-800"
      >
        <IconFlag size={14} /> Bu içeriği bildir
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="İçerik bildir">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-ink-900">İçeriği bildir</h2>
            <p className="mt-0.5 text-xs text-ink-500">Moderatörler en kısa sürede inceleyecek.</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Kapat" className="text-ink-400 hover:text-ink-700">
            <IconClose size={20} />
          </button>
        </div>

        {state.ok ? (
          <div className="space-y-4">
            <p className="flex items-center gap-2 rounded-xl bg-teal-50 p-3 text-sm text-teal-800 ring-1 ring-inset ring-teal-200">
              <IconCheck size={16} /> Bildiriminiz alındı. Teşekkür ederiz.
            </p>
            <Button type="button" block variant="outline" onClick={() => setOpen(false)}>Kapat</Button>
          </div>
        ) : !isAuthenticated ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-600">İçerik bildirmek için katılmanız gerekiyor.</p>
            <Button type="button" block onClick={() => { window.location.href = "/giris"; }}>Katıl</Button>
          </div>
        ) : (
          <form action={action} className="space-y-4">
            <input type="hidden" name="reportId" value={reportId} />
            <fieldset className="space-y-1.5">
              <legend className="mb-1.5 text-sm font-medium text-ink-800">Sebep</legend>
              {REASONS.map((r) => (
                <label key={r.value} className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2 py-2 text-sm text-ink-700 transition-colors hover:bg-surface-muted">
                  <input type="radio" name="reason" value={r.value} required className="size-4 accent-[#068272]" />
                  {r.label}
                </label>
              ))}
            </fieldset>
            <textarea
              name="detail"
              rows={3}
              maxLength={1000}
              placeholder="Kısa açıklama (isteğe bağlı)"
              className="w-full rounded-xl border-0 bg-white px-3.5 py-3 text-base ring-1 ring-inset ring-line-strong placeholder:text-ink-400 focus:ring-2 focus:ring-teal-600"
            />
            {state.error && <ErrorNote>{state.error}</ErrorNote>}
            <div className="flex gap-2">
              <Button type="button" variant="outline" block onClick={() => setOpen(false)}>Vazgeç</Button>
              <Button type="submit" block loading={pending}>Gönder</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
