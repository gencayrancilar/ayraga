"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { muhtarAta, muhtarGoreviBitir, type YonetimState } from "@/lib/actions/muhtar-yonetim";
import type { KullaniciSatiri, KatilimOzeti } from "@/lib/queries/kullanicilar";
import { formatDate, timeAgo } from "@/lib/format";
import { cx } from "@/lib/utils";

const TURLER = [
  { deger: "hepsi", etiket: "Hepsi" },
  { deger: "kalici", etiket: "E-postalı" },
  { deger: "takma", etiket: "Takma adlı" },
  { deger: "muhtar", etiket: "Muhtar" },
  { deger: "yetkili", etiket: "Yetkili" },
] as const;

function Kutu({ baslik, deger }: { baslik: string; deger: number }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <p className="text-xs text-ink-500">{baslik}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{deger}</p>
    </div>
  );
}

export function KullaniciListesi({
  ozet, kullanicilar, mahalleler, arama, tur,
}: {
  ozet: KatilimOzeti;
  kullanicilar: KullaniciSatiri[];
  mahalleler: Array<{ id: string; name: string }>;
  arama: string;
  tur: string;
}) {
  const [ataDurum, ataEylem, ataBekliyor] = useActionState<YonetimState, FormData>(muhtarAta, { ok: false });
  const [bitirDurum, bitirEylem] = useActionState<YonetimState, FormData>(muhtarGoreviBitir, { ok: false });
  const [acik, setAcik] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-ink-900">Katılanlar</h1>
        <p className="mt-1 text-sm text-ink-500">
          AYRA&apos;ya katılan hesaplar, en yenisi üstte. Bir hesabı mahallenin
          muhtarı olarak buradan işaretlersiniz — ayrı bir muhtar hesabı açmaya
          gerek yok, kişi herkes gibi kendi hesabıyla girer.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kutu baslik="Toplam" deger={ozet.toplam} />
        <Kutu baslik="Bugün" deger={ozet.bugun} />
        <Kutu baslik="Bu hafta" deger={ozet.bu_hafta} />
        <Kutu baslik="Bu ay" deger={ozet.bu_ay} />
        <Kutu baslik="E-postalı" deger={ozet.kalici} />
        <Kutu baslik="Muhtar" deger={ozet.muhtar} />
      </section>

      <form method="get" className="flex flex-wrap gap-2">
        <input
          name="q"
          defaultValue={arama}
          placeholder="Ad, e-posta veya kullanıcı adı ara"
          className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2 text-sm"
        />
        <input type="hidden" name="tur" value={tur} />
        <button type="submit" className="rounded-xl border border-line bg-white px-4 py-2 text-sm text-ink-700 hover:bg-surface-sunken">
          Ara
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {TURLER.map((t) => (
          <Link
            key={t.deger}
            href={`/yonetim/kullanicilar?tur=${t.deger}${arama ? `&q=${encodeURIComponent(arama)}` : ""}`}
            className={cx(
              "rounded-full px-3 py-1.5 text-xs transition",
              tur === t.deger ? "bg-ink-900 font-medium text-white" : "bg-white text-ink-600 hover:text-ink-900",
            )}
          >
            {t.etiket}
          </Link>
        ))}
      </div>

      {ataDurum.error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{ataDurum.error}</p>}
      {ataDurum.ok && ataDurum.message && <p role="status" className="rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-800">{ataDurum.message}</p>}
      {bitirDurum.ok && bitirDurum.message && <p role="status" className="rounded-xl bg-surface-sunken px-3 py-2 text-sm text-ink-700">{bitirDurum.message}</p>}

      <p className="text-xs text-ink-400">{kullanicilar.length} hesap</p>

      {kullanicilar.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-white/60 p-6 text-center text-sm text-ink-500">
          Bu süzgeçle hesap bulunamadı.
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          {kullanicilar.map((k) => (
            <li key={k.id} className="p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-900">
                    {k.display_name}
                    {k.muhtar_mahalle && (
                      <span className="ml-2 rounded-full bg-teal-50 px-2 py-0.5 text-2xs font-medium text-teal-700">
                        {k.muhtar_mahalle} muhtarı
                      </span>
                    )}
                    {(k.role === "admin" || k.role === "moderator") && (
                      <span className="ml-2 rounded-full bg-ink-100 px-2 py-0.5 text-2xs text-ink-700">
                        {k.role === "admin" ? "Yönetici" : "Moderatör"}
                      </span>
                    )}
                    {k.is_banned && (
                      <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-2xs text-red-700">askıda</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {k.email ?? "takma adlı — e-posta yok"} · katıldı {timeAgo(k.created_at)}
                    {k.son_giris ? ` · son giriş ${formatDate(k.son_giris)}` : ""}
                  </p>
                  <p className="mt-0.5 text-2xs text-ink-400">
                    {k.bildirim} bildirim · {k.destek} destek
                  </p>
                </div>

                <div className="flex shrink-0 gap-2">
                  {k.official_id ? (
                    <form action={bitirEylem}>
                      <input type="hidden" name="id" value={k.official_id} />
                      <button type="submit" className="rounded-lg px-2.5 py-1.5 text-xs text-ink-500 hover:bg-surface-sunken hover:text-ink-900">
                        Muhtarlığı bitir
                      </button>
                    </form>
                  ) : k.is_anonymous || !k.email ? (
                    // Takma adlı hesap yalnızca tarayıcı çerezinde yaşar; başka
                    // cihazdan girilemez. Çalışmayacak bir düğme göstermiyoruz.
                    <span className="text-2xs text-ink-400">e-posta eklenmeli</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAcik(acik === k.id ? null : k.id)}
                      className="rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink-700 hover:bg-surface-sunken"
                    >
                      {acik === k.id ? "Vazgeç" : "Muhtar yap"}
                    </button>
                  )}
                </div>
              </div>

              {acik === k.id && !k.official_id && (
                <form action={ataEylem} className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-surface-muted p-3">
                  <input type="hidden" name="profileId" value={k.id} />
                  <label className="min-w-40 flex-1">
                    <span className="mb-1 block text-2xs font-medium text-ink-600">Mahalle</span>
                    <select name="neighborhoodId" required className="w-full rounded-lg border border-line px-2.5 py-2 text-xs">
                      <option value="">Seçin…</option>
                      {mahalleler.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </label>
                  <label className="min-w-40 flex-1">
                    <span className="mb-1 block text-2xs font-medium text-ink-600">Unvan (isteğe bağlı)</span>
                    <input name="title" maxLength={60} placeholder="Mahalle Muhtarı"
                      className="w-full rounded-lg border border-line px-2.5 py-2 text-xs" />
                  </label>
                  <button type="submit" disabled={ataBekliyor}
                    className="rounded-lg bg-ink-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-60">
                    {ataBekliyor ? "Atanıyor…" : "Ata"}
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
