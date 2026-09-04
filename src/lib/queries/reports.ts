import "server-only";
import { withRls, withSystem } from "../db";
import { getClaims } from "../auth/session";
import type { ChainEvent, ReportCard, ReportStatus, Submission } from "../types";


export type ExploreSort = "nearest" | "supported" | "newest" | "resolved" | "longest_open";

export type ExploreFilters = {
  sort?: ExploreSort;
  categorySlug?: string | null;
  neighborhoodSlug?: string | null;
  statuses?: ReportStatus[] | null;
  search?: string | null;
  lat?: number | null;
  lng?: number | null;
  limit?: number;
  offset?: number;
};

/** Keşfet ekranı — bütün filtreler gerçek sorguya yansır. */
export async function listReports(filters: ExploreFilters = {}) {
  const {
    sort = "newest", categorySlug, neighborhoodSlug, statuses,
    search, lat, lng, limit = 20, offset = 0,
  } = filters;

  const claims = await getClaims();

  return withRls(claims, async (tx) => {
    const conditions = [tx`rc.status <> 'duplicate'`];

    if (categorySlug) {
      conditions.push(tx`(rc.category_slug = ${categorySlug} or rc.root_category_id = (
        select c.id from public.report_categories c where c.slug = ${categorySlug}
      ))`);
    }
    if (neighborhoodSlug) conditions.push(tx`rc.neighborhood_slug = ${neighborhoodSlug}`);
    if (statuses?.length) conditions.push(tx`rc.status = any(${statuses}::public.report_status[])`);
    if (search?.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push(tx`(rc.title ilike ${q} or rc.address ilike ${q} or rc.ref_code ilike ${q})`);
    }
    if (sort === "resolved") conditions.push(tx`rc.status = 'resolved'`);
    if (sort === "longest_open") {
      conditions.push(
        tx`rc.status in ('new','verified','forwarded','in_review','awaiting_resolution')`,
      );
    }

    const where = conditions.reduce((acc, cur, i) => (i === 0 ? cur : tx`${acc} and ${cur}`));

    const canSortByDistance = sort === "nearest" && lat != null && lng != null;
    const distanceExpr = canSortByDistance
      ? tx`public.distance_m(${lat}, ${lng}, rc.latitude, rc.longitude)`
      : tx`null::double precision`;

    const orderBy =
      canSortByDistance ? tx`public.distance_m(${lat}, ${lng}, rc.latitude, rc.longitude) asc`
      : sort === "supported" ? tx`rc.support_count desc, rc.created_at desc`
      : sort === "resolved" ? tx`rc.resolved_at desc nulls last`
      : sort === "longest_open" ? tx`rc.created_at asc`
      : tx`rc.created_at desc`;

    const result = await tx<Array<ReportCard & { total_count: string }>>`
      select rc.*,
             ${distanceExpr} as distance_m,
             count(*) over () as total_count
        from public.report_cards rc
       where ${where}
       order by ${orderBy}
       limit ${Math.min(Math.max(limit, 1), 60)} offset ${Math.max(offset, 0)}
    `;

    return {
      items: result.map(({ total_count, ...card }) => ({
        ...card,
        distance_m: card.distance_m ?? undefined,
      })) as ReportCard[],
      total: result.length ? Number(result[0].total_count) : 0,
    };
  });
}

/** Harita viewport'u — yalnızca görünen alandaki bildirimler çekilir. */
export async function reportsInBounds(bounds: {
  minLat: number; minLng: number; maxLat: number; maxLng: number;
  categorySlugs?: string[] | null;
  statuses?: ReportStatus[] | null;
  neighborhoodSlug?: string | null;
  limit?: number;
}) {
  const claims = await getClaims();
  const {
    minLat, minLng, maxLat, maxLng, categorySlugs, statuses, neighborhoodSlug, limit = 800,
  } = bounds;
  const capped = Math.min(Math.max(limit, 1), 2000);

  return withRls(claims, async (tx) => {
    const categoryIds = categorySlugs?.length
      ? (await tx`select id from public.report_categories where slug = any(${categorySlugs})`).map((r) => r.id)
      : null;

    // Mahalle filtresi haritaya sonradan eklendi; RPC imzasını değiştirmek
    // yerine aynı görünüm üzerinden eşdeğer sorgu kurulur.
    if (neighborhoodSlug) {
      return tx<ReportCard[]>`
        select rc.* from public.report_cards rc
         where rc.latitude between ${minLat} and ${maxLat}
           and rc.longitude between ${minLng} and ${maxLng}
           and rc.neighborhood_slug = ${neighborhoodSlug}
           and rc.status <> 'duplicate'
           and (${categoryIds}::uuid[] is null
                or rc.category_id = any(${categoryIds}::uuid[])
                or rc.root_category_id = any(${categoryIds}::uuid[]))
           and (${statuses ?? null}::public.report_status[] is null
                or rc.status = any(${statuses ?? null}::public.report_status[]))
         order by rc.support_count desc, rc.created_at desc
         limit ${capped}
      `;
    }

    return tx<ReportCard[]>`
      select * from public.reports_in_bbox(
        ${minLat}, ${minLng}, ${maxLat}, ${maxLng},
        ${categoryIds}::uuid[],
        ${statuses ?? null}::public.report_status[],
        ${capped}
      )
    `;
  });
}

export async function reportsNearby(lat: number, lng: number, radiusM = 500, limit = 30) {
  const claims = await getClaims();
  return withRls(claims, async (tx) => {
    const rows = await tx<Array<{ reports_nearby: ReportCard }>>`
      select * from public.reports_nearby(${lat}, ${lng}, ${radiusM}, ${limit})
    `;
    return rows.map((r) => r.reports_nearby);
  });
}

export async function similarReports(
  lat: number, lng: number, categoryId: string | null, radiusM = 250,
) {
  const claims = await getClaims();
  return withRls(claims, async (tx) => {
    const rows = await tx<Array<{ similar_reports: ReportCard }>>`
      select * from public.similar_reports(${lat}, ${lng}, ${categoryId}, ${radiusM}, 180, 5)
    `;
    return rows.map((r) => r.similar_reports);
  });
}

export type ReportDetail = {
  report: ReportCard;
  media: Array<{ id: string; storage_path: string; kind: string; width: number | null; height: number | null }>;
  events: ChainEvent[];
  submissions: Submission[];
  chainValid: boolean;
  supportedByMe: boolean;
  duplicateOf: { slug: string; title: string } | null;
  mergedCount: number;
  authorHandle: string | null;
  authorName: string | null;
};

export async function getReportBySlug(slug: string): Promise<ReportDetail | null> {
  const claims = await getClaims();

  return withRls(claims, async (tx) => {
    const [report] = await tx<ReportCard[]>`
      select rc.* from public.report_cards rc where rc.slug = ${slug} limit 1
    `;
    if (!report) return null;

    const [media, events, submissions, chain, supported, dup, merged, author] = await Promise.all([
      tx<ReportDetail["media"]>`select id, storage_path, kind, width, height from public.report_media
          where report_id = ${report.id} order by kind, sort_order, created_at`,
      tx<ChainEvent[]>`
        select e.id::text, e.seq, e.event_type, e.summary, e.payload,
               e.actor_label, p.display_name as actor_name, e.occurred_at, e.hash, e.prev_hash
          from public.report_events e
          left join public.profiles p on p.id = e.actor_id
         where e.report_id = ${report.id}
         order by e.seq`,
      tx<Submission[]>`
        select s.id, s.authority_id, a.name as authority_name, a.short_name as authority_short,
               a.website as authority_website, a.response_sla_days,
               s.channel, s.reference_no, s.submitted_at, s.response_at, s.response_text, s.outcome
          from public.authority_submissions s
          join public.authorities a on a.id = s.authority_id
         where s.report_id = ${report.id}
         order by s.submitted_at desc`,
      tx`select bool_and(ok) as valid from public.verify_report_chain(${report.id})`,
      claims
        ? tx`select 1 from public.report_supports where report_id = ${report.id} and user_id = ${claims.sub}`
        : Promise.resolve([] as unknown[]),
      tx`select r.slug, r.title from public.reports src
           join public.reports r on r.id = src.duplicate_of_id
          where src.id = ${report.id}`,
      tx`select count(*)::int as n from public.reports where duplicate_of_id = ${report.id}`,
      tx`select p.display_name, p.handle, p.is_anonymous
           from public.profiles p where p.id = ${report.user_id}`,
    ]);

    return {
      report,
      media: [...media],
      events,
      submissions,
      chainValid: chain[0]?.valid !== false,
      supportedByMe: supported.length > 0,
      duplicateOf: dup[0] ? { slug: dup[0].slug, title: dup[0].title } : null,
      mergedCount: merged[0]?.n ?? 0,
      authorName: author[0]?.display_name ?? null,
      authorHandle: author[0]?.handle ?? null,
    };
  });
}

/** Görüntülenme kaydı. Aynı ziyaretçi aynı gün bir kez sayılır. */
export async function registerView(reportId: string, viewerHash: string): Promise<number> {
  const [row] = await withSystem(
    (tx) => tx`select public.register_view(${reportId}, ${viewerHash}) as count`,
  );
  return Number(row?.count ?? 0);
}

/**
 * Son çözülen sorunlar. AYRA yalnızca problem göstermemeli; çözüm de en az
 * problem kadar görünür olmalı — bu, platformun negatif bir atmosfere
 * dönüşmesini engelleyen en somut mekanizma.
 */
export async function listRecentlyResolved(limit = 8) {
  const claims = await getClaims();
  return withRls(claims, (tx) => tx<ReportCard[]>`
    select rc.* from public.report_cards rc
     where rc.status = 'resolved'
     order by rc.resolved_at desc nulls last
     limit ${Math.min(Math.max(limit, 1), 24)}
  `);
}

export async function getUserReports(userId: string, kind: "authored" | "supported" | "resolved") {
  const claims = await getClaims();
  return withRls(claims, async (tx) => {
    if (kind === "supported") {
      return tx<ReportCard[]>`
        select rc.* from public.report_cards rc
          join public.report_supports s on s.report_id = rc.id
         where s.user_id = ${userId}
         order by s.created_at desc limit 50`;
    }
    if (kind === "resolved") {
      return tx<ReportCard[]>`
        select rc.* from public.report_cards rc
         where rc.user_id = ${userId} and rc.status = 'resolved'
         order by rc.resolved_at desc limit 50`;
    }
    return tx<ReportCard[]>`
      select rc.* from public.report_cards rc
       where rc.user_id = ${userId}
       order by rc.created_at desc limit 50`;
  });
}
