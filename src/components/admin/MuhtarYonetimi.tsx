"use client";

import { useActionState } from "react";
import Link from "next/link";
import { muhtarGoreviBitir, duyuruGizle, type YonetimState } from "@/lib/actions/muhtar-yonetim";
import { formatDate, timeAgo } from "@/lib/format";

type Muhtar = {
  id: string; title: string; is_active: boolean; created_at: string; term_end: string | null;
  display_name: string; email: string | null; neighborhood_name: string;
  duyuru_sayisi: number; yanit_sayisi: number;
};
type Duyuru = {
  id: string; title: string; body: string; kind: string; created_at: string;
  is_hidden: boolean; hidden_reason: string | null;
  neighborhood_name: string; author_name: string | null;
};

export function MuhtarYonetimi({
  muhtarlar, duyurular,
}: {
  muhtarlar: Muhtar[];
  duyurular: Duyuru[];
}) {
  const [, bitirEylem] = useActionState<YonetimState, FormData>(muhtarGoreviBitir, { ok: false });
  const [gizleDurum, gizleEylem, gizleBekliyor] = useActionState<YonetimState, FormData>(duyuruGizle, { ok: false });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-ink-900">Muhtarlar</h1>
        <p className="mt-1 text-sm text-ink-500">
          Muhtar kendi mahallesini görür, duyuru yazar ve bildirimlere resmî
          yanıt verir; bir bildirimin durumunu değiştiremez.
        </p>
      </header>

      <div className="rounded-2xl border border-line bg-white p-5">
        <h2 className="text-base font-semibold text-ink-900">Muhtar nasıl atanır</h2>
        <ol className="mt-2 space-y-1.5 text-sm text-ink-600">
          <li>1. Muhtar, ayraga.com&apos;dan herkes gibi kendi hesabını açar (e-posta ve parolayla).</li>
          <li>2. Siz <strong className="font-medium text-ink-900">Katılanlar</strong> ekranından o hesabı bulup “Muhtar yap” dersiniz.</li>
          <li>3. Kişi bir daha giriş yaptığında muhtar paneli açılır.</li>
        </ol>
        <Link
          href="/yonetim/kullanicilar?tur=kalici"
          className="mt-4 inline-flex rounded-xl bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white"
        >
          Katılanlara git
        </Link>
      </div>

      <section>
        <h2 className="mb-3 text-base font-semibold text-ink-900">Görevli muhtarlar</h2>
        {muhtarlar.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-white/60 p-6 text-center text-sm text-ink-500">
            Henüz muhtar hesabı yok.
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
            {muhtarlar.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink-900">
                    {m.display_name}
                    {!m.is_active && <span className="ml-2 text-xs font-normal text-ink-400">görevi bitti</span>}
                  </p>
                  <p className="text-xs text-ink-500">
                    {m.neighborhood_name} · {m.title} · {m.email ?? "e-posta yok"}
                  </p>
                  <p className="mt-0.5 text-2xs text-ink-400">
                    {m.duyuru_sayisi} duyuru · {m.yanit_sayisi} resmî yanıt · {formatDate(m.created_at)}&apos;dan beri
                  </p>
                </div>
                {m.is_active && (
                  <form action={bitirEylem}>
                    <input type="hidden" name="id" value={m.id} />
                    <button type="submit" className="rounded-lg px-2.5 py-1.5 text-xs text-ink-500 hover:bg-surface-sunken hover:text-ink-900">
                      Erişimi kapat
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-base font-semibold text-ink-900">Son duyurular</h2>
        <p className="mb-3 text-sm text-ink-500">
          Duyurular onay beklemeden yayımlanır. Kural dışı olanı gerekçesini
          yazarak kaldırın; gerekçe muhtarın panelinde görünür.
        </p>
        {gizleDurum.error && <p role="alert" className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{gizleDurum.error}</p>}
        {gizleDurum.ok && gizleDurum.message && <p role="status" className="mb-3 rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-800">{gizleDurum.message}</p>}

        {duyurular.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-white/60 p-6 text-center text-sm text-ink-500">
            Henüz duyuru yok.
          </p>
        ) : (
          <ul className="space-y-3">
            {duyurular.map((d) => (
              <li key={d.id} className={"rounded-2xl border p-4 " + (d.is_hidden ? "border-red-200 bg-red-50/40" : "border-line bg-white")}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-ink-900">{d.title}</p>
                  <span className="text-2xs text-ink-400">
                    {d.neighborhood_name} · {d.author_name ?? "—"} · {timeAgo(d.created_at)}
                  </span>
                </div>
                <p className="mt-1.5 whitespace-pre-line text-sm text-ink-600">{d.body}</p>

                {d.is_hidden ? (
                  <p className="mt-3 text-xs text-red-800">Kaldırıldı — {d.hidden_reason}</p>
                ) : (
                  <form action={gizleEylem} className="mt-3 flex flex-wrap gap-2">
                    <input type="hidden" name="id" value={d.id} />
                    <input
                      name="reason"
                      required
                      minLength={5}
                      maxLength={300}
                      placeholder="Kaldırma gerekçesi (muhtara görünür)"
                      className="min-w-0 flex-1 rounded-xl border border-line px-3 py-2 text-xs"
                    />
                    <button type="submit" disabled={gizleBekliyor}
                      className="rounded-xl border border-line px-3 py-2 text-xs text-ink-700 hover:bg-surface-sunken disabled:opacity-60">
                      Yayından kaldır
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
