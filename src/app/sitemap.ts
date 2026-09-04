import type { MetadataRoute } from "next";
import { publicConfig } from "@/lib/public-config";

export const revalidate = 3600;

/**
 * Her sorun ve her mahalle için indekslenebilir URL üretir. Böylece
 * "Ayrancılar ulaşım sorunu" gibi aramalarda AYRA sayfaları çıkabilir.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicConfig.siteUrl;

  const staticPages: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "hourly", priority: 1 },
    { url: `${base}/kesfet`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/mahalle`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/kur`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/kur/ios`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/kur/android`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/hakkinda`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${base}/kurallar`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/gizlilik`, changeFrequency: "monthly", priority: 0.3 },
  ];

  // Derleme sırasında veritabanına ulaşılamayabilir (CI, ilk kurulum).
  // Böyle bir durumda site haritası boş dönmek yerine statik sayfalarla
  // üretilir; derleme kırılmaz, sonraki yeniden doğrulamada tamamlanır.
  let reports: Array<{ slug: string; updated_at: string; support_count: number }> = [];
  let neighborhoods: Array<{ slug: string; total: number }> = [];
  let categories: Array<{ slug: string }> = [];

  try {
    // Veritabanı katmanı bilerek burada, gecikmeli olarak yükleniyor.
    // Üstte import edilirse DATABASE_URL yokken modül daha okunurken
    // hata fırlatır ve aşağıdaki catch'e hiç düşmeden derleme kırılır.
    // Vercel'de ilk dağıtım, ortam değişkenleri girilmeden yapılıyor.
    const { withSystem } = await import("@/lib/db");

    [reports, neighborhoods, categories] = await Promise.all([
      withSystem((tx) => tx`
        select slug, updated_at, support_count from public.reports
         where not is_hidden and status not in ('rejected','duplicate')
         order by updated_at desc limit 20000`) as Promise<typeof reports>,
      withSystem((tx) => tx`
        select n.slug, count(r.id)::int as total
          from public.neighborhoods n
          left join public.reports r on r.neighborhood_id = n.id and not r.is_hidden
         where n.is_active group by n.slug`) as Promise<typeof neighborhoods>,
      withSystem((tx) => tx`
        select slug from public.report_categories where is_active and parent_id is null`) as Promise<typeof categories>,
    ]);
  } catch (err) {
    console.error("sitemap: veritabanına ulaşılamadı, yalnızca statik sayfalar üretildi", err);
    return staticPages;
  }

  return [
    ...staticPages,
    ...categories.map((c) => ({
      url: `${base}/kesfet?kategori=${c.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
    ...neighborhoods.map((n) => ({
      url: `${base}/mahalle/${n.slug}`,
      changeFrequency: "daily" as const,
      priority: Number(n.total) > 0 ? 0.7 : 0.4,
    })),
    ...reports.map((r) => ({
      url: `${base}/sorun/${r.slug}`,
      lastModified: new Date(r.updated_at as string),
      changeFrequency: "weekly" as const,
      priority: Math.min(0.5 + Number(r.support_count) / 400, 0.9),
    })),
  ];
}
