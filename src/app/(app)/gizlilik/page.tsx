import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gizlilik",
  description: "AYRA hangi verileri toplar, hangilerini toplamaz.",
  alternates: { canonical: "/gizlilik" },
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-3xl font-semibold text-ink-900">Gizlilik</h1>
      <p className="mt-3 text-base leading-relaxed text-ink-700">
        AYRA, kamusal bir sorunu bildirmek için gereğinden fazla veri toplamaz.
        Aşağıdaki liste, sistemin gerçekte ne sakladığının tam dökümüdür.
      </p>

      <section className="mt-7 space-y-3">
        <h2 className="text-lg font-semibold text-ink-900">Toplanan veriler</h2>
        {[
          ["Görünen ad", "Sizin belirlediğiniz ad. Gerçek adınız olmak zorunda değildir."],
          ["E-posta (isteğe bağlı)", "Yalnızca hesabınızı cihazlar arasında taşımak isterseniz. Kamuya asla gösterilmez."],
          ["Bildirim içeriği", "Başlık, açıklama, kategori, seçtiğiniz konum ve yüklediğiniz görseller. Bunlar kamuya açıktır."],
          ["Destekler", "Hangi sorunu desteklediğiniz. Destek sayısı herkese açık, kimin desteklediği yalnızca sistem içindir."],
        ].map(([title, detail]) => (
          <div key={title} className="rounded-xl bg-white p-3.5 ring-1 ring-line">
            <p className="text-sm font-medium text-ink-900">{title}</p>
            <p className="mt-0.5 text-sm text-ink-600">{detail}</p>
          </div>
        ))}
      </section>

      <section className="mt-7 space-y-3">
        <h2 className="text-lg font-semibold text-ink-900">Toplanmayan veriler</h2>
        {[
          ["Fotoğrafların EXIF verisi", "Yüklenen her görselin konum, cihaz ve çekim zamanı bilgisi sunucuda silinir. Konum yalnızca haritada sizin onayladığınız noktadır."],
          ["Ham IP adresi", "Kötüye kullanımı sınırlamak için IP adresinin yalnızca geri döndürülemez özeti tutulur, adresin kendisi saklanmaz."],
          ["Reklam ve takip çerezleri", "Üçüncü taraf analitik veya reklam altyapısı kullanılmaz."],
          ["Sürekli konum takibi", "Konumunuz yalnızca siz istediğinizde, o an için okunur; saklanmaz."],
        ].map(([title, detail]) => (
          <div key={title} className="rounded-xl bg-white p-3.5 ring-1 ring-line">
            <p className="text-sm font-medium text-ink-900">{title}</p>
            <p className="mt-0.5 text-sm text-ink-600">{detail}</p>
          </div>
        ))}
      </section>

      <section className="mt-7 space-y-3 text-sm leading-relaxed text-ink-700">
        <h2 className="text-lg font-semibold text-ink-900">Haklarınız</h2>
        <p>
          KVKK kapsamında verilerinize erişme, düzeltme ve silinmesini isteme hakkınız vardır.
          Bir bildiriminizin kaldırılmasını isterseniz dernekle iletişime geçebilirsiniz.
          Kaldırılan bildirimlerde kanıt zincirindeki kayıt, içerik olmadan &quot;kaldırıldı&quot;
          olarak kalır; sürecin bütünlüğü bu şekilde korunur.
        </p>
        <p className="text-xs text-ink-500">
          Bu sayfa bilgilendirme amaçlıdır ve hukuki metin yerine geçmez.
          Yayın öncesi bir hukukçu tarafından gözden geçirilmelidir.
        </p>
      </section>
    </div>
  );
}
