"use client";

import { useActionState } from "react";
import { kategoriKurumuAta, type OnayState } from "@/lib/actions/gonderim-onayi";
import type { YonlendirmeSatiri, KurumSecenegi } from "@/lib/queries/gonderim-onayi";
import { cx } from "@/lib/utils";

/**
 * Kategori → kurum yönlendirmesi.
 *
 * Yanlış kuruma giden bildirimlerin kaynağı çoğunlukla burasıdır: alt kategori
 * kendi kurumunu tanımlamadığında üst kategorininkine düşer, o da genellikle
 * belediyedir. Devralınmış satırlar bu yüzden ayrıca işaretlenir — düzeltilmesi
 * gereken yer önce onlardır.
 */
export function Yonlendirme({
  satirlar, kurumlar,
}: {
  satirlar: YonlendirmeSatiri[];
  kurumlar: KurumSecenegi[];
}) {
  const [durum, eylem, bekliyor] = useActionState<OnayState, FormData>(kategoriKurumuAta, { ok: false });

  const devralinan = satirlar.filter((s) => !s.dogrudan);
  const kurumsuz = satirlar.filter((s) => !s.authority_id);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-ink-900">Yönlendirme</h1>
        <p className="mt-1 text-sm text-ink-500">
          Bir bildirimin hangi kuruma gideceğini kategorisi belirler. Kategorinin
          kendi eşlemesi yoksa üst kategorisininki geçerli olur — çoğu sorunun
          belediyeye düşmesinin sebebi budur. Burada yaptığınız düzeltme o
          kategorinin bütün gelecek bildirimleri için geçerlidir.
        </p>
      </header>

      {durum.error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{durum.error}</p>}
      {durum.ok && durum.message && <p role="status" className="rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-800">{durum.message}</p>}

      {kurumsuz.length > 0 && (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <h2 className="text-sm font-semibold text-red-900">Hiçbir kuruma bağlı olmayan kategoriler</h2>
          <p className="mt-1 text-sm text-red-800">
            Bu kategorilerdeki bildirimler hiçbir kuruma gönderilemez; kuyrukta
            görünmeden birikirler.
          </p>
          <ul className="mt-2 space-y-1">
            {kurumsuz.map((s) => (
              <li key={s.category_id} className="text-sm text-red-900">
                {s.parent_name ? `${s.parent_name} · ` : ""}{s.category_name}
                {s.acik_bildirim > 0 ? ` — ${s.acik_bildirim} açık bildirim` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      {devralinan.length > 0 && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <strong className="font-semibold">{devralinan.length} kategori</strong> kurumunu üst
          kategorisinden devralıyor. Aşağıda &quot;devralınmış&quot; işaretli satırlar bunlar;
          elektrik, su, telekom gibi ayrı kurumu olan konular buradaysa yanlış yere gidiyor demektir.
        </p>
      )}

      <section className="overflow-hidden rounded-2xl border border-line bg-white">
        <ul className="divide-y divide-line">
          {satirlar.map((s) => (
            <li key={s.category_id} className="flex flex-wrap items-center gap-3 p-3.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink-900">
                  {s.parent_name && <span className="text-ink-400">{s.parent_name} · </span>}
                  {s.category_name}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-2xs">
                  <span className={cx(s.authority_name ? "text-ink-500" : "font-medium text-red-700")}>
                    {s.authority_name ?? "kurum atanmamış"}
                  </span>
                  {!s.dogrudan && s.authority_name && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">devralınmış</span>
                  )}
                  {s.acik_bildirim > 0 && (
                    <span className="text-ink-400 tabular-nums">{s.acik_bildirim} açık bildirim</span>
                  )}
                </p>
              </div>

              <form action={eylem} className="flex shrink-0 items-center gap-2">
                <input type="hidden" name="categoryId" value={s.category_id} />
                <select
                  name="authorityId"
                  defaultValue={s.dogrudan && s.authority_id ? s.authority_id : ""}
                  aria-label={`${s.category_name} için kurum`}
                  className="h-9 rounded-lg border border-line bg-white px-2 text-sm"
                >
                  <option value="">Seçin…</option>
                  {kurumlar.map((k) => (
                    <option key={k.id} value={k.id}>{k.short_name ?? k.name}</option>
                  ))}
                </select>
                <button
                  type="submit"
                  disabled={bekliyor}
                  className="h-9 rounded-lg bg-white px-3 text-sm font-medium text-ink-700 ring-1 ring-line-strong hover:bg-surface-muted disabled:opacity-60"
                >
                  Ata
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
