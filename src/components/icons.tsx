import type { SVGProps } from "react";
import { glyphFor } from "./category-glyphs";

/**
 * AYRA ikon seti — 24×24 ızgara, 1.6 px konturlu, dolgusuz.
 * Emoji kullanılmaz; her ikon aynı optik ağırlıkta çizilmiştir.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/* ── Kategori ikonları ──────────────────────────────────────────────────
   Geometri category-glyphs.ts içinde tek kaynakta tutulur; aynı markup
   haritadaki pin sprite'ları tarafından da kullanılır. İçerik derleme
   zamanında bilinen sabit bir dizedir, kullanıcı girdisi taşımaz.        */
export function CategoryIcon({ name, size = 20, ...rest }: IconProps & { name: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: glyphFor(name) }}
      {...rest}
    />
  );
}

/* ── Arayüz ikonları ─────────────────────────────────────────────────── */
export const IconMap = (p: IconProps) => (
  <Svg {...p}><path d="M9 4 3.5 6.2v13.3L9 17.3l6 2.4 5.5-2.2V4.2L15 6.4 9 4Z" /><path d="M9 4v13.3M15 6.4v13.3" /></Svg>
);
export const IconCompass = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="m15.2 8.8-1.9 4.5-4.5 1.9 1.9-4.5 4.5-1.9Z" /></Svg>
);
export const IconPlus = (p: IconProps) => (<Svg {...p}><path d="M12 5.5v13M5.5 12h13" /></Svg>);
export const IconBell = (p: IconProps) => (
  <Svg {...p}><path d="M18 9a6 6 0 1 0-12 0c0 4.5-1.5 6-1.5 6h15S18 13.5 18 9Z" /><path d="M10.3 19a2 2 0 0 0 3.4 0" /></Svg>
);
export const IconUser = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="8.5" r="3.5" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></Svg>
);
export const IconSearch = (p: IconProps) => (
  <Svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-3.6-3.6" /></Svg>
);
export const IconChevronLeft = (p: IconProps) => (<Svg {...p}><path d="m14.5 6-6 6 6 6" /></Svg>);
export const IconChevronRight = (p: IconProps) => (<Svg {...p}><path d="m9.5 6 6 6-6 6" /></Svg>);
export const IconChevronDown = (p: IconProps) => (<Svg {...p}><path d="m6 9.5 6 6 6-6" /></Svg>);
export const IconClose = (p: IconProps) => (<Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>);
export const IconCheck = (p: IconProps) => (<Svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></Svg>);
export const IconCamera = (p: IconProps) => (
  <Svg {...p}><path d="M4 8.5h3l1.5-2h7L17 8.5h3a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="3.2" /></Svg>
);
export const IconCrosshair = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="6.5" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" /></Svg>
);
export const IconPin = (p: IconProps) => (
  <Svg {...p}><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" /><circle cx="12" cy="10" r="2.6" /></Svg>
);
export const IconShare = (p: IconProps) => (
  <Svg {...p}><path d="M12 3.5v11" /><path d="m8 7 4-3.5L16 7" /><path d="M6 12.5v6a1.5 1.5 0 0 0 1.5 1.5h9a1.5 1.5 0 0 0 1.5-1.5v-6" /></Svg>
);
export const IconFlag = (p: IconProps) => (
  <Svg {...p}><path d="M5.5 21V4" /><path d="M5.5 5h11l-2 3.5 2 3.5h-11" /></Svg>
);
export const IconClock = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 1.8" /></Svg>
);
export const IconFilter = (p: IconProps) => (
  <Svg {...p}><path d="M4 6.5h16M7 12h10M10 17.5h4" /></Svg>
);
export const IconArrowRight = (p: IconProps) => (<Svg {...p}><path d="M4.5 12h15M14 6.5l5.5 5.5L14 17.5" /></Svg>);
export const IconArrowUp = (p: IconProps) => (<Svg {...p}><path d="M12 19.5v-15M6.5 10 12 4.5 17.5 10" /></Svg>);
export const IconShieldCheck = (p: IconProps) => (
  <Svg {...p}><path d="M12 3 5 6v6c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6l-7-3Z" /><path d="m9 12 2.2 2.2L15.5 10" /></Svg>
);
export const IconChart = (p: IconProps) => (
  <Svg {...p}><path d="M4 20h16" /><path d="M7 20v-6M12 20V6M17 20v-9" /></Svg>
);
export const IconLayers = (p: IconProps) => (
  <Svg {...p}><path d="m12 3 8.5 4.5L12 12 3.5 7.5 12 3Z" /><path d="m4.5 12 7.5 4 7.5-4" /><path d="m4.5 16.5 7.5 4 7.5-4" /></Svg>
);
export const IconExternal = (p: IconProps) => (
  <Svg {...p}><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></Svg>
);
export const IconInfo = (p: IconProps) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5" /><circle cx="12" cy="8" r=".9" fill="currentColor" stroke="none" /></Svg>
);
export const IconAlert = (p: IconProps) => (
  <Svg {...p}><path d="M12 4.5 21 19H3l9-14.5Z" /><path d="M12 10v4" /><circle cx="12" cy="16.6" r=".9" fill="currentColor" stroke="none" /></Svg>
);
export const IconLink = (p: IconProps) => (
  <Svg {...p}><path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7L11.8 6.5" /><path d="M13.5 10.5a4 4 0 0 0-5.7 0l-2.3 2.3a4 4 0 0 0 5.7 5.7l1-1" /></Svg>
);
export const IconSpinner = ({ size = 20, ...rest }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...rest}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".2" strokeWidth="2.4" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.9s" repeatCount="indefinite" />
    </path>
  </svg>
);
