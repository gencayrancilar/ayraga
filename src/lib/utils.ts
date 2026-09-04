/** Basit sınıf birleştirici — koşullu Tailwind sınıfları için. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Türkçe karakterleri koruyarak URL uyumlu slug üretir (istemci tarafı). */
export function slugify(input: string): string {
  const map: Record<string, string> = {
    ı: "i", İ: "i", ğ: "g", Ğ: "g", ü: "u", Ü: "u",
    ş: "s", Ş: "s", ö: "o", Ö: "o", ç: "c", Ç: "c",
  };
  return input
    .replace(/[ıİğĞüÜşŞöÖçÇ]/g, (c) => map[c] ?? c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}
