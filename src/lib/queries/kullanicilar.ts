import "server-only";
import { withSystem } from "../db";
import { requireModerator } from "../auth/session";

/**
 * Katılan hesapların listesi.
 *
 * Kamusal yüzeyde kimse e-postasıyla görünmez; bu okuma yalnızca moderasyon
 * içindir ve requireModerator ile kapalıdır. Amaç kişileri izlemek değil,
 * "kim katıldı, kim muhtar olacak, kim kural dışı davranıyor" sorularına
 * bakabilmek.
 */

export type KullaniciSatiri = {
  id: string;
  display_name: string;
  handle: string | null;
  email: string | null;
  role: string;
  is_anonymous: boolean;
  is_banned: boolean;
  created_at: string;
  son_giris: string | null;
  bildirim: number;
  destek: number;
  muhtar_mahalle: string | null;
  official_id: string | null;
};

export type KullaniciSuzgeci = {
  arama?: string | null;
  tur?: "hepsi" | "kalici" | "takma" | "muhtar" | "yetkili";
  limit?: number;
};

export async function kullanicilar(s: KullaniciSuzgeci = {}): Promise<KullaniciSatiri[]> {
  await requireModerator();
  const { arama, tur = "hepsi", limit = 100 } = s;
  const q = arama?.trim() ? `%${arama.trim()}%` : null;

  return withSystem(
    (tx) => tx<KullaniciSatiri[]>`
      select p.id, p.display_name, p.handle, u.email, p.role::text as role,
             p.is_anonymous, p.is_banned, p.created_at, u.last_sign_in_at as son_giris,
             (select count(*) from public.reports r
               where r.user_id = p.id and not r.is_hidden)::int as bildirim,
             (select count(*) from public.report_supports sp where sp.user_id = p.id)::int as destek,
             n.name as muhtar_mahalle,
             o.id as official_id
        from public.profiles p
        left join auth.users u on u.id = p.id
        left join public.neighborhood_officials o on o.profile_id = p.id and o.is_active
        left join public.neighborhoods n on n.id = o.neighborhood_id
       where (${q}::text is null
              or p.display_name ilike ${q} or u.email ilike ${q} or p.handle ilike ${q})
         and (${tur} = 'hepsi'
              or (${tur} = 'kalici'  and not p.is_anonymous)
              or (${tur} = 'takma'   and p.is_anonymous)
              or (${tur} = 'muhtar'  and o.id is not null)
              or (${tur} = 'yetkili' and p.role in ('moderator', 'admin')))
       order by p.created_at desc
       limit ${limit}
    `,
  );
}

export type KatilimOzeti = {
  toplam: number;
  bugun: number;
  bu_hafta: number;
  bu_ay: number;
  kalici: number;
  muhtar: number;
};

export async function katilimOzeti(): Promise<KatilimOzeti> {
  await requireModerator();
  const [row] = await withSystem(
    (tx) => tx<KatilimOzeti[]>`
      select count(*)::int as toplam,
             count(*) filter (where p.created_at >= date_trunc('day', now()))::int as bugun,
             count(*) filter (where p.created_at >= date_trunc('week', now()))::int as bu_hafta,
             count(*) filter (where p.created_at >= date_trunc('month', now()))::int as bu_ay,
             count(*) filter (where not p.is_anonymous)::int as kalici,
             (select count(*) from public.neighborhood_officials where is_active)::int as muhtar
        from public.profiles p
    `,
  );
  return row;
}
