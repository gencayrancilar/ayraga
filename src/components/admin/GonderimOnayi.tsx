"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  kararVer, karariGeriAl, simdiGonder, kurumaTasi, atamayiKaldir, type OnayState,
} from "@/lib/actions/gonderim-onayi";
import type { Aday, KurumOzeti, KurumSecenegi } from "@/lib/queries/gonderim-onayi";
import { timeAgo } from "@/lib/format";
import { cx } from "@/lib/utils";

const ACILIYET: Record<Aday["urgency"], { etiket: string; sinif: string }> = {
  acil:   { etiket: "acil",   sinif: "bg-red-50 text-red-700" },
  hizli:  { etiket: "hızlı",  sinif: "bg-amber-50 text-amber-800" },
  normal: { etiket: "normal", sinif: "bg-ink-100 text-ink-600" },
};

const SEKMELER = [
  { deger: "bekleyen", etiket: "Karar bekleyen" },
  { deger: "onayli",   etiket: "Onaylı" },
  { deger: "haric",    etiket: "Listeden çıkarılan" },
] as const;
type Sekme = (typeof SEKMELER)[number]["deger"];

function Kutu({ baslik, deger, vurgu }: { baslik: string; deger: number; vurgu?: boolean }) {
  return (
    <div className={cx("rounded-2xl border bg-white p-4", vurgu ? "border-teal-200" : "border-line")}>
      <p className="text-xs text-ink-500">{baslik}</p>
      <p className={cx("mt-1 text-2xl font-semibold tabular-nums", vurgu ? "text-teal-700" : "text-ink-900")}>
        {deger}
      </p>
    </div>
  );
}

export function GonderimOnayi({
  kurumlar, secili, adaylar, secenekler,
}: {
  kurumlar: KurumOzeti[];
  secili: KurumOzeti | null;
  adaylar: Aday[];
  secenekler: KurumSecenegi[];
}) {
  const [kararDurum, kararEylem, kararBekliyor] = useActionState<OnayState, FormData>(kararVer, { ok: false });
  const [geriDurum, geriEylem] = useActionState<OnayState, FormData>(karariGeriAl, { ok: false });
  const [gonderDurum, gonderEylem, gonderBekliyor] = useActionState<OnayState, FormData>(simdiGonder, { ok: false });
  const [tasiDurum, tasiEylem, tasiBekliyor] = useActionState<OnayState, FormData>(kurumaTasi, { ok: false });
  const [kaldirDurum, kaldirEylem] = useActionState<OnayState, FormData>(atamayiKaldir, { ok: false });

  const [sekme, setSekme] = useState<Sekme>("bekleyen");
  const [secim, setSecim] = useState<Set<string>>(new Set());
  const [gerekce, setGerekce] = useState("");
  const [hedefKurum, setHedefKurum] = useState("");

  const gorunen = useMemo(
    () => adaylar.filter((a) =>
      sekme === "bekleyen" ? a.decision === null
      : sekme === "onayli" ? a.decision === "approved"
      : a.decision === "excluded"),
    [adaylar, sekme],
  );

  const toplamOnayli = kurumlar.reduce((t, k) => t + k.onayli, 0);
  const adresYok = secili && !secili.contact_email;

  function degistir(id: string) {
    setSecim((o) => { const y = new Set(o); y.has(id) ? y.delete(id) : y.add(id); return y; });
  }
  function hepsi() {
    setSecim((o) => o.size === gorunen.length ? new Set() : new Set(gorunen.map((a) => a.report_id)));
  }
  function sekmeDegistir(s: Sekme) { setSekme(s); setSecim(new Set()); }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-ink-900">Gönderim onayı</h1>
        <p className="mt-1 text-sm text-ink-500">
          Kuruma yalnızca burada onayladığınız bildirimler gider. Onaylamadığınız
          hiçbir şey kendiliğinden yola çıkmaz. Acil işaretli bildirimler bunun
          dışındadır — onlar kaydedilir kaydedilmez iletilir.
        </p>
      </header>

      {kararDurum.error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{kararDurum.error}</p>}
      {kararDurum.ok && kararDurum.message && <p role="status" className="rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-800">{kararDurum.message}</p>}
      {geriDurum.message && <p role="status" className="rounded-xl bg-surface-sunken px-3 py-2 text-sm text-ink-700">{geriDurum.message}</p>}
      {tasiDurum.error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{tasiDurum.error}</p>}
      {tasiDurum.ok && tasiDurum.message && <p role="status" className="rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-800">{tasiDurum.message}</p>}
      {kaldirDurum.message && <p role="status" className="rounded-xl bg-surface-sunken px-3 py-2 text-sm text-ink-700">{kaldirDurum.message}</p>}
      {gonderDurum.error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{gonderDurum.error}</p>}
      {gonderDurum.ok && gonderDurum.message && <p role="status" className="rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-800">{gonderDurum.message}</p>}

      <section className="grid grid-cols-3 gap-3">
        <Kutu baslik="Karar bekleyen" deger={kurumlar.reduce((t, k) => t + k.bekleyen, 0)} />
        <Kutu baslik="Gönderime hazır" deger={toplamOnayli} vurgu />
        <Kutu baslik="Listeden çıkarılan" deger={kurumlar.reduce((t, k) => t + k.haric, 0)} />
      </section>

      {toplamOnayli > 0 && (
        <form
          action={gonderEylem}
          onSubmit={(e) => {
            if (!confirm(
              `${toplamOnayli} onaylı bildirim ilgili kurumlara e-posta ile gönderilecek.\n\n`
              + "Bu işlem geri alınamaz. Devam edilsin mi?",
            )) e.preventDefault();
          }}
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-4"
        >
          <p className="min-w-0 flex-1 text-sm text-teal-900">
            <strong className="font-semibold">{toplamOnayli} bildirim</strong> gönderime hazır.
            Pazartesi sabahı kendiliğinden gidecek; beklemesin isterseniz şimdi gönderin.
          </p>
          <button
            type="submit"
            disabled={gonderBekliyor}
            className="h-10 shrink-0 rounded-xl bg-teal-700 px-4 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {gonderBekliyor ? "Gönderiliyor…" : "Onaylananları şimdi gönder"}
          </button>
        </form>
      )}

      <section>
        <h2 className="mb-3 text-base font-semibold text-ink-900">Kurumlar</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {kurumlar.map((k) => {
            const aktif = secili?.authority_id === k.authority_id;
            return (
              <li key={k.authority_id}>
                <Link
                  href={`/yonetim/gonderim-onayi?kurum=${k.authority_id}`}
                  aria-current={aktif ? "true" : undefined}
                  className={cx(
                    "flex items-center gap-3 rounded-2xl border p-3.5 transition",
                    aktif ? "border-ink-900 bg-white" : "border-line bg-white hover:border-line-strong",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">{k.authority_name}</p>
                    <p className="truncate text-2xs text-ink-400">
                      {k.contact_email ?? "e-posta adresi yok"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 text-2xs">
                    {k.bekleyen > 0 && (
                      <span className="rounded-full bg-ink-100 px-2 py-0.5 tabular-nums text-ink-700">
                        {k.bekleyen} bekliyor
                      </span>
                    )}
                    {k.onayli > 0 && (
                      <span className="rounded-full bg-teal-50 px-2 py-0.5 tabular-nums text-teal-700">
                        {k.onayli} hazır
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {!secili ? (
        <p className="rounded-2xl border border-dashed border-line bg-white/60 p-6 text-center text-sm text-ink-500">
          Kurum bulunamadı.
        </p>
      ) : (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold text-ink-900">{secili.authority_name}</h2>
            <p className="text-xs text-ink-500">
              Bu kurumun görev alanına giren, henüz iletilmemiş bildirimler
            </p>
          </div>

          {adresYok && (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Bu kurumun e-posta adresi tanımlı değil; onaylasanız da gönderim
              yapılamaz. Adresi{" "}
              <Link href="/yonetim/kurumlar" className="underline underline-offset-2">
                Kurumlar
              </Link>{" "}
              ekranından girin.
            </p>
          )}

          <div className="flex flex-wrap gap-1.5">
            {SEKMELER.map((s) => {
              const sayi = s.deger === "bekleyen" ? secili.bekleyen
                         : s.deger === "onayli" ? secili.onayli : secili.haric;
              return (
                <button
                  key={s.deger}
                  type="button"
                  onClick={() => sekmeDegistir(s.deger)}
                  className={cx(
                    "rounded-full px-3 py-1.5 text-xs transition",
                    sekme === s.deger ? "bg-ink-900 font-medium text-white" : "bg-white text-ink-600 hover:text-ink-900",
                  )}
                >
                  {s.etiket} <span className="tabular-nums opacity-70">{sayi}</span>
                </button>
              );
            })}
          </div>

          {gorunen.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line bg-white/60 p-6 text-center text-sm text-ink-500">
              {sekme === "bekleyen" ? "Karar bekleyen bildirim yok."
                : sekme === "onayli" ? "Onaylanmış bildirim yok."
                : "Listeden çıkarılmış bildirim yok."}
            </p>
          ) : (
            <form action={kararEylem} className="space-y-3">
              <input type="hidden" name="authorityId" value={secili.authority_id} />

              <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-sunken px-3.5 py-2.5">
                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
                  <input
                    type="checkbox"
                    checked={secim.size > 0 && secim.size === gorunen.length}
                    onChange={hepsi}
                    className="size-4 rounded border-line-strong"
                  />
                  Tümünü seç
                </label>
                <span className="text-xs tabular-nums text-ink-500">
                  {secim.size} / {gorunen.length} seçili
                </span>
              </div>

              <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
                {gorunen.map((a) => {
                  const ac = ACILIYET[a.urgency];
                  const secildi = secim.has(a.report_id);
                  return (
                    <li key={a.report_id} className={cx("p-3.5", secildi && "bg-surface-muted")}>
                      <div className="flex gap-3">
                        <input
                          type="checkbox"
                          name="reportIds"
                          value={a.report_id}
                          checked={secildi}
                          onChange={() => degistir(a.report_id)}
                          aria-label={`${a.title} seç`}
                          className="mt-0.5 size-4 shrink-0 rounded border-line-strong"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={cx("rounded-full px-2 py-0.5 text-2xs font-medium", ac.sinif)}>
                              {ac.etiket}
                            </span>
                            <span className="text-2xs text-ink-400">
                              {a.ref_code} · {a.category} · {a.neighborhood} · {timeAgo(a.created_at)}
                            </span>
                            {a.elle_atandi && (
                              <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-2xs text-ink-600">
                                elle atandı
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm font-medium text-ink-900">{a.title}</p>
                          {a.address && <p className="mt-0.5 text-xs text-ink-500">{a.address}</p>}
                          <div className="mt-1 flex flex-wrap items-center gap-3 text-2xs">
                            {a.support_count > 0 && (
                              <span className="text-ink-500 tabular-nums">{a.support_count} destek</span>
                            )}
                            <Link
                              href={`/sorun/${a.slug}`}
                              target="_blank"
                              className="text-ink-500 underline underline-offset-2 hover:text-ink-900"
                            >
                              Bildirimi aç
                            </Link>
                          </div>
                          {a.elle_atandi && (
                            <button
                              type="submit"
                              formAction={kaldirEylem}
                              name="reportId"
                              value={a.report_id}
                              formNoValidate
                              className="mt-1 text-2xs text-ink-500 underline underline-offset-2 hover:text-ink-900"
                            >
                              Kategorisinin kurumuna geri döndür
                            </button>
                          )}
                          {a.decision && (
                            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-surface-sunken px-2.5 py-1.5">
                              <span className="text-2xs text-ink-600">
                                {a.decision === "approved" ? "Onaylandı" : "Listeden çıkarıldı"}
                                {a.decided_at ? ` · ${timeAgo(a.decided_at)}` : ""}
                                {a.decision_note ? ` · ${a.decision_note}` : ""}
                              </span>
                              <button
                                type="submit"
                                formAction={geriEylem}
                                name="reportId"
                                value={a.report_id}
                                formNoValidate
                                className="ml-auto text-2xs text-ink-500 underline underline-offset-2 hover:text-ink-900"
                              >
                                Kararı geri al
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {secim.size > 0 && (
                <div className="sticky bottom-3 space-y-2 rounded-2xl border border-line bg-white p-3.5 shadow-card">
                  <p className="text-sm text-ink-700">
                    <strong className="font-semibold tabular-nums">{secim.size}</strong> bildirim seçili
                  </p>
                  <input
                    name="note"
                    value={gerekce}
                    onChange={(e) => setGerekce(e.target.value)}
                    placeholder="Gerekçe (listeden çıkarırken zorunlu)"
                    maxLength={300}
                    className="w-full rounded-xl border border-line px-3 py-2 text-sm"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      name="decision"
                      value="approved"
                      disabled={kararBekliyor}
                      className="h-10 rounded-xl bg-ink-900 px-4 text-sm font-medium text-white hover:bg-ink-800 disabled:opacity-60"
                    >
                      Gönderime onayla
                    </button>
                    <button
                      type="submit"
                      name="decision"
                      value="excluded"
                      disabled={kararBekliyor}
                      className="h-10 rounded-xl bg-white px-4 text-sm font-medium text-ink-700 ring-1 ring-line-strong hover:bg-surface-muted disabled:opacity-60"
                    >
                      Listeden çıkar
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                    <span className="text-xs text-ink-500">Yanlış kurumda mı?</span>
                    <select
                      name="hedefKurum"
                      value={hedefKurum}
                      onChange={(e) => setHedefKurum(e.target.value)}
                      className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-white px-3 text-sm"
                    >
                      <option value="">Kurum seçin…</option>
                      {secenekler
                        .filter((k) => k.id !== secili.authority_id)
                        .map((k) => (
                          <option key={k.id} value={k.id}>{k.name}</option>
                        ))}
                    </select>
                    <button
                      type="submit"
                      formAction={tasiEylem}
                      formNoValidate
                      disabled={!hedefKurum || tasiBekliyor}
                      className="h-10 rounded-xl bg-white px-4 text-sm font-medium text-ink-700 ring-1 ring-line-strong hover:bg-surface-muted disabled:opacity-60"
                    >
                      Bu kuruma taşı
                    </button>
                  </div>
                </div>
              )}
            </form>
          )}
        </section>
      )}
    </div>
  );
}
