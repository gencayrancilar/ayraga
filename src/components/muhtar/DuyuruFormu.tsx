"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { duyuruYayinla, type MuhtarState } from "@/lib/actions/muhtar";
import type { MuhtarMahalle } from "@/lib/auth/session";

const TURLER = [
  { deger: "duyuru", etiket: "Duyuru", ipucu: "Genel bilgilendirme" },
  { deger: "kesinti", etiket: "Kesinti", ipucu: "Su, elektrik, doğalgaz" },
  { deger: "calisma", etiket: "Çalışma", ipucu: "Yol, altyapı, bakım" },
  { deger: "toplanti", etiket: "Toplantı", ipucu: "Mahalle toplantısı, etkinlik" },
  { deger: "guncelleme", etiket: "Muhtar güncellemesi", ipucu: "Bir konunun son durumu" },
] as const;

export function DuyuruFormu({ mahalleler }: { mahalleler: MuhtarMahalle[] }) {
  const [durum, eylem, bekliyor] = useActionState<MuhtarState, FormData>(duyuruYayinla, { ok: false });
  const form = useRef<HTMLFormElement>(null);
  const [tur, setTur] = useState<string>("duyuru");

  useEffect(() => {
    if (durum.ok) {
      form.current?.reset();
      setTur("duyuru");
    }
  }, [durum.ok]);

  const sureliMi = tur === "kesinti" || tur === "calisma";

  return (
    <form ref={form} action={eylem} className="space-y-4 rounded-2xl border border-line bg-white p-5">
      <h2 className="text-base font-semibold text-ink-900">Yeni duyuru</h2>

      {mahalleler.length > 1 ? (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-600">Mahalle</span>
          <select name="neighborhoodId" required className="w-full rounded-xl border border-line px-3 py-2.5 text-sm">
            {mahalleler.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>
      ) : (
        <input type="hidden" name="neighborhoodId" value={mahalleler[0]?.id ?? ""} />
      )}

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-ink-600">Tür</legend>
        <div className="flex flex-wrap gap-1.5">
          {TURLER.map((t) => (
            <label
              key={t.deger}
              className={
                "cursor-pointer rounded-full px-3 py-1.5 text-xs transition " +
                (tur === t.deger ? "bg-ink-900 font-medium text-white" : "bg-surface-muted text-ink-600 hover:text-ink-900")
              }
            >
              <input
                type="radio"
                name="kind"
                value={t.deger}
                checked={tur === t.deger}
                onChange={() => setTur(t.deger)}
                className="sr-only"
              />
              {t.etiket}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-2xs text-ink-400">
          {TURLER.find((t) => t.deger === tur)?.ipucu}
        </p>
      </fieldset>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-600">Başlık</span>
        <input
          name="title"
          required
          minLength={6}
          maxLength={140}
          placeholder="Salı günü su kesintisi"
          className="w-full rounded-xl border border-line px-3 py-2.5 text-sm"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-ink-600">Metin</span>
        <textarea
          name="body"
          required
          minLength={10}
          maxLength={4000}
          rows={5}
          placeholder="Şebeke bakımı nedeniyle 09:00-15:00 arası su verilemeyecektir."
          className="w-full rounded-xl border border-line px-3 py-2.5 text-sm"
        />
      </label>

      {sureliMi && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-600">Başlangıç</span>
            <input type="datetime-local" name="startsAt" className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-ink-600">Bitiş</span>
            <input type="datetime-local" name="endsAt" className="w-full rounded-xl border border-line px-3 py-2.5 text-sm" />
          </label>
          <p className="text-2xs text-ink-400 sm:col-span-2">
            Bitiş tarihi geçen duyuru mahalle sayfasından kendiliğinden düşer.
          </p>
        </div>
      )}

      {durum.error && (
        <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{durum.error}</p>
      )}
      {durum.ok && durum.message && (
        <p role="status" className="rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-800">{durum.message}</p>
      )}

      <button
        type="submit"
        disabled={bekliyor}
        className="w-full rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white transition active:bg-teal-800 disabled:opacity-60 sm:w-auto"
      >
        {bekliyor ? "Yayımlanıyor…" : "Duyuruyu yayımla"}
      </button>
    </form>
  );
}
