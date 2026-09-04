import "server-only";
import { withSystem } from "./db";
import { mailGonder, mailAcik } from "./mail";

/**
 * Kurumlara bir kereye mahsus tanıtım yazısı.
 *
 * İki metin var, çünkü kurumların bir kısmı tanıtımı almadan önce haftalık
 * sorun listesini aldı. Onlara sadece "merhaba, biz şuyuz" demek tuhaf olur;
 * önce ellerindeki yazının ne olduğunu açıklamak gerekiyor. Kimin hangi metni
 * alacağına, o kuruma daha önce liste gidip gitmediğine bakarak karar veriyoruz.
 *
 * Yazı bir kuruma yalnızca bir kez gider: outbound_messages'ta o kuruma ait
 * 'tanitim' kaydı varsa atlanır.
 */

const IMZA = `
Saygılarımızla,

Genç Ayrancılar Derneği
AYRA — Gör. Bildir. Destekle. Takip et.
https://ayraga.com · info@ayraga.com`;

const PLATFORM = `  · Mahalle sakini sorunu fotoğrafı ve konumuyla bildiriyor.
  · Her bildirim bir referans kodu ve zaman damgası alıyor; kayıt sonradan
    değiştirilemeyecek biçimde saklanıyor.
  · Bildirim, konusuna göre görev alanı ilgili olan kuruma yönlendiriliyor.`;

const NE_GONDERECEGIZ = `  · Haftada bir kez, yalnızca kurumunuzun görev alanına giren ve daha önce
    iletilmemiş sorunların listesi. Her kalemde başlık, mahalle, açık adres,
    koordinat ve harita bağlantısı yer alır.
  · Liste, mahalle sakinlerince en çok desteklenen sorundan başlar ve tek
    seferde en fazla 15 kalem içerir; kalanlar sonraki haftaya devreder.
    Amacımız okunmayacak bir yığın göndermek değildir.
  · Yangın, göçük, trafo arızası gibi gecikmeye tahammülü olmayan bildirimler
    haftalık listeyi beklemeden iletilir. Platform bir acil çağrı kanalı
    değildir; kullanıcılarımıza bu tür durumlarda önce 112'yi aramaları
    uygulama içinde hatırlatılmaktadır.`;

const YANIT = `Bu adrese göndereceğiniz yanıt, ilgili sorunun kamuya açık sayfasında
kurumunuzun adıyla yayımlanır ve bildirimi yapan kişiye iletilir. Yanıt
verilmediği durumda platformda "kuruma iletildi, yanıt bekleniyor" bilgisi
görünür; bu bir suçlama değil, kaydın o anki durumudur.`;

const KAPANIS = `Listelerin durdurulmasını, başka bir birime ya da adrese iletilmesini veya
farklı bir biçimde gönderilmesini isterseniz info@ayraga.com adresine
yazmanız yeterlidir.`;

/** Henüz hiç liste göndermediğimiz kuruma. */
function yeniKurumMetni(): { subject: string; text: string } {
  return {
    subject: "AYRA kent sorun takip platformu — tanıtım",
    text: `Sayın Yetkili,

Genç Ayrancılar Derneği olarak, Ayrancılar ve çevresindeki mahalle
sakinlerinin karşılaştığı kent sorunlarını kayıt altına alan AYRA adlı bir
platform yürütüyoruz: https://ayraga.com

NASIL İŞLİYOR

${PLATFORM}

KURUMUNUZA NE GÖNDERECEĞİZ

${NE_GONDERECEGIZ}

SİZDEN BEKLEDİĞİMİZ

Bu yazışma kurumunuza hukuki bir yükümlülük doğurmaz. Bir sorun hakkında
bilgi vermek isterseniz bu e-postayı yanıtlamanız yeterlidir. Yanıtınız,
ilgili sorunun kamuya açık sayfasında kurumunuzun adıyla yayımlanır ve
sorunu bildiren mahalle sakinine iletilir. Yanıt verilmediği durumda
platformda "kuruma iletildi, yanıt bekleniyor" bilgisi görünür; bu bir
suçlama değil, kaydın o anki durumudur.

${KAPANIS}
${IMZA}`,
  };
}

/** Tanıtımı almadan önce sorun listesi göndermiş olduğumuz kuruma. */
function listeAlanKurumMetni(): { subject: string; text: string } {
  return {
    subject: "AYRA kent sorun takip platformu ve gönderdiğimiz sorun listesi hakkında",
    text: `Sayın Yetkili,

Yakın zamanda info@ayraga.com adresinden kurumunuza, görev alanınıza giren
kent sorunlarını içeren bir liste ilettik. Bu yazıyla hem söz konusu iletinin
niteliğini açıklamak hem de arkasındaki çalışmayı tanıtmak istiyoruz.

KİMİZ, NE YAPIYORUZ

Genç Ayrancılar Derneği olarak, Ayrancılar ve çevresindeki mahalle
sakinlerinin karşılaştığı kent sorunlarını kayıt altına alan AYRA adlı bir
platform yürütüyoruz: https://ayraga.com

${PLATFORM}

Kurumunuza ulaşan liste bu yönlendirmenin sonucudur.

GÖNDERDİĞİMİZ LİSTENİN NİTELİĞİ

Bu ileti bir CİMER başvurusu, dilekçe ya da bilgi edinme talebi değildir;
kurumunuza yasal bir cevap süresi yüklemez. Listedeki her kalem, bildirimi
yapan mahalle sakininin kendi beyanıdır. Konum bilgisi bildirim anında
kaydedilmiştir; adresler bu konumdan üretilmiştir. Bildirimi yapan kişilerin
kimlik ve iletişim bilgileri paylaşılmamaktadır.

BUNDAN SONRA NE GÖNDERECEĞİZ

${NE_GONDERECEGIZ}

YANIT

${YANIT}

BİR AKSAKLIK İÇİN ÖZÜR

Aynı listeyi kurumunuza kısa aralıkla iki kez göndermiş olabiliriz. Bu,
gönderim sistemimizdeki bir hatadan kaynaklanmıştır ve giderilmiştir. İki
iletinin içeriği aynıdır; ayrı ayrı işlem yapılmasına gerek yoktur. Verdiğimiz
rahatsızlık için özür dileriz.

${KAPANIS}
${IMZA}`,
  };
}

export type TanitimSatiri = {
  kurum: string;
  adres: string | null;
  metin: "yeni" | "liste-alan";
  durum: "gonderildi" | "atlandi" | "hata" | "deneme";
  not?: string;
};

export type TanitimSonucu = {
  gonderildi: number; atlanan: number; hata: number;
  deneme: boolean; satirlar: TanitimSatiri[];
};

/**
 * @param onay  false ise hiçbir şey gönderilmez; kime ne gideceği listelenir.
 *              Geri alınamayan bir işlem, varsayılan olarak yapılmaz.
 */
export async function tanitimGonder(onay: boolean): Promise<TanitimSonucu> {
  const satirlar: TanitimSatiri[] = [];
  let gonderildi = 0, atlanan = 0, hata = 0;

  const kurumlar = await withSystem((tx) => tx`
    select a.id, a.name, a.contact_email,
           exists (select 1 from public.outbound_messages o
                    where o.authority_id = a.id and o.kind = 'haftalik' and o.status = 'sent')
             as liste_gitti,
           exists (select 1 from public.outbound_messages o
                    where o.authority_id = a.id and o.kind = 'tanitim' and o.status = 'sent')
             as tanitim_gitti
      from public.authorities a
     where a.is_active
     order by a.name
  `);

  for (const k of kurumlar) {
    const kurum = k.name as string;
    const adres = (k.contact_email as string | null)?.trim() || null;
    const metin = k.liste_gitti ? ("liste-alan" as const) : ("yeni" as const);

    if (!adres) {
      satirlar.push({ kurum, adres, metin, durum: "atlandi", not: "e-posta adresi tanımlı değil" });
      atlanan++; continue;
    }
    if (k.tanitim_gitti) {
      satirlar.push({ kurum, adres, metin, durum: "atlandi", not: "tanıtım daha önce gönderilmiş" });
      atlanan++; continue;
    }
    if (!mailAcik()) {
      satirlar.push({ kurum, adres, metin, durum: "atlandi", not: "RESEND_API_KEY tanımlı değil" });
      atlanan++; continue;
    }

    const { subject, text } = metin === "liste-alan" ? listeAlanKurumMetni() : yeniKurumMetni();

    if (!onay) {
      satirlar.push({ kurum, adres, metin, durum: "deneme" });
      continue;
    }

    const sonuc = await mailGonder({ to: [adres], subject, text });
    await withSystem((tx) => tx`
      insert into public.outbound_messages
        (kind, authority_id, recipients, subject, body, status, provider_id, error, sent_at)
      values ('tanitim', ${k.id}, ${[adres]}, ${subject}, ${text},
              ${sonuc.ok ? "sent" : "failed"}, ${sonuc.ok ? sonuc.id : null},
              ${sonuc.ok ? null : sonuc.hata}, ${sonuc.ok ? new Date() : null})
    `);

    if (sonuc.ok) { gonderildi++; satirlar.push({ kurum, adres, metin, durum: "gonderildi" }); }
    else { hata++; satirlar.push({ kurum, adres, metin, durum: "hata", not: sonuc.hata }); }
  }

  return { gonderildi, atlanan, hata, deneme: !onay, satirlar };
}
