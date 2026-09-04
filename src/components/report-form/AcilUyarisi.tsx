"use client";

import { useMemo } from "react";

/**
 * Acil durum uyarısı.
 *
 * AYRA bir acil durum hattı değildir; bir kurumun e-posta kutusu gece üçte
 * okunmaz. Bu yüzden metinde acil bir olay geçtiğini düşündüğümüz anda,
 * bildirim gönderilmeden ÖNCE kişiye 112'yi hatırlatırız. Uyarı bildirimi
 * engellemez — kimseyi susturmayız — yalnızca doğru sırayı hatırlatır.
 *
 * Eşleşme kuralları veritabanındaki ile aynıdır (0020 migration): kök + kabul
 * edilen Türkçe ek, ve "risk / ihtimal / olabilir" gibi bir niteleme varsa
 * uyarı çıkmaz — orada anlatılan olmuş bir olay değil, bir kaygıdır.
 */

const EKLER = [
  "", "i", "ı", "u", "ü", "e", "a",
  "da", "de", "ta", "te", "dan", "den", "tan", "ten",
  "ya", "ye", "na", "ne",
  "nin", "nın", "nun", "nün", "in", "ın", "un", "ün",
  "la", "le", "yla", "yle", "ile",
  "lar", "ler", "ları", "leri", "larda", "lerde", "lardan", "lerden",
  "si", "sı", "su", "sü", "yi", "yı", "yu", "yü",
  "ndan", "nden", "nda", "nde",
  "li", "lı", "lu", "lü", "lik", "lık", "luk", "lük",
  "m", "n", "miz", "mız", "muz", "müz",
  "dı", "di", "du", "dü", "tı", "ti", "tu", "tü",
  "mış", "miş", "muş", "müş", "ma", "me", "mak", "mek",
  "yor", "ıyor", "iyor", "uyor", "üyor",
  "acak", "ecek", "yan", "yen", "an", "en",
  "ması", "mesi", "maları", "meleri", "masın", "mesin", "mada", "mede",
  "ndaki", "ndeki", "daki", "deki",
];

const SONUMLEYICI = [
  "risk", "riski", "riskli", "ihtimal", "ihtimali", "olabilir", "olma",
  "olması", "çıkabilir", "tehlikesi", "korkuyorum", "endişe", "endişem",
  "önlem", "tedbir",
];

export type AcilKelime = { word: string; exclude: string[]; contextExclude: string[] };

function sozcukler(metin: string): string[] {
  return metin.toLocaleLowerCase("tr").split(/[^a-zçğıöşü0-9]+/).filter(Boolean);
}

export function acilMi(metin: string, kelimeler: AcilKelime[]): boolean {
  const s = sozcukler(metin);
  if (s.some((w) => SONUMLEYICI.includes(w))) return false;

  return kelimeler.some((k) => {
    const kok = k.word.toLocaleLowerCase("tr");
    // Bağlam dışlaması: "su patlağı" bir arıza, patlama değil.
    if (k.contextExclude.some((x) => s.includes(x.toLocaleLowerCase("tr")))) return false;
    return s.some((w) => {
      if (!w.startsWith(kok)) return false;
      if (k.exclude.some((x) => w.startsWith(x.toLocaleLowerCase("tr")))) return false;
      return EKLER.includes(w.slice(kok.length));
    });
  });
}

export function AcilUyarisi({ metin, kelimeler }: { metin: string; kelimeler: AcilKelime[] }) {
  const goster = useMemo(() => acilMi(metin, kelimeler), [metin, kelimeler]);
  if (!goster) return null;

  return (
    <div role="alert" className="rounded-xl border-2 border-red-300 bg-red-50 p-4">
      <p className="text-sm font-semibold text-red-900">
        Can veya mal tehlikesi varsa önce 112&apos;yi arayın.
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-red-800">
        AYRA bir acil durum hattı değildir. Yangın, patlama, göçük, kaza gibi
        durumlarda tek başına buraya bildirmek yeterli olmaz — itfaiye, ambulans
        ve polis için 112 tek numaradır.
      </p>
      <a
        href="tel:112"
        className="mt-3 inline-flex items-center justify-center rounded-xl bg-red-700 px-5 py-3 text-sm font-semibold text-white active:bg-red-800"
      >
        112&apos;yi ara
      </a>
      <p className="mt-2.5 text-xs text-red-800">
        Aradıktan sonra bildiriminizi buradan da gönderin: kayıt altına alınır ve
        dernek moderasyonuna anında düşer.
      </p>
    </div>
  );
}
