/** İstemciye açılan ayarlar. Gizli anahtar burada asla bulunmaz. */
export const publicConfig = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  defaultCenter: {
    lat: Number(process.env.NEXT_PUBLIC_DEFAULT_LAT ?? 38.24083),
    lng: Number(process.env.NEXT_PUBLIC_DEFAULT_LNG ?? 27.27861),
    zoom: Number(process.env.NEXT_PUBLIC_DEFAULT_ZOOM ?? 14),
  },
  storageProvider: process.env.NEXT_PUBLIC_STORAGE_PROVIDER ?? "local",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
  supabaseBucket: process.env.NEXT_PUBLIC_SUPABASE_BUCKET ?? "report-media",
} as const;

/** Depolama anahtarını istemci tarafında görüntülenebilir URL'ye çevirir. */
export function publicMediaUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  if (publicConfig.storageProvider === "supabase" && publicConfig.supabaseUrl) {
    return `${publicConfig.supabaseUrl}/storage/v1/object/public/${publicConfig.supabaseBucket}/${key}`;
  }
  return `/api/medya/${key}`;
}
