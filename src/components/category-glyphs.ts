/**
 * Kategori ikonlarının tek kaynağı.
 *
 * Aynı geometri iki yerde kullanılır: arayüzdeki React ikon bileşeni ve
 * haritadaki pin sprite'ları. İkisinin ayrı ayrı yazılması, yönetim panelinden
 * yeni bir kategori eklendiğinde birinin güncellenip diğerinin unutulmasına
 * yol açardı — bu yüzden markup burada, 24×24 ızgarada, bir kez tanımlanır.
 *
 * Renkler `currentColor` üzerinden gelir: arayüzde kategori rengi, pin içinde
 * beyaz. Kullanan taraf `color` özniteliğini belirler.
 */
export const CATEGORY_GLYPHS: Record<string, string> = {
  bus:
    '<path d="M4 17V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11"/>' +
    '<path d="M4 11h16"/><path d="M6 17v2m12-2v2"/><path d="M4 17h16"/>' +
    '<circle cx="7.5" cy="14.5" r=".9" fill="currentColor" stroke="none"/>' +
    '<circle cx="16.5" cy="14.5" r=".9" fill="currentColor" stroke="none"/>',

  road:
    '<path d="M7 3 4 21"/><path d="m17 3 3 18"/><path d="M12 4v3m0 4v3m0 4v3"/>',

  trash:
    '<path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>' +
    '<path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7"/><path d="M10 11v6m4-6v6"/>',

  lamp:
    '<path d="M12 3v18"/><path d="M12 3h5a3 3 0 0 1 3 3v1"/>' +
    '<path d="M17 7h6l-3 5-3-5Z"/><path d="M8 21h8"/>',

  tree:
    '<path d="M12 3 6 12h3l-4 6h14l-4-6h3Z"/><path d="M12 18v3"/>',

  shield:
    '<path d="M12 3 5 6v6c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6l-7-3Z"/>',

  accessibility:
    '<circle cx="12" cy="4.5" r="1.6"/><path d="M8 8.5h8"/>' +
    '<path d="M12 8.5v5h4"/><path d="M12 13.5 9 21"/>',

  health:
    '<path d="M3 12h4l2-4 3 8 2.5-5 1.5 3h5"/>',

  school:
    '<path d="m12 4 9 4-9 4-9-4 9-4Z"/>' +
    '<path d="M7 10.5V16c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-5.5"/><path d="M21 8v5"/>',

  wifi:
    '<path d="M3.5 9a13 13 0 0 1 17 0"/><path d="M6.5 12.5a8.5 8.5 0 0 1 11 0"/>' +
    '<path d="M9.5 16a4 4 0 0 1 5 0"/>' +
    '<circle cx="12" cy="19" r=".9" fill="currentColor" stroke="none"/>',

  paw:
    '<ellipse cx="7" cy="10" rx="1.8" ry="2.3"/><ellipse cx="12" cy="8" rx="1.8" ry="2.3"/>' +
    '<ellipse cx="17" cy="10" rx="1.8" ry="2.3"/>' +
    '<path d="M12 13c2.8 0 5 1.9 5 4.2 0 1.6-1.3 2.8-3 2.8h-4c-1.7 0-3-1.2-3-2.8C7 14.9 9.2 13 12 13Z"/>',

  dots:
    '<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/>' +
    '<circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>' +
    '<circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
};

/** Bilinmeyen bir ikon anahtarı için güvenli varsayılan. */
export function glyphFor(name: string): string {
  return CATEGORY_GLYPHS[name] ?? CATEGORY_GLYPHS.dots;
}

export const CATEGORY_GLYPH_NAMES = Object.keys(CATEGORY_GLYPHS);
