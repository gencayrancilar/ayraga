"use client";

import { useEffect, useState } from "react";

/**
 * Ana ekrana ekleme rehberi.
 *
 * Dürüstlük notu: Android/Chrome'da tarayıcı gerçek bir kurulum çağrısı sunar
 * (beforeinstallprompt), o yüzden orada düğme gerçekten kurar. iOS'ta böyle bir
 * API yoktur — Apple, web sayfasının "ana ekrana ekle"yi tetiklemesine izin
 * vermez. Bu yüzden iOS tarafında kurulum düğmesi göstermiyoruz; çalışmayan
 * bir düğme, olmayan bir düğmeden kötüdür. Onun yerine adımları,
 * kullanıcının ekranda gerçekten göreceği simgelerle anlatıyoruz.
 */

type Platform = "ios" | "android" | "masaustu";
type Hedef = "ios" | "android" | "auto";

type Durum =
  | { tip: "yukleniyor" }
  | { tip: "kurulu" }
  | { tip: "ios-safari" }
  | { tip: "ios-baska-tarayici"; tarayici: string }
  | { tip: "android-hazir" }          // beforeinstallprompt yakalandı
  | { tip: "android-elle" }           // olay yok; menüden kurulacak
  | { tip: "masaustu" };

/**
 * Sayfa adresi (/kur/ios, /kur/android) yalnızca paylaşım kolaylığı içindir;
 * kararı her zaman elimizdeki gerçek cihaz verir. Android bağlantısı bir
 * WhatsApp grubunda dolaşıp iPhone'da açıldığında kişi işe yaramaz adımlar
 * görmesin diye böyle.
 */

interface YuklemeOlayi extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function platformBul(): Platform {
  if (typeof navigator === "undefined") return "masaustu";
  const ua = navigator.userAgent;
  const iosBenzeri =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (iosBenzeri) return "ios";
  if (/Android/.test(ua)) return "android";
  return "masaustu";
}

/** iOS'ta "Ana Ekrana Ekle" yalnızca gerçek Safari'de vardır. */
function iosTarayici(): { safari: boolean; ad: string } {
  const ua = navigator.userAgent;
  if (/CriOS/.test(ua)) return { safari: false, ad: "Chrome" };
  if (/FxiOS/.test(ua)) return { safari: false, ad: "Firefox" };
  if (/EdgiOS/.test(ua)) return { safari: false, ad: "Edge" };
  if (/OPiOS|OPT\//.test(ua)) return { safari: false, ad: "Opera" };
  if (/Instagram/.test(ua)) return { safari: false, ad: "Instagram" };
  if (/FBAN|FBAV/.test(ua)) return { safari: false, ad: "Facebook" };
  if (/WhatsApp/.test(ua)) return { safari: false, ad: "WhatsApp" };
  if (/Twitter/.test(ua)) return { safari: false, ad: "X" };
  if (/Line\//.test(ua)) return { safari: false, ad: "LINE" };
  return { safari: true, ad: "Safari" };
}

function kuruluMu(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return Boolean(iosStandalone) || window.matchMedia("(display-mode: standalone)").matches;
}

export function KurulumRehberi({ hedef = "auto" }: { hedef?: Hedef }) {
  const [durum, setDurum] = useState<Durum>({ tip: "yukleniyor" });
  const [olay, setOlay] = useState<YuklemeOlayi | null>(null);
  const [kopyalandi, setKopyalandi] = useState(false);
  const [sonuc, setSonuc] = useState<string | null>(null);
  const [uyusmazlik, setUyusmazlik] = useState<"ios" | "android" | null>(null);

  useEffect(() => {
    if (kuruluMu()) {
      setDurum({ tip: "kurulu" });
      return;
    }

    const gercek = platformBul();

    if (gercek === "ios") {
      const t = iosTarayici();
      setDurum(t.safari ? { tip: "ios-safari" } : { tip: "ios-baska-tarayici", tarayici: t.ad });
      setUyusmazlik(hedef === "android" ? "ios" : null);
      return;
    }

    if (gercek === "android") {
      setDurum({ tip: "android-elle" });
      setUyusmazlik(hedef === "ios" ? "android" : null);
      return;
    }

    // Masaüstü: kurulum burada da mümkün (Chrome/Edge), ama asıl amaç
    // telefona geçirmek. beforeinstallprompt gelirse aşağıdaki dinleyici
    // durumu kendiliğinden "android-hazir"a çevirir.
    setDurum({ tip: "masaustu" });
  }, [hedef]);

  useEffect(() => {
    const yakala = (e: Event) => {
      e.preventDefault();
      setOlay(e as YuklemeOlayi);
      setDurum((d) => (d.tip === "android-elle" || d.tip === "masaustu" ? { tip: "android-hazir" } : d));
    };
    const kuruldu = () => setDurum({ tip: "kurulu" });
    window.addEventListener("beforeinstallprompt", yakala);
    window.addEventListener("appinstalled", kuruldu);
    return () => {
      window.removeEventListener("beforeinstallprompt", yakala);
      window.removeEventListener("appinstalled", kuruldu);
    };
  }, []);

  async function kur() {
    if (!olay) return;
    await olay.prompt();
    const secim = await olay.userChoice;
    setOlay(null);
    if (secim.outcome === "accepted") {
      setDurum({ tip: "kurulu" });
    } else {
      setSonuc("Kurulum iptal edildi. Aşağıdaki adımlarla menüden de ekleyebilirsiniz.");
      setDurum({ tip: "android-elle" });
    }
  }

  async function baglantiyiKopyala() {
    try {
      await navigator.clipboard.writeText(window.location.origin + "/kur");
      setKopyalandi(true);
      setTimeout(() => setKopyalandi(false), 2500);
    } catch {
      setSonuc("Bağlantı kopyalanamadı; adres çubuğundaki adresi elle kopyalayın.");
    }
  }

  if (durum.tip === "yukleniyor") {
    return <div className="h-40 animate-pulse rounded-2xl bg-surface-sunken" aria-hidden />;
  }

  const uyari = uyusmazlik && (
    <p className="mb-4 rounded-xl border border-ink-100 bg-ink-50 px-4 py-3 text-sm text-ink-600">
      {uyusmazlik === "ios"
        ? "Telefonunuz iPhone görünüyor; Android adımları yerine iPhone adımlarını gösteriyoruz."
        : "Telefonunuz Android görünüyor; iPhone adımları yerine Android adımlarını gösteriyoruz."}
    </p>
  );

  if (durum.tip === "kurulu") {
    return (
      <Kutu>
        {uyari}
        <Basarili />
        <h2 className="text-lg font-semibold text-ink-900">AYRA zaten kurulu</h2>
        <p className="mt-1 text-sm text-ink-500">
          Bu sayfayı uygulamanın içinden açtınız. Ana ekranınızdaki AYRA simgesinden
          her zaman ulaşabilirsiniz.
        </p>
        <a
          href="/"
          className="mt-5 inline-flex items-center justify-center rounded-xl bg-ink-900 px-5 py-3 text-sm font-medium text-white"
        >
          Haritaya git
        </a>
      </Kutu>
    );
  }

  if (durum.tip === "android-hazir") {
    return (
      <Kutu>
        {uyari}
        <p className="text-sm text-ink-500">Tarayıcınız doğrudan kurulumu destekliyor.</p>
        <button
          type="button"
          onClick={kur}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-5 py-4 text-base font-semibold text-white transition hover:bg-teal-700 active:bg-teal-800"
        >
          <IndirSimgesi />
          Ana ekrana ekle
        </button>
        <p className="mt-3 text-xs text-ink-400">
          Tek dokunuş. Açılan kutuda “Yükle”yi onaylamanız yeterli.
        </p>
      </Kutu>
    );
  }

  if (durum.tip === "android-elle") {
    return (
      <Kutu>
        {uyari}
        {sonuc && <p className="mb-3 rounded-lg bg-surface-sunken px-3 py-2 text-xs text-ink-500">{sonuc}</p>}
        <p className="text-sm text-ink-500">
          Chrome bu sayfada kurulum kutusunu kendiliğinden açmadı. Üç adımda ekleyebilirsiniz:
        </p>
        <Adimlar
          adimlar={[
            { n: 1, metin: "Chrome'un sağ üstündeki üç noktaya dokunun.", ikon: <UcNokta /> },
            { n: 2, metin: "“Uygulamayı yükle” ya da “Ana ekrana ekle”yi seçin.", ikon: <IndirSimgesi /> },
            { n: 3, metin: "“Yükle”yi onaylayın. AYRA ana ekranınıza gelir.", ikon: <Onay /> },
          ]}
        />
      </Kutu>
    );
  }

  if (durum.tip === "ios-baska-tarayici") {
    return (
      <Kutu>
        {uyari}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            Bu sayfayı {durum.tarayici} içinde açtınız.
          </p>
          <p className="mt-1 text-sm text-amber-800">
            iPhone’da ana ekrana ekleme yalnızca Safari’de çalışır — Apple başka
            tarayıcılara bu izni vermiyor. Bağlantıyı kopyalayıp Safari’de açın.
          </p>
        </div>
        <button
          type="button"
          onClick={baglantiyiKopyala}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ink-900 px-5 py-4 text-base font-semibold text-white"
        >
          {kopyalandi ? "Kopyalandı ✓" : "Bağlantıyı kopyala"}
        </button>
        <p className="mt-3 text-xs text-ink-400">
          Safari’yi açın, adres çubuğuna yapıştırın, sonra aşağıdaki adımları izleyin.
        </p>
        <IosAdimlari />
      </Kutu>
    );
  }

  if (durum.tip === "masaustu") {
    return (
      <Kutu>
        {uyari}
        <p className="text-sm text-ink-500">
          Bu sayfayı bilgisayardan açtınız. AYRA’yı telefonunuzun ana ekranına eklemek
          için telefonunuzun kamerasıyla aşağıdaki kareyi okutun.
        </p>
        <div className="mt-4 flex justify-center">
          <img
            src={hedef === "ios" ? "/qr/kur-ios.svg" : hedef === "android" ? "/qr/kur-android.svg" : "/qr/kur.svg"}
            alt={`ayraga.com${hedef === "auto" ? "/kur" : `/kur/${hedef}`} adresine giden kare kod`}
            width={180}
            height={180}
            className="rounded-xl border border-line bg-white p-3"
          />
        </div>
        <p className="mt-3 text-center text-xs text-ink-400">
            ayraga.com{hedef === "auto" ? "/kur" : `/kur/${hedef}`}
          </p>
      </Kutu>
    );
  }

  // ios-safari
  return (
    <Kutu>
      {uyari}
      <p className="text-sm text-ink-500">
        iPhone ve iPad’de ekleme üç dokunuş sürüyor. Apple, web sayfalarının bunu
        kendi başına yapmasına izin vermediği için adımları sizin yapmanız gerekiyor.
      </p>
      <IosAdimlari />
    </Kutu>
  );
}

/* ─────────────────────────── parçalar ─────────────────────────── */

function Kutu({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm sm:p-6">{children}</div>
  );
}

function IosAdimlari() {
  return (
    <Adimlar
      adimlar={[
        { n: 1, metin: "Ekranın altındaki Paylaş simgesine dokunun.", ikon: <PaylasSimgesi /> },
        { n: 2, metin: "Listeyi kaydırıp “Ana Ekrana Ekle”yi seçin.", ikon: <ArtiKare /> },
        { n: 3, metin: "Sağ üstteki “Ekle”ye dokunun. AYRA ana ekranınıza gelir.", ikon: <Onay /> },
      ]}
    />
  );
}

function Adimlar({ adimlar }: { adimlar: Array<{ n: number; metin: string; ikon: React.ReactNode }> }) {
  return (
    <ol className="mt-5 space-y-3">
      {adimlar.map((a) => (
        <li key={a.n} className="flex items-start gap-3 rounded-xl bg-surface-muted p-3.5">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-ink-900 text-xs font-semibold text-white">
            {a.n}
          </span>
          <span className="flex-1 text-sm leading-6 text-ink-700">{a.metin}</span>
          <span className="mt-0.5 shrink-0 text-ink-400">{a.ikon}</span>
        </li>
      ))}
    </ol>
  );
}

function PaylasSimgesi() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 15V3" /><path d="m8 7 4-4 4 4" />
      <path d="M20 14v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5" />
    </svg>
  );
}
function ArtiKare() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" /><path d="M12 8.5v7M8.5 12h7" />
    </svg>
  );
}
function UcNokta() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" />
    </svg>
  );
}
function IndirSimgesi() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v12" /><path d="m7 11 5 5 5-5" /><path d="M4 20h16" />
    </svg>
  );
}
function Onay() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m4.5 12.5 5 5 10-11" />
    </svg>
  );
}
function Basarili() {
  return (
    <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-teal-50 text-teal-600">
      <Onay />
    </div>
  );
}
