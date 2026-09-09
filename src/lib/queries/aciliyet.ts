import "server-only";
import { unstable_cache } from "next/cache";
import { withSystem } from "../db";
import type { AcilKelime } from "@/components/report-form/AcilUyarisi";

/**
 * Acil kademesindeki kelimeler. Bildirim formu bunları istemciye alır ve
 * kişi yazarken 112 uyarısını gösterir. Liste veritabanında tutulur ki
 * kelime eklemek yeni bir dağıtım gerektirmesin.
 */
export const acilKelimeler = unstable_cache(
  _acilKelimeler,
  ["ayra:acil-kelimeler"],
  { revalidate: 600, tags: ["alert-keywords"] },
);

async function _acilKelimeler(): Promise<AcilKelime[]> {
  const rows = await withSystem(
    (tx) => tx`
      select word, exclude, context_exclude from public.alert_keywords
       where is_active and tier = 'acil'
       order by word
    `,
  );
  return rows.map((r) => ({
    word: r.word as string,
    exclude: (r.exclude as string[]) ?? [],
    contextExclude: (r.context_exclude as string[]) ?? [],
  }));
}
