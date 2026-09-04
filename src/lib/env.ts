/** Sunucu tarafı ortam değişkenleri — tek doğrulama noktası. */
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL zorunlu"),
  AUTH_PROVIDER: z.enum(["local", "supabase"]).default("local"),
  STORAGE_PROVIDER: z.enum(["local", "supabase"]).default("local"),
  AUTH_JWT_SECRET: z.string().min(32, "AUTH_JWT_SECRET en az 32 karakter olmalı"),
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default("report-media"),
  LOCAL_STORAGE_DIR: z.string().default("storage/uploads"),
});

let cached: z.infer<typeof schema> | null = null;

export function env() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  · ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Ortam değişkenleri eksik veya hatalı:\n${issues}`);
  }
  // Vercel gibi sunucularda disk kalıcı değildir: "local" depolama ile
  // yüklenen fotoğraflar ilk yeniden dağıtımda kaybolur. Üretimde bunu
  // sessizce geçmeyelim.
  if (
    process.env.NODE_ENV === "production" &&
    parsed.data.STORAGE_PROVIDER === "local" &&
    !process.env.AYRA_ALLOW_LOCAL_STORAGE
  ) {
    console.warn(
      "\n⚠  STORAGE_PROVIDER=\"local\" — üretimde fotoğraflar sunucu diskine yazılır\n" +
        "   ve kalıcı olmayabilir (Vercel'de kaybolur). Supabase Storage'a geçin:\n" +
        "   STORAGE_PROVIDER=supabase ve NEXT_PUBLIC_STORAGE_PROVIDER=supabase\n" +
        "   Kalıcı diskiniz varsa AYRA_ALLOW_LOCAL_STORAGE=1 ile bu uyarıyı kapatabilirsiniz.\n",
    );
  }

  cached = parsed.data;
  return cached;
}

export { publicConfig } from "./public-config";
