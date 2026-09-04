import "server-only";
import { withSystem } from "../db";

/**
 * Kuruma gönderim onayı — okuma tarafı.
 *
 * Kuruma yazı göndermek geri alınamaz bir iştir; ne gideceğine bir insanın
 * bakması gerekir. Bu ekran o bakışın yeridir: hangi bildirim hangi kuruma
 * aday, hangisi onaylanmış, hangisi bilerek dışarıda bırakılmış.
 */

export type KurumOzeti = {
  authority_id: string;
  authority_name: string;
  contact_email: string | null;
  bekleyen: number;   // henüz karar verilmemiş
  onayli: number;     // ilk gönderimde yola çıkacak
  haric: number;      // bilerek dışarıda bırakılmış
};

export type Aday = {
  report_id: string;
  ref_code: string;
  slug: string;
  title: string;
  address: string | null;
  latitude: number;
  longitude: number;
  category: string;
  category_id: string;
  neighborhood: string;
  support_count: number;
  urgency: "normal" | "hizli" | "acil";
  created_at: string;
  decision: "approved" | "excluded" | null;
  decision_note: string | null;
  decided_at: string | null;
  /** Kurumu kategorisi değil, bir moderatör belirledi. */
  elle_atandi: boolean;
  atama_notu: string | null;
};

export type KurumSecenegi = { id: string; name: string; short_name: string | null };

export async function kurumSecenekleri(): Promise<KurumSecenegi[]> {
  const satirlar = await withSystem((tx) => tx`
    select id, name, short_name from public.authorities
     where is_active order by name
  `);
  return satirlar as unknown as KurumSecenegi[];
}

export async function gonderimOzeti(): Promise<KurumOzeti[]> {
  const satirlar = await withSystem((tx) => tx`select * from public.gonderim_ozeti()`);
  return satirlar as unknown as KurumOzeti[];
}

export async function kurumAdaylari(authorityId: string): Promise<Aday[]> {
  const satirlar = await withSystem(
    (tx) => tx`select * from public.kuruma_adaylar(${authorityId})`,
  );
  return satirlar as unknown as Aday[];
}

export type YonlendirmeSatiri = {
  category_id: string;
  category_name: string;
  category_slug: string;
  parent_name: string | null;
  authority_id: string | null;
  authority_name: string | null;
  /** Eşleme kategorinin kendisinde tanımlı; false ise üst kategoriden devralınmış. */
  dogrudan: boolean;
  acik_bildirim: number;
};

export async function kategoriYonlendirmesi(): Promise<YonlendirmeSatiri[]> {
  const satirlar = await withSystem((tx) => tx`select * from public.kategori_yonlendirme()`);
  return satirlar as unknown as YonlendirmeSatiri[];
}
