"use client";

import { useActionState } from "react";
import { duyuruKaldir, type MuhtarState } from "@/lib/actions/muhtar";
import type { Duyuru } from "@/lib/queries/muhtar";
import { timeAgo } from "@/lib/format";

const TUR_ETIKET: Record<string, string> = {
  duyuru: "Duyuru",
  kesinti: "Kesinti",
  calisma: "Çalışma",
  toplanti: "Toplantı",
  guncelleme: "Muhtar güncellemesi",
};

export function DuyuruListesi({ duyurular }: { duyurular: Duyuru[] }) {
  const [, kaldir] = useActionState<MuhtarState, FormData>(duyuruKaldir, { ok: false });

  if (!duyurular.length) {
    return (
      <p className="rounded-2xl border border-dashed border-line bg-white/60 p-6 text-center text-sm text-ink-500">
        Henüz duyuru yazmadınız.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {duyurular.map((d) => (
        <li
          key={d.id}
          className={
            "rounded-2xl border p-4 " +
            (d.is_hidden ? "border-red-200 bg-red-50/50" : "border-line bg-white")
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-2xs text-ink-600">
                {TUR_ETIKET[d.kind] ?? d.kind}
              </span>
              <h3 className="mt-1.5 text-sm font-medium text-ink-900">{d.title}</h3>
              <p className="mt-1 whitespace-pre-line text-sm text-ink-600">{d.body}</p>
              <p className="mt-2 text-2xs text-ink-400">
                {d.neighborhood_name} · {timeAgo(d.created_at)}
              </p>
            </div>

            {!d.is_hidden && (
              <form action={kaldir} className="shrink-0">
                <input type="hidden" name="id" value={d.id} />
                <button
                  type="submit"
                  className="rounded-lg px-2.5 py-1.5 text-xs text-ink-500 transition hover:bg-surface-sunken hover:text-ink-900"
                >
                  Kaldır
                </button>
              </form>
            )}
          </div>

          {d.is_hidden && (
            <p className="mt-3 rounded-xl bg-white px-3 py-2 text-xs text-red-800">
              <strong className="font-medium">Dernek bu duyuruyu yayından kaldırdı.</strong>{" "}
              {d.hidden_reason}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
