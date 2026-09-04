import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import sharp from "sharp";
import { env } from "../env";

// Vercel'de bir isteğin gövdesi en fazla 4,5 MB olabilir; bunun üstü
// fonksiyona hiç ulaşmaz. Sınırı 4 MB'de tutuyoruz ki hata bizim
// anlaşılır mesajımızla dönsün, platformun sessiz reddiyle değil.
// Görseller zaten tarayıcıda küçültülüp JPEG'e çevriliyor (image-client.ts).
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4 MB
// HEIC bilerek yok: sunucudaki sharp, yayınlanan ikili paketlerde HEVC
// çözücüsü içermediği için iPhone fotoğraflarını açamaz. Bu yüzden görseli
// tarayıcıda JPEG'e çeviriyoruz; buraya HEIC ulaşmamalı.
export const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_EDGE = 1600;

export type StoredMedia = {
  path: string;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
};

export class UploadError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "UploadError";
  }
}

/**
 * Görseli işler ve saklar.
 *
 * Önemli: sharp varsayılan olarak EXIF verisini korumaz. Bunu bilinçli olarak
 * böyle bırakıyoruz — fotoğrafın GPS koordinatı, cihaz kimliği ve çekim
 * zamanı yüklenirken tamamen düşer. Konum bilgisi yalnızca kullanıcının
 * haritada onayladığı noktadan gelir.
 */
export type PreparedImage = {
  data: Buffer;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
};

/** Görseli doğrular, küçültür ve EXIF'ini düşürür — henüz diske yazmaz. */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError("FILE_TOO_LARGE", "Görsel 4 MB sınırını aşıyor. Daha küçük bir fotoğraf seçin.");
  }
  if (!ACCEPTED_MIME.includes(file.type)) {
    throw new UploadError("UNSUPPORTED_TYPE", "Bu görsel biçimi desteklenmiyor. JPEG, PNG veya WebP deneyin.");
  }

  const input = Buffer.from(await file.arrayBuffer());

  // Sihirli baytlarla gerçek tür doğrulaması — Content-Type başlığına güvenilmez.
  let meta;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new UploadError("INVALID_IMAGE", "Dosya geçerli bir görsel değil.");
  }
  if (!meta.width || !meta.height) {
    throw new UploadError("INVALID_IMAGE", "Görsel boyutları okunamadı.");
  }

  const output = await sharp(input)
    .rotate()                       // EXIF yönünü uygular, sonra veriyi düşürür
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toBuffer({ resolveWithObject: true });

  return {
    data: output.data,
    mimeType: "image/webp",
    width: output.info.width,
    height: output.info.height,
    byteSize: output.info.size,
  };
}

/**
 * Hazırlanmış görseli kalıcı depoya yazar ve anahtarını döner.
 * Veritabanı kaydı başarılı olduktan sonra çağrılır; böylece başarısız bir
 * bildirimden geriye yetim dosya kalmaz.
 */
export async function storeImage(image: PreparedImage, prefix = "reports"): Promise<StoredMedia> {
  const key = `${prefix}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.webp`;

  if (env().STORAGE_PROVIDER === "supabase") {
    await putSupabase(key, image.data, image.mimeType);
  } else {
    const dest = join(process.cwd(), env().LOCAL_STORAGE_DIR, key);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, image.data);
  }

  return {
    path: key,
    mimeType: image.mimeType,
    width: image.width,
    height: image.height,
    byteSize: image.byteSize,
  };
}

export async function processAndStore(file: File, opts: { prefix?: string } = {}): Promise<StoredMedia> {
  return storeImage(await prepareImage(file), opts.prefix);
}

export async function removeStored(key: string): Promise<void> {
  if (env().STORAGE_PROVIDER === "supabase") {
    await deleteSupabase(key);
    return;
  }
  try {
    await unlink(join(process.cwd(), env().LOCAL_STORAGE_DIR, key));
  } catch {
    /* dosya zaten yok */
  }
}

/** Yerel sağlayıcıda dosyayı okur (medya route handler'ı kullanır). */
export async function readLocal(key: string): Promise<Buffer | null> {
  if (key.includes("..")) return null;
  try {
    return await readFile(join(process.cwd(), env().LOCAL_STORAGE_DIR, key));
  } catch {
    return null;
  }
}

/** Bir depolama anahtarını tarayıcının kullanabileceği URL'ye çevirir. */
export function mediaUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  const cfg = env();
  if (cfg.STORAGE_PROVIDER === "supabase" && cfg.NEXT_PUBLIC_SUPABASE_URL) {
    return `${cfg.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${cfg.SUPABASE_STORAGE_BUCKET}/${key}`;
  }
  return `/api/medya/${key}`;
}

// ── Supabase Storage ────────────────────────────────────────────────────────
async function putSupabase(key: string, body: Buffer, contentType: string) {
  const cfg = env();
  if (!cfg.NEXT_PUBLIC_SUPABASE_URL || !cfg.SUPABASE_SERVICE_ROLE_KEY) {
    throw new UploadError("STORAGE_NOT_CONFIGURED", "Supabase Storage yapılandırılmamış.");
  }
  const res = await fetch(
    `${cfg.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${cfg.SUPABASE_STORAGE_BUCKET}/${key}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": contentType,
        "cache-control": "public, max-age=31536000, immutable",
      },
      body: new Uint8Array(body),
    },
  );
  if (!res.ok) {
    throw new UploadError("STORAGE_FAILED", `Yükleme başarısız (${res.status}).`);
  }
}

async function deleteSupabase(key: string) {
  const cfg = env();
  if (!cfg.NEXT_PUBLIC_SUPABASE_URL || !cfg.SUPABASE_SERVICE_ROLE_KEY) return;
  await fetch(`${cfg.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${cfg.SUPABASE_STORAGE_BUCKET}/${key}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${cfg.SUPABASE_SERVICE_ROLE_KEY}` },
  });
}
