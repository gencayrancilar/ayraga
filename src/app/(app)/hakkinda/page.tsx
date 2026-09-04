import type { Metadata } from "next";
import Link from "next/link";
import { AyraLogo } from "@/components/Logo";
import { getPlatformStats } from "@/lib/queries/reference";
import { formatNumber } from "@/lib/format";
import { IconArrowRight } from "@/components/icons";

export const metadata: Metadata = {
  title: "AYRA hakkında",
  description:
    "AYRA, Genç Ayrancılar Derneği tarafından geliştirilen bağımsız bir kent sorun takip platformudur. Belediye, siyasi parti veya şikâyet sitesi değildir.",
  alternates: { canonical: "/hakkinda" },
};

export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const stats = await getPlatformStats();

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <AyraLogo size="lg" />

      <h1 className="mt-6 text-3xl font-semibold leading-tight text-ink-900">
        Bir sorun görünür olduğunda çözülme ihtimali artar.
      </h1>

      <p className="mt-4 text-lg leading-relaxed text-ink-700">
        AYRA, yaşadığınız yerdeki sorunları harita üzerinde görünür kılan, komşularınızın
        desteğiyle önceliklendiren ve çözüm sürecini adım adım takip edilebilir hâle getiren
        bağımsız bir kent platformudur.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Gör", "Çevrenizdeki bildirimleri haritada görün."],
          ["Bildir", "Bir dakikadan kısa sürede sorun bildirin."],
          ["Destekle", "Aynı sorunu yaşayanlarla sesinizi birleştirin."],
          ["Takip et", "Kuruma ne iletildi, ne yanıt geldi — hepsi kayıtta."],
        ].map(([title, text]) => (
          <div key={title} className="rounded-2xl bg-white p-4 ring-1 ring-line">
            <p className="text-sm font-semibold text-ink-900">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-600">{text}</p>
          </div>
        ))}
      </div>

      <section className="mt-8 space-y-4 text-base leading-relaxed text-ink-700">
        <h2 className="text-xl font-semibold text-ink-900">AYRA ne değildir?</h2>
        <p>
          AYRA bir <strong className="font-medium text-ink-900">belediye uygulaması değildir</strong>.
          Hiçbir kurumun resmî kanalı değildir ve kurumlar adına taahhütte bulunmaz.
        </p>
        <p>
          AYRA bir <strong className="font-medium text-ink-900">siyasi parti uygulaması değildir</strong>.
          Hiçbir partiye bağlı değildir; siyasi propaganda içeren bildirimler yayımlanmaz.
        </p>
        <p>
          AYRA bir <strong className="font-medium text-ink-900">şikâyet sitesi değildir</strong>.
          Amaç öfke biriktirmek değil, sorunu tanımlamak, kayda geçirmek ve çözüm sürecini
          izlenebilir kılmaktır. Çözülen sorunlar da en az açık olanlar kadar görünürdür.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-ink-900">Nasıl çalışır?</h2>
        <ol className="ml-5 list-decimal space-y-2">
          <li>Bir vatandaş sorunu konumu ve fotoğrafıyla bildirir.</li>
          <li>Moderasyon bildirimi doğrular; kişisel veri ve kural dışı içerik yayımlanmaz.</li>
          <li>Aynı sorunu yaşayanlar destekler; destek sayısı önceliği belirler.</li>
          <li>Genç Ayrancılar Derneği sorunu ilgili kuruma resmî kanaldan iletir ve başvuru numarasını kaydeder.</li>
          <li>Gelen yanıt ve çözüm görseli sisteme işlenir. Tüm adımlar değiştirilemez bir kanıt zincirinde tutulur.</li>
        </ol>

        <h2 className="pt-4 text-xl font-semibold text-ink-900">Veriler kimin?</h2>
        <p>
          Bildirimler kamuya açıktır: herkes görebilir, gazeteciler ve araştırmacılar
          inceleyebilir. Yüklenen fotoğrafların konum ve cihaz bilgisi (EXIF) sunucuda
          otomatik olarak silinir. Kullanıcılar gerçek adlarını göstermeden katılabilir.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-ink-900">Nerede kullanılıyor?</h2>
        <p>
          Platform ilk olarak <strong className="font-medium text-ink-900">Ayrancılar (Torbalı / İzmir)</strong> için
          yayında. Altyapı, ilçe ve il ölçeğine genişleyebilecek biçimde tasarlandı.
        </p>
      </section>

      <div className="mt-8 rounded-2xl bg-ink-900 p-5 text-white">
        <p className="text-sm text-ink-200">Bugüne kadar</p>
        <p className="mt-1 text-lg font-medium">
          {formatNumber(stats.total_reports)} sorun bildirildi ·{" "}
          {formatNumber(stats.total_supports)} destek verildi ·{" "}
          {formatNumber(stats.resolved_reports)} sorun çözüldü
        </p>
        <Link
          href="/bildir"
          className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-medium text-ink-900"
        >
          Sorun bildir <IconArrowRight size={16} />
        </Link>
      </div>

      <p className="mt-6 text-xs text-ink-500">
        AYRA, Genç Ayrancılar Derneği tarafından geliştirilmektedir. Marka her zaman AYRA'dır;
        <span className="font-medium"> GA</span> derneğin imzasıdır.
      </p>
    </div>
  );
}
