/**
 * Tarayıcı tarafında görsel hazırlama.
 *
 * Neden gerekli:
 *
 * 1. Vercel'de bir isteğin gövdesi en fazla 4,5 MB olabilir. Telefon
 *    fotoğrafları çoğu zaman bunun üstünde; dosya sunucuya hiç ulaşmadan
 *    reddedilir ve kullanıcı sebebini anlayamadığı bir hata görür.
 *
 * 2. iPhone fotoğrafları HEIC biçimindedir. Sunucudaki sharp, yayınlanan
 *    ikili paketlerde HEVC çözücüsü içermediği için HEIC'i açamaz
 *    (yalnızca AVIF okuyabiliyor). Tarayıcıda ise iOS görseli zaten
 *    çözebildiği için canvas'a çizip JPEG olarak yeniden kodlayabiliyoruz.
 *
 * Yan fayda: canvas'a çizilen görselde EXIF tamamen düşer — konum ve cihaz
 * bilgisi kullanıcının telefonundan hiç çıkmaz. Sunucudaki temizlik ikinci
 * bir güvence olarak yerinde duruyor.
 */

const MAX_EDGE = 1600;
const KALITE = 0.82;

/** Dönüş: yeniden kodlanmış JPEG. Başarısız olursa dosya olduğu gibi döner. */
export async function hazirlaGorsel(file: File): Promise<File> {
  if (typeof document === "undefined") return file;
  if (!file.type.startsWith("image/")) return file;

  try {
    const bitmap = await cozumle(file);
    const olcek = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const g = Math.round(bitmap.width * olcek);
    const y = Math.round(bitmap.height * olcek);

    const canvas = document.createElement("canvas");
    canvas.width = g;
    canvas.height = y;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, g, y);
    if ("close" in bitmap) bitmap.close();

    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", KALITE),
    );
    if (!blob) return file;

    // Yeniden kodlama beklenmedik biçimde büyüttüyse özgün dosyayı koru.
    if (blob.size >= file.size && file.size < 4_000_000) return file;

    const ad = file.name.replace(/\.[^.]+$/, "") || "gorsel";
    return new File([blob], `${ad}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

async function cozumle(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      // from-image: EXIF'teki döndürme bilgisine uy, fotoğraf yan yatmasın.
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* aşağıdaki yönteme düş */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error("görsel çözülemedi"));
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
