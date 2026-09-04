/**
 * Veritabanı hatalarını insan diline çevirir.
 *
 * Kurulum sırasında en sık karşılaşılan dört durumu tanır ve ne yapılması
 * gerektiğini adım adım söyler. Tanımadığı hatalarda null döner; o zaman
 * genel hata ekranı gösterilir.
 */
export type Diagnosis = {
  title: string;
  detail: string;
  steps: string[];
  file?: string;
};

const PLACEHOLDERS = [
  "PAROLANIZI_BURAYA_YAZIN",
  "[YOUR-PASSWORD]",
  "PAROLANIZ",
  "PROJE_REF",
];

export function looksLikePlaceholder(url: string | undefined): boolean {
  if (!url) return false;
  return PLACEHOLDERS.some((p) => url.includes(p));
}

export function diagnose(raw: unknown): Diagnosis | null {
  const msg =
    raw instanceof Error ? `${raw.message} ${(raw as { code?: string }).code ?? ""}` : String(raw ?? "");
  const m = msg.toLowerCase();

  if (
    PLACEHOLDERS.some((p) => msg.includes(p)) ||
    m.includes("password authentication failed") ||
    m.includes("28p01")
  ) {
    return {
      title: "Veritabanı parolası kabul edilmedi",
      detail:
        "Supabase bağlantıyı reddetti. Parola ya henüz girilmemiş ya da yanlış.",
      file: ".env.local",
      steps: [
        ".env.local dosyasını açın ve DATABASE_URL satırına bakın. Parola yerinde hâlâ PAROLANIZI_BURAYA_YAZIN gibi bir yer tutucu duruyorsa onu gerçek parolanızla değiştirin; tırnak içinde kalsın.",
        "Parolada @ : / ? # gibi karakterler varsa adreste sorun çıkarır. Supabase → Connect → Reset database password ile yalnız harf ve rakamdan oluşan bir parola belirleyin.",
        "Session pooler kullanıyorsanız kullanıcı adı postgres değil, postgres.PROJE_REF biçimindedir. Adresi olduğu gibi kopyalayın.",
        "Kaydedin, terminalde Ctrl+C ile durdurup npm run dev ile yeniden başlatın — .env.local değişiklikleri yeniden başlatma ister.",
      ],
    };
  }

  if (
    m.includes("enetunreach") ||
    m.includes("connect_timeout") ||
    m.includes("etimedout") ||
    m.includes("econnrefused") ||
    m.includes("eai_again") ||
    m.includes("enotfound")
  ) {
    return {
      title: "Veritabanına ulaşılamıyor",
      detail:
        "Adres çözülemedi ya da bağlantı kurulamadı. En sık sebebi Supabase'in doğrudan bağlantısının yalnız IPv6 üzerinden çalışması.",
      file: ".env.local",
      steps: [
        "DATABASE_URL içinde db.PROJE_REF.supabase.co yazıyorsa bunu Session pooler adresiyle değiştirin: aws-0-eu-central-1.pooler.supabase.com:5432",
        "Adresi Supabase → Connect → Direct connection → Session pooler altından kopyalayabilirsiniz.",
        "Yerel PostgreSQL kullanıyorsanız veritabanının çalıştığından emin olun.",
      ],
    };
  }

  if (m.includes("does not exist") && (m.includes("relation") || m.includes("schema"))) {
    return {
      title: "Şema kurulmamış",
      detail: "Bağlantı kuruldu ama AYRA tabloları bulunamadı.",
      steps: [
        "Supabase panelinde SQL Editor'ü açın.",
        "supabase/AYRA-KURULUM.sql dosyasının tamamını yapıştırıp Run deyin.",
        "Ardından supabase/AYRA-DEPOLAMA.sql dosyasını da çalıştırın.",
      ],
    };
  }

  return null;
}
