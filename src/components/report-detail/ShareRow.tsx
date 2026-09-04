"use client";

import { useState } from "react";
import {
  tamMetin, kisaMetin, altYaziMetni, konumSatiri, haritaUrl, koordinat,
  type PaylasimVerisi,
} from "@/lib/paylasim";
import { IconShare, IconLink, IconCheck, IconPin, IconSpinner, IconCamera } from "../icons";

/**
 * Paylaşım.
 *
 * İki ayrı iş var ve ikisi de konumu taşır:
 *   · bağlantı paylaşımı — metnin içinde adres, koordinat ve harita bağlantısı
 *   · görsel paylaşımı   — konumun basılı olduğu hikâye/kare görsel
 *
 * Instagram hikâyesine bir web sayfasından metin ya da konum çıkartması
 * yazdırmanın yolu yok; hikâyeye giden tek şey görseldir. O yüzden konumu
 * görselin içine basıyoruz ve görseli sistem paylaşımına veriyoruz.
 */

type Props = PaylasimVerisi & { slug: string };

const KUTU =
  "inline-flex h-10 items-center gap-1.5 rounded-xl bg-white px-3.5 text-sm font-medium " +
  "text-ink-700 ring-1 ring-line transition-colors hover:bg-surface-muted";

export function ShareRow(props: Props) {
  const { slug, ...v } = props;
  const [kopyalanan, setKopyalanan] = useState<string | null>(null);
  const [gorselDurum, setGorselDurum] = useState<"bos" | "calisiyor" | "indi" | "hata">("bos");

  const tam = tamMetin(v);
  const kisa = kisaMetin(v);
  const altYazi = altYaziMetni(v);

  async function kopyala(anahtar: string, metin: string) {
    try {
      await navigator.clipboard.writeText(metin);
      setKopyalanan(anahtar);
      setTimeout(() => setKopyalanan((k) => (k === anahtar ? null : k)), 2500);
    } catch {
      /* pano erişimi yok */
    }
  }

  async function sistemPaylasimi() {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: `AYRA · ${v.baslik}`, text: tam, url: v.url });
        return;
      } catch {
        /* kullanıcı vazgeçti */
      }
    }
    await kopyala("tam", `${tam}`);
  }

  /**
   * Görseli üretip paylaşır. Sistem paylaşımı dosya kabul ediyorsa (mobil
   * tarayıcıların çoğu) Instagram doğrudan listede çıkar; kabul etmiyorsa
   * görsel indirilir, kullanıcı hikâyeye kendisi ekler.
   */
  async function gorselPaylas(bicim: "hikaye" | "kare") {
    setGorselDurum("calisiyor");
    try {
      const yanit = await fetch(`/api/paylasim/${slug}/gorsel?bicim=${bicim}`);
      if (!yanit.ok) throw new Error("gorsel");
      const blob = await yanit.blob();
      const dosya = new File([blob], `ayra-${slug}-${bicim}.png`, { type: "image/png" });

      const n = navigator as Navigator & {
        canShare?: (d: ShareData) => boolean;
        share?: (d: ShareData) => Promise<void>;
      };
      if (n.canShare?.({ files: [dosya] }) && n.share) {
        // Açıklama metni panoya da kopyalanır: Instagram hikâyede metni
        // paylaşım verisinden almaz, kullanıcı yapıştırmak isteyebilir.
        await kopyala("altyazi", altYazi);
        await n.share({ files: [dosya], title: v.baslik });
        setGorselDurum("bos");
        return;
      }

      const adres = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = adres;
      a.download = dosya.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(adres);
      setGorselDurum("indi");
      setTimeout(() => setGorselDurum("bos"), 4000);
    } catch {
      setGorselDurum("hata");
      setTimeout(() => setGorselDurum("bos"), 4000);
    }
  }

  const harita = haritaUrl(v.enlem, v.boylam);
  const eTam = encodeURIComponent(tam);
  const eKisa = encodeURIComponent(kisa);
  const eUrl = encodeURIComponent(v.url);
  const calisiyor = gorselDurum === "calisiyor";

  return (
    <div className="space-y-3.5">
      <p className="flex items-start gap-1.5 text-xs text-ink-500">
        <IconPin size={14} className="mt-px shrink-0 text-ink-400" />
        <span>
          Her paylaşımda konum da gider:{" "}
          <span className="text-ink-700">{konumSatiri(v)}</span>
          {" · "}
          <span className="tabular-nums">{koordinat(v.enlem, v.boylam)}</span>
        </span>
      </p>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={sistemPaylasimi} className={KUTU}>
          <IconShare size={16} /> Paylaş
        </button>
        <a className={KUTU} target="_blank" rel="noreferrer noopener" href={`https://wa.me/?text=${eTam}`}>WhatsApp</a>
        <a className={KUTU} target="_blank" rel="noreferrer noopener" href={`https://x.com/intent/post?text=${eKisa}`}>X</a>
        <a className={KUTU} target="_blank" rel="noreferrer noopener" href={`https://www.facebook.com/sharer/sharer.php?u=${eUrl}`}>Facebook</a>
        <a className={KUTU} target="_blank" rel="noreferrer noopener" href={`https://www.threads.com/intent/post?text=${eKisa}`}>Threads</a>
        <a className={KUTU} target="_blank" rel="noreferrer noopener" href={`https://t.me/share/url?url=${eUrl}&text=${eTam}`}>Telegram</a>
        <a className={KUTU} target="_blank" rel="noreferrer noopener" href={`https://www.linkedin.com/sharing/share-offsite/?url=${eUrl}`}>LinkedIn</a>
        <a className={KUTU} href={`mailto:?subject=${encodeURIComponent(`AYRA · ${v.baslik}`)}&body=${eTam}`}>E-posta</a>
        <a className={KUTU} target="_blank" rel="noreferrer noopener" href={harita}>Haritada aç</a>
      </div>

      <div className="rounded-xl bg-surface-muted p-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-700">
          <IconCamera size={14} className="text-ink-400" />
          Instagram, hikâye ve gönderi
        </p>
        <p className="mb-2.5 text-xs leading-relaxed text-ink-500">
          Instagram bir web sayfasından metin ya da konum almaz. Bu yüzden adres
          ve koordinat görselin içine basılır; hikâyeye eklediğinizde konum
          görselin üstünde yazılı gelir. Açıklama metni de panoya kopyalanır.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => gorselPaylas("hikaye")} disabled={calisiyor} className={KUTU}>
            {calisiyor ? <IconSpinner size={15} /> : null} Hikâye görseli
          </button>
          <button type="button" onClick={() => gorselPaylas("kare")} disabled={calisiyor} className={KUTU}>
            Kare gönderi
          </button>
          <button type="button" onClick={() => kopyala("altyazi", altYazi)} className={KUTU}>
            {kopyalanan === "altyazi" ? <IconCheck size={16} className="text-teal-600" /> : <IconLink size={16} />}
            {kopyalanan === "altyazi" ? "Kopyalandı" : "Açıklamayı kopyala"}
          </button>
        </div>
        {gorselDurum === "indi" && (
          <p role="status" className="mt-2 text-xs text-teal-700">
            Görsel indirildi. Instagram&apos;da hikâye açıp galeriden seçin.
          </p>
        )}
        {gorselDurum === "hata" && (
          <p role="alert" className="mt-2 text-xs text-red-700">
            Görsel hazırlanamadı. Biraz sonra tekrar deneyin.
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => kopyala("url", v.url)} className={KUTU} aria-live="polite">
          {kopyalanan === "url" ? <IconCheck size={16} className="text-teal-600" /> : <IconLink size={16} />}
          {kopyalanan === "url" ? "Kopyalandı" : "Bağlantı"}
        </button>
        <button type="button" onClick={() => kopyala("tam", tam)} className={KUTU} aria-live="polite">
          {kopyalanan === "tam" ? <IconCheck size={16} className="text-teal-600" /> : <IconPin size={16} />}
          {kopyalanan === "tam" ? "Kopyalandı" : "Konumlu metin"}
        </button>
      </div>
    </div>
  );
}
