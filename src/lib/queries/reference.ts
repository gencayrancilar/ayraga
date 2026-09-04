import "server-only";
import { unstable_cache } from "next/cache";
import { withSystem } from "../db";
import type { Category, NeighborhoodScore, PlatformStats } from "../types";

/** Kategori ağacı. Yönetim panelinden değişebildiği için kısa süreli önbellek. */
export const getCategoryTree = unstable_cache(
  async (): Promise<Category[]> => {
    const rows = await withSystem(
      (tx) => tx<Category[]>`
        select id, parent_id, name, slug, description, icon, color,
               weight::float8 as weight, sla_days, sort_order, is_active
          from public.report_categories
         where is_active
         order by sort_order, name
      `,
    );
    const roots = rows.filter((c) => !c.parent_id).map((c) => ({ ...c, children: [] as Category[] }));
    const byId = new Map(roots.map((c) => [c.id, c]));
    for (const c of rows) {
      if (c.parent_id && byId.has(c.parent_id)) byId.get(c.parent_id)!.children!.push(c);
    }
    return roots;
  },
  ["ayra:categories"],
  { revalidate: 300, tags: ["categories"] },
);

export async function getCategoriesFlat(): Promise<Category[]> {
  return withSystem(
    (tx) => tx<Category[]>`
      select id, parent_id, name, slug, description, icon, color,
             weight::float8 as weight, sla_days, sort_order, is_active
        from public.report_categories order by sort_order, name
    `,
  );
}

export type NeighborhoodRow = {
  id: string; name: string; slug: string;
  center_lat: number | null; center_lng: number | null;
  population: number | null;
  district_name: string; district_slug: string;
  city_name: string; city_slug: string;
  open_count: number; resolved_count: number; score: number | null;
};

export async function getNeighborhoods(opts: { activeOnly?: boolean; withReportsOnly?: boolean } = {}) {
  return withSystem(
    (tx) => tx<NeighborhoodRow[]>`
      select n.id, n.name, n.slug, n.center_lat, n.center_lng, n.population,
             d.name as district_name, d.slug as district_slug,
             c.name as city_name, c.slug as city_slug,
             coalesce(agg.open_count, 0)::int as open_count,
             coalesce(agg.resolved_count, 0)::int as resolved_count,
             ns.score
        from public.neighborhoods n
        join public.districts d on d.id = n.district_id
        join public.cities c on c.id = d.city_id
        left join public.neighborhood_scores ns on ns.neighborhood_id = n.id
        left join lateral (
          select count(*) filter (where status in ('new','verified','forwarded','in_review','awaiting_resolution')) as open_count,
                 count(*) filter (where status = 'resolved') as resolved_count
            from public.report_cards rc where rc.neighborhood_id = n.id
        ) agg on true
       where (${opts.activeOnly ?? true} = false or n.is_active)
         and (${opts.withReportsOnly ?? false} = false
              or coalesce(agg.open_count, 0) + coalesce(agg.resolved_count, 0) > 0)
       order by (coalesce(agg.open_count,0) + coalesce(agg.resolved_count,0)) desc, n.name
    `,
  );
}

export async function getNeighborhoodBySlug(slug: string) {
  const [row] = await withSystem(
    (tx) => tx<NeighborhoodRow[]>`
      select n.id, n.name, n.slug, n.center_lat, n.center_lng, n.population,
             d.name as district_name, d.slug as district_slug,
             c.name as city_name, c.slug as city_slug,
             0 as open_count, 0 as resolved_count, null::smallint as score
        from public.neighborhoods n
        join public.districts d on d.id = n.district_id
        join public.cities c on c.id = d.city_id
       where n.slug = ${slug}
       limit 1
    `,
  );
  return row ?? null;
}

/** Skor anlık hesaplanır; anlık görüntü tablosu yalnızca liste ekranları için. */
export async function getNeighborhoodScore(neighborhoodId: string): Promise<NeighborhoodScore> {
  const [row] = await withSystem(
    (tx) => tx`select public.compute_neighborhood_score(${neighborhoodId}) as score`,
  );
  return row.score as NeighborhoodScore;
}

export async function getPlatformStats(citySlug?: string): Promise<PlatformStats> {
  const [row] = await withSystem(
    (tx) => tx`select public.platform_stats(${citySlug ?? null}) as stats`,
  );
  const s = row.stats as Record<string, number | null>;
  return {
    total_reports: Number(s.total_reports ?? 0),
    open_reports: Number(s.open_reports ?? 0),
    resolved_reports: Number(s.resolved_reports ?? 0),
    resolved_this_month: Number(s.resolved_this_month ?? 0),
    total_supports: Number(s.total_supports ?? 0),
    forwarded_reports: Number(s.forwarded_reports ?? 0),
    avg_resolution_days: s.avg_resolution_days == null ? null : Number(s.avg_resolution_days),
  };
}

export async function getAuthorities() {
  return withSystem(
    (tx) => tx`
      select a.id, a.name, a.slug, a.short_name, a.kind, a.website,
             a.contact_email, a.contact_phone, a.response_sla_days, a.is_active,
             count(s.id)::int as submission_count,
             count(s.id) filter (where s.response_at is not null)::int as responded_count,
             round(avg(extract(epoch from (s.response_at - s.submitted_at)) / 86400.0)
                   filter (where s.response_at is not null)::numeric, 1) as avg_response_days
        from public.authorities a
        left join public.authority_submissions s on s.authority_id = a.id
       group by a.id
       order by a.name
    `,
  );
}
