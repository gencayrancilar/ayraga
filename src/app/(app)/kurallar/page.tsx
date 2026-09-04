import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Topluluk kuralları",
  description: "AYRA'da hangi bildirimler yayımlanır, hangileri yayımlanmaz.",
  alternates: { canonical: "/kurallar" },
};

const ALLOWED = [
  "Kamusal alanda herkesi etkileyen somut bir sorun",
  "Konumu ve tarifi net bildirimler",
  "Sorunu gösteren, kişi içermeyen fotoğraflar",
  "Yapıcı ve nesnel bir dil",
];

const BLOCKED = [
  ["Kişisel veri", "İnsanların yüzleri, araç plakaları, ev adresleri, telefon numaraları."],
  ["Hakaret ve nefret söylemi", "Kişi, kurum çalışanı veya topluluklara yönelik aşağılayıcı ifadeler."],
  ["Siyasi propaganda", "Parti, aday veya seçim çağrısı içeren içerikler."],
  ["Ticari reklam", "Ürün, hizmet veya işletme tanıtımı."],
  ["Sahte bildirim", "Var olmayan veya çarpıtılmış durumlar."],
  ["Komşuluk anlaşmazlıkları", "Bireyler arasındaki özel uyuşmazlıklar kamusal sorun değildir."],
  ["Acil durumlar", "Yangın, sağlık, güvenlik acilleri için 112'yi arayın; AYRA acil çağrı hattı değildir."],
];

export default function RulesPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-3xl font-semibold text-ink-900">Topluluk kuralları</h1>
      <p className="mt-3 text-base leading-relaxed text-ink-700">
        AYRA'nın işe yaraması, bildirimlerin kurumlara güvenle iletilebilir olmasına bağlı.
        Bu yüzden kurallar dar ve nettir.
      </p>

      <section className="mt-7">
        <h2 className="text-lg font-semibold text-ink-900">Yayımlanır</h2>
        <ul className="mt-3 space-y-2">
          {ALLOWED.map((item) => (
            <li key={item} className="flex items-start gap-2.5 rounded-xl bg-white p-3 text-sm text-ink-700 ring-1 ring-line">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-teal-500" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-7">
        <h2 className="text-lg font-semibold text-ink-900">Yayımlanmaz</h2>
        <ul className="mt-3 space-y-2">
          {BLOCKED.map(([title, detail]) => (
            <li key={title} className="rounded-xl bg-white p-3.5 ring-1 ring-line">
              <p className="text-sm font-medium text-ink-900">{title}</p>
              <p className="mt-0.5 text-sm text-ink-600">{detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-7 space-y-3 text-sm leading-relaxed text-ink-700">
        <h2 className="text-lg font-semibold text-ink-900">Moderasyon nasıl işler?</h2>
        <p>
          Her bildirim yayına girdikten sonra moderasyon incelemesinden geçer. Kurallara
          aykırı bulunan içerikler yayından kaldırılır; aynı konudaki bildirimler birleştirilir.
          Herkes bir bildirimi &quot;Bu içeriği bildir&quot; bağlantısıyla moderasyona iletebilir.
        </p>
        <p>
          Tekrar eden ihlallerde hesap askıya alınabilir. Kararlara itiraz için dernekle
          iletişime geçebilirsiniz.
        </p>
      </section>
    </div>
  );
}
