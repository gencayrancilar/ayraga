const TZ = "Europe/Istanbul";

const dateFmt = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric", month: "long", year: "numeric", timeZone: TZ,
});
const dateShortFmt = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric", month: "long", timeZone: TZ,
});
const dateTimeFmt = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ,
});
const numberFmt = new Intl.NumberFormat("tr-TR");

export const formatDate = (v: string | Date) => dateFmt.format(new Date(v));
export const formatDateShort = (v: string | Date) => dateShortFmt.format(new Date(v));
export const formatDateTime = (v: string | Date) => dateTimeFmt.format(new Date(v));
export const formatNumber = (v: number) => numberFmt.format(v);

/** "3 gün önce" — sosyal medya tonuna kaymadan, sade. */
export function timeAgo(value: string | Date): string {
  const then = new Date(value).getTime();
  const diff = Date.now() - then;
  const min = Math.round(diff / 60_000);

  if (min < 1) return "az önce";
  if (min < 60) return `${min} dakika önce`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} saat önce`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} gün önce`;
  if (days < 31) return `${Math.round(days / 7)} hafta önce`;
  if (days < 365) return `${Math.round(days / 30)} ay önce`;
  return `${Math.round(days / 365)} yıl önce`;
}

/**
 * Sessizlik sayacı metni. Kurumsal ve nesnel: "başvurudan bu yana geçen süre".
 * Suçlayıcı bir dil kullanılmaz.
 */
export function formatElapsed(hoursTotal: number): string {
  const days = Math.floor(hoursTotal / 24);
  const hours = Math.floor(hoursTotal % 24);
  if (days === 0) return `${hours} saat`;
  if (days < 60) return hours > 0 ? `${days} gün ${hours} saat` : `${days} gün`;
  const months = Math.floor(days / 30);
  return `${months} ay ${days % 30} gün`;
}

/** Mesafeyi okunur hâle getirir. */
export function formatDistance(meters: number): string {
  if (meters < 950) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

/** Destek sayısı — yarışma hissi vermeyen, sade ifade. */
export function supportLabel(count: number): string {
  if (count === 0) return "Henüz destek yok";
  if (count === 1) return "1 kişi destekledi";
  return `${formatNumber(count)} kişi destekledi`;
}

export function pluralDays(days: number): string {
  return `${formatNumber(Math.round(days))} gün`;
}

/** Skor bandı — renk ve etiket. */
export function scoreBand(score: number) {
  if (score >= 80) return { label: "İyi", color: "var(--color-teal-600)", ring: "ring-teal-200", bg: "bg-teal-50" };
  if (score >= 60) return { label: "Orta", color: "#3f7fb8", ring: "ring-[#c6dcf2]", bg: "bg-[#eaf2fb]" };
  if (score >= 40) return { label: "Zayıf", color: "#a16207", ring: "ring-[#f0e0b8]", bg: "bg-[#fbf3e0]" };
  return { label: "Kritik", color: "#9f1239", ring: "ring-[#f6ccd8]", bg: "bg-[#fdeaef]" };
}

export const CONFIDENCE_LABEL: Record<string, string> = {
  low: "Düşük veri",
  medium: "Orta veri",
  high: "Yeterli veri",
};
