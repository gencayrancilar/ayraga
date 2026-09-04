import "server-only";
import { withRls, withSystem } from "../db";
import { getClaims, requireMuhtar } from "../auth/session";

/**
 * Muhtar panelinin okuma katmanı.
 *
 * Her sorgu, oturum sahibinin muhtarı olduğu mahallelerle sınırlıdır: mahalle
 * kimlikleri istemciden değil, veritabanındaki atamadan gelir. Bir muhtar
 * adres çubuğuna başka mahalle yazarak komşu mahallenin verisini göremez.
 */

async function mahalleIdleri(): Promise<string[]> {
  const { mahalleler } = await requireMuhtar();
  return mahalleler.map((m) => m.id);
}

export type MuhtarOzet = {
  bu_hafta: number;
  gecen_hafta: number;
  bu_ay: number;
  gecen_ay: number;
  acik: number;
  cozulen_30g: number;
  geciken: number;
  destek_30g: number;
  toplam: number;
};

/** Panel üstündeki sayılar. Haftalar pazartesi başlar (ISO). */
export async function muhtarOzet(): Promise<MuhtarOzet> {
  const ids = await mahalleIdleri();
  const claims = await getClaims();

  return withRls(claims, async (tx) => {
    const [row] = await tx<MuhtarOzet[]>`
      with kapsam as (
        select r.*, c.sla_days
          from public.reports r
          join public.report_categories c on c.id = r.category_id
         where r.neighborhood_id = any(${ids}::uuid[])
           and not r.is_hidden
           and r.status not in ('rejected', 'duplicate')
      )
      select
        count(*) filter (where created_at >= date_trunc('week', now()))::int as bu_hafta,
        count(*) filter (where created_at >= date_trunc('week', now()) - interval '1 week'
                           and created_at <  date_trunc('week', now()))::int as gecen_hafta,
        count(*) filter (where created_at >= date_trunc('month', now()))::int as bu_ay,
        count(*) filter (where created_at >= date_trunc('month', now()) - interval '1 month'
                           and created_at <  date_trunc('month', now()))::int as gecen_ay,
        count(*) filter (where status not in ('resolved', 'unresolved'))::int as acik,
        count(*) filter (where status = 'resolved'
                           and resolved_at >= now() - interval '30 days')::int as cozulen_30g,
        -- Geciken: kuruma iletilmiş, kategori için makul sürede yanıt gelmemiş
        -- Kapanmış kayıt kurumda beklemiyor: çözülen ya da çözülemedi olarak
        -- kapatılanlar bu sayıya girmez.
        count(*) filter (where first_forwarded_at is not null
                           and first_response_at is null
                           and status not in ('resolved', 'unresolved')
                           and first_forwarded_at < now() - make_interval(days => sla_days))::int as geciken,
        coalesce(sum(support_count) filter (where created_at >= now() - interval '30 days'), 0)::int as destek_30g,
        count(*)::int as toplam
      from kapsam
    `;
    return row;
  });
}

export type MuhtarBildirim = {
  id: string;
  ref_code: string;
  slug: string;
  title: string;
  address: string | null;
  status: string;
  support_count: number;
  created_at: string;
  category_name: string;
  category_color: string;
  neighborhood_name: string;
  sla_days: number;
  first_forwarded_at: string | null;
  first_response_at: string | null;
  gecikti: boolean;
  yanitlandi: boolean;
};

export type MuhtarListeSuzgeci = {
  donem?: "hafta" | "ay" | "tum";
  durum?: "acik" | "geciken" | "cozulen" | "tum";
  limit?: number;
};

/** Mahalledeki bildirimler; dönem ve durum süzgeçleriyle. */
export async function muhtarBildirimler(
  s: MuhtarListeSuzgeci = {},
): Promise<MuhtarBildirim[]> {
  const ids = await mahalleIdleri();
  const claims = await getClaims();
  const { donem = "hafta", durum = "tum", limit = 100 } = s;

  return withRls(claims, async (tx) => {
    const donemKosulu =
      donem === "hafta"
        ? tx`r.created_at >= date_trunc('week', now())`
        : donem === "ay"
          ? tx`r.created_at >= date_trunc('month', now())`
          : tx`true`;

    const durumKosulu =
      durum === "acik"
        ? tx`r.status not in ('resolved', 'unresolved')`
        : durum === "cozulen"
          ? tx`r.status = 'resolved'`
          : durum === "geciken"
            ? tx`(r.first_forwarded_at is not null and r.first_response_at is null
                  and r.status not in ('resolved', 'unresolved')
                  and r.first_forwarded_at < now() - make_interval(days => c.sla_days))`
            : tx`true`;

    return tx<MuhtarBildirim[]>`
      select r.id, r.ref_code, r.slug, r.title, r.address, r.status::text as status,
             r.support_count, r.created_at, r.first_forwarded_at, r.first_response_at,
             c.name as category_name, c.color as category_color, c.sla_days,
             n.name as neighborhood_name,
             (r.first_forwarded_at is not null and r.first_response_at is null
              and r.status not in ('resolved', 'unresolved')
              and r.first_forwarded_at < now() - make_interval(days => c.sla_days)) as gecikti,
             exists (select 1 from public.report_official_replies o
                      where o.report_id = r.id and not o.is_hidden) as yanitlandi
        from public.reports r
        join public.report_categories c on c.id = r.category_id
        join public.neighborhoods n on n.id = r.neighborhood_id
       where r.neighborhood_id = any(${ids}::uuid[])
         and not r.is_hidden
         and r.status not in ('rejected', 'duplicate')
         and ${donemKosulu}
         and ${durumKosulu}
       order by r.support_count desc, r.created_at desc
       limit ${limit}
    `;
  });
}

export type IsiNoktasi = {
  latitude: number;
  longitude: number;
  agirlik: number;
  gecikti: boolean;
  category_slug: string;
  category_name: string;
  category_color: string;
  title: string;
  slug: string;
};

/**
 * Isı haritasının ham noktaları. Ağırlık = 1 + destek; böylece çok
 * desteklenen bir sorun haritada daha koyu görünür.
 */
export async function muhtarIsiNoktalari(): Promise<IsiNoktasi[]> {
  const ids = await mahalleIdleri();
  const claims = await getClaims();

  return withRls(claims, async (tx) =>
    tx<IsiNoktasi[]>`
      select r.latitude, r.longitude, r.title, r.slug,
             (1 + r.support_count)::int as agirlik,
             (r.first_forwarded_at is not null and r.first_response_at is null
              and r.status not in ('resolved', 'unresolved')
              and r.first_forwarded_at < now() - make_interval(days => c.sla_days)) as gecikti,
             coalesce(pc.slug, c.slug) as category_slug,
             coalesce(pc.name, c.name) as category_name,
             coalesce(pc.color, c.color) as category_color
        from public.reports r
        join public.report_categories c on c.id = r.category_id
        left join public.report_categories pc on pc.id = c.parent_id
       where r.neighborhood_id = any(${ids}::uuid[])
         and not r.is_hidden
         and r.status not in ('rejected', 'duplicate', 'resolved')
       limit 2000
    `,
  );
}

export type KategoriSatiri = { slug: string; name: string; color: string; adet: number; destek: number };

/** Kategori dağılımı — ısı haritasının yanındaki döküm. */
export async function muhtarKategoriDagilimi(): Promise<KategoriSatiri[]> {
  const ids = await mahalleIdleri();
  const claims = await getClaims();

  return withRls(claims, async (tx) =>
    tx<KategoriSatiri[]>`
      select coalesce(pc.slug, c.slug) as slug,
             coalesce(pc.name, c.name) as name,
             coalesce(pc.color, c.color) as color,
             count(*)::int as adet,
             coalesce(sum(r.support_count), 0)::int as destek
        from public.reports r
        join public.report_categories c on c.id = r.category_id
        left join public.report_categories pc on pc.id = c.parent_id
       where r.neighborhood_id = any(${ids}::uuid[])
         and not r.is_hidden
         and r.status not in ('rejected', 'duplicate')
       group by 1, 2, 3
       order by adet desc
    `,
  );
}

export type Duyuru = {
  id: string;
  neighborhood_id: string;
  neighborhood_name: string;
  kind: string;
  title: string;
  body: string;
  starts_at: string | null;
  ends_at: string | null;
  is_hidden: boolean;
  hidden_reason: string | null;
  author_name: string | null;
  created_at: string;
};

/** Muhtarın kendi duyuruları — gizlenmiş olanlar gerekçesiyle birlikte. */
export async function muhtarDuyurulari(): Promise<Duyuru[]> {
  const { id } = await requireMuhtar();
  const claims = await getClaims();

  return withRls(claims, async (tx) =>
    tx<Duyuru[]>`
      select a.id, a.neighborhood_id, n.name as neighborhood_name, a.kind::text as kind,
             a.title, a.body, a.starts_at, a.ends_at, a.is_hidden, a.hidden_reason,
             p.display_name as author_name, a.created_at
        from public.announcements a
        join public.neighborhoods n on n.id = a.neighborhood_id
        left join public.profiles p on p.id = a.author_id
       where a.author_id = ${id}
       order by a.created_at desc
       limit 100
    `,
  );
}

/** Bir mahallenin yayındaki duyuruları — kamuya açık yüzey için. */
export async function mahalleDuyurulari(neighborhoodSlug: string, limit = 5): Promise<Duyuru[]> {
  return withSystem(
    (tx) => tx<Duyuru[]>`
      select a.id, a.neighborhood_id, n.name as neighborhood_name, a.kind::text as kind,
             a.title, a.body, a.starts_at, a.ends_at, a.is_hidden, a.hidden_reason,
             coalesce(o.title, 'Mahalle Muhtarı') as author_name, a.created_at
        from public.announcements a
        join public.neighborhoods n on n.id = a.neighborhood_id
        left join public.neighborhood_officials o
               on o.profile_id = a.author_id and o.neighborhood_id = a.neighborhood_id
       where n.slug = ${neighborhoodSlug}
         and not a.is_hidden
         and (a.ends_at is null or a.ends_at >= now())
       order by a.created_at desc
       limit ${limit}
    `,
  );
}

/** Mahallenin muhtarı — mahalle sayfasında gösterilir. */
export async function mahalleMuhtari(neighborhoodSlug: string) {
  const rows = await withSystem(
    (tx) => tx`
      select p.display_name, o.title, o.term_start
        from public.neighborhood_officials o
        join public.neighborhoods n on n.id = o.neighborhood_id
        join public.profiles p on p.id = o.profile_id
       where n.slug = ${neighborhoodSlug} and o.is_active
       limit 1
    `,
  );
  const r = rows[0];
  return r
    ? { ad: r.display_name as string, unvan: (r.title as string) ?? "Mahalle Muhtarı" }
    : null;
}
