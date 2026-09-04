import type { MetadataRoute } from "next";
import { publicConfig } from "@/lib/public-config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/sorun/", "/mahalle/", "/kesfet"],
        disallow: ["/yonetim", "/api/", "/profil", "/takip", "/bildir", "/giris"],
      },
    ],
    sitemap: `${publicConfig.siteUrl}/sitemap.xml`,
    host: publicConfig.siteUrl,
  };
}
