import type { ReportStatus } from "./types";

/**
 * Durum sözlüğü. Metinler nesnel ve suçlayıcı olmayan bir dilde yazılmıştır;
 * amaç sürecin nerede olduğunu göstermek, kimseyi hedef almak değil.
 */
export const STATUS: Record<
  ReportStatus,
  { label: string; short: string; tone: string; dot: string; description: string; step: number }
> = {
  new: {
    label: "Yeni", short: "Yeni",
    tone: "bg-ink-100 text-ink-700 ring-ink-200",
    dot: "bg-ink-400",
    description: "Bildirim alındı, doğrulama bekliyor.",
    step: 1,
  },
  verified: {
    label: "Doğrulandı", short: "Doğrulandı",
    tone: "bg-[#eaf2fb] text-[#1c4a7d] ring-[#c6dcf2]",
    dot: "bg-status-verified",
    description: "Bildirim yerinde veya görselle doğrulandı.",
    step: 2,
  },
  forwarded: {
    label: "Yetkili kuruma iletildi", short: "İletildi",
    tone: "bg-[#eeeffb] text-[#3a3f9e] ring-[#d2d5f4]",
    dot: "bg-status-forwarded",
    description: "İlgili kuruma resmî başvuru yapıldı.",
    step: 3,
  },
  in_review: {
    label: "İnceleniyor", short: "İnceleniyor",
    tone: "bg-[#fbf3e0] text-[#7a5406] ring-[#f0e0b8]",
    dot: "bg-status-review",
    description: "Kurum konuyu incelemeye aldı.",
    step: 4,
  },
  awaiting_resolution: {
    label: "Çözüm bekliyor", short: "Çözüm bekliyor",
    tone: "bg-[#fbeedd] text-[#8a4a09] ring-[#f2d9bb]",
    dot: "bg-status-waiting",
    description: "Kurum çözüm sözü verdi, uygulama bekleniyor.",
    step: 5,
  },
  resolved: {
    label: "Çözüldü", short: "Çözüldü",
    tone: "bg-teal-50 text-teal-800 ring-teal-200",
    dot: "bg-status-resolved",
    description: "Sorun giderildi.",
    step: 6,
  },
  unresolved: {
    label: "Çözülemedi", short: "Çözülemedi",
    tone: "bg-[#fdeaef] text-[#8d0f33] ring-[#f6ccd8]",
    dot: "bg-status-unresolved",
    description: "Süreç sonuçsuz kapandı.",
    step: 6,
  },
  duplicate: {
    label: "Birleştirildi", short: "Birleştirildi",
    tone: "bg-ink-100 text-ink-600 ring-ink-200",
    dot: "bg-ink-300",
    description: "Aynı konudaki başka bir bildirimle birleştirildi.",
    step: 0,
  },
  rejected: {
    label: "Yayından kaldırıldı", short: "Kaldırıldı",
    tone: "bg-ink-100 text-ink-600 ring-ink-200",
    dot: "bg-ink-300",
    description: "İçerik kurallara aykırı bulundu.",
    step: 0,
  },
};

export const OPEN_STATUSES: ReportStatus[] = [
  "new", "verified", "forwarded", "in_review", "awaiting_resolution",
];

export const LIFECYCLE: ReportStatus[] = [
  "new", "verified", "forwarded", "in_review", "awaiting_resolution", "resolved",
];

/** Bir durumdan geçilebilecek durumlar. Yönetim panelindeki seçenekleri belirler. */
export const TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  new:                 ["verified", "duplicate", "rejected"],
  verified:            ["forwarded", "resolved", "duplicate", "rejected"],
  forwarded:           ["in_review", "awaiting_resolution", "resolved", "unresolved"],
  in_review:           ["awaiting_resolution", "resolved", "unresolved"],
  awaiting_resolution: ["resolved", "unresolved", "in_review"],
  resolved:            ["awaiting_resolution"],
  unresolved:          ["forwarded", "awaiting_resolution"],
  duplicate:           ["new"],
  rejected:            ["new"],
};

export function isOpen(status: ReportStatus) {
  return (OPEN_STATUSES as string[]).includes(status);
}
