/**
 * Paylaşım metinleri.
 *
 * Her paylaşımda konum gider. Bir kent sorununu "şurada çukur var" diye
 * paylaşmanın kıymeti, şuranın neresi olduğunu söylemesindedir; adres ve
 * koordinat olmadan paylaşım bir şikâyetten ibaret kalır.
 *
 * Sunucu ve istemci aynı metni üretsin diye burada duruyor.
 */

export type PaylasimVerisi = {
  baslik: string;
  yer: string | null;        // mahalle, ilçe
  adres: string | null;
  enlem: number;
  boylam: number;
  destek: number;
  url: string;
};

export function haritaUrl(enlem: number, boylam: number): string {
  return `https://www.google.com/maps?q=${enlem.toFixed(6)},${boylam.toFixed(6)}`;
}

export function koordinat(enlem: number, boylam: number): string {
  return `${enlem.toFixed(5)}, ${boylam.toFixed(5)}`;
}

/** Konumu tek satırda: varsa adres, yoksa mahalle, o da yoksa koordinat. */
export function konumSatiri(v: PaylasimVerisi): string {
  return v.adres?.trim() || v.yer?.trim() || koordinat(v.enlem, v.boylam);
}

/** WhatsApp, Telegram, e-posta gibi uzunluk sınırı olmayan yerler için. */
export function tamMetin(v: PaylasimVerisi): string {
  const s: string[] = [v.baslik];
  if (v.adres) s.push(`Adres: ${v.adres}`);
  if (v.yer) s.push(`Mahalle: ${v.yer}`);
  s.push(`Konum: ${koordinat(v.enlem, v.boylam)}`);
  s.push(haritaUrl(v.enlem, v.boylam));
  s.push("");
  s.push(
    v.destek > 0
      ? `Bu sorunu ${v.destek} kişi destekliyor. AYRA'da görüntüleyin:`
      : "Bu sorunu AYRA'da görüntüleyin ve destekleyin:",
  );
  s.push(v.url);
  return s.join("\n");
}

/** X gibi karakter sınırı olan yerler için: konum yine var, gövde kısa. */
export function kisaMetin(v: PaylasimVerisi): string {
  return [
    `${v.baslik} — ${konumSatiri(v)}`,
    haritaUrl(v.enlem, v.boylam),
    v.url,
  ].join("\n");
}

/** Instagram hikâyesi/gönderisi için: görselin yanına yapıştırılacak açıklama. */
export function altYaziMetni(v: PaylasimVerisi): string {
  const s: string[] = [v.baslik];
  s.push(konumSatiri(v));
  s.push("");
  s.push(
    v.destek > 0
      ? `Bu sorunu ${v.destek} kişi destekliyor.`
      : "Bu sorunu destekleyin.",
  );
  s.push(v.url);
  s.push("");
  s.push("#AYRA #Ayrancılar #Torbalı");
  return s.join("\n");
}
