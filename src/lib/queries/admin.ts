import "server-only";
import { withRls } from "../db";
import { getClaims, requireModerator } from "../auth/session";
import type { ReportCard, ReportStatus } from "../types";

export type AdminFilters = {
  status?: ReportStatus[] | null;
  categorySlug?: string | null;
  neighborhoodSlug?: string | null;
  search?: string | null;
  from?: string | null;
  to?: string | null;
  minSupport?: number | null;
  needsAction?: boolean;
  limit?: number;
  offset?: number;
};

/** Yönetim panelinin bildirim listesi. Tüm filtreler sorguya yansır. */
export async function adminListReports(filters: AdminFilters = {}) {
  await requireModerator();
  const claims = await getClaims();
  const { limit = 40, offset = 0 } = filters;

  return withRls(claims, async (tx) => {
    const conditions = [tx`true`];

    if (filters.status?.length) conditions.push(tx`r.status = any(${filters.status}::public.report_status[])`);
    if (filters.categorySlug) {
      conditions.push(tx`(c.slug = ${filters.categorySlug} or pc.slug = ${filters.categorySlug})`);
    }
    if (filters.neighborhoodSlug) conditions.push(tx`n.slug = ${filters.neighborhoodSlug}`);
    if (filters.search?.trim()) {
      const q = `%${filters.search.trim()}%`;
      conditions.push(tx`(r.title ilike ${q} or r.address ilike ${q} or r.ref_code ilike ${q})`);
    }
    if (filters.from) conditions.push(tx`r.created_at >= ${filters.from}::date`);
    if (filters.to) conditions.push(tx`r.created_at < (${filters.to}::date + 1)`);
    if (filters.minSupport != null) conditions.push(tx`r.support_count >= ${filters.minSupport}`);
    if (filters.needsAction) {
      conditions.push(tx`(
        r.status = 'new'
        or (r.status = 'verified' and r.created_at < now() - interval '3 days')
        or (r.first_forwarded_at is not null and r.first_response_at is null
            and r.first_forwarded_at < now() - make_interval(days => c.sla_days))
        or exists (select 1 from public.moderation_reports m where m.report_id = r.id and m.status = 'open')
      )`);
    }

    const where = conditions.reduce((acc, cur, i) => (i === 0 ? cur : tx`${acc} and ${cur}`));

    const rows = await tx<Array<ReportCard & {
      total_count: string; open_flags: number; submission_count: number;
      author_name: string | null; is_hidden: boolean;
    }>>`
      select r.id, r.ref_code, r.slug, r.title, r.description, r.status,
             r.latitude, r.longitude, r.address, r.support_count, r.view_count,
             r.created_at, r.updated_at, r.resolved_at, r.first_forwarded_at,
             r.first_response_at, r.user_id, r.is_hidden,
             c.id as category_id, c.name as category_name, c.slug as category_slug,
             c.icon as category_icon, c.color as category_color, c.sla_days,
             coalesce(pc.id, c.id) as root_category_id,
             coalesce(pc.name, c.name) as root_category_name,
             n.id as neighborhood_id, n.name as neighborhood_name, n.slug as neighborhood_slug,
             d.name as district_name, d.slug as district_slug,
             ct.name as city_name, ct.slug as city_slug,
             (select m.storage_path from public.report_media m
               where m.report_id = r.id and m.kind = 'issue' order by m.sort_order limit 1) as cover_path,
             null::text as resolution_path,
             (select count(*)::int from public.report_media m where m.report_id = r.id) as media_count,
             case when r.first_forwarded_at is not null and r.first_response_at is null
                  then extract(epoch from (now() - r.first_forwarded_at)) / 3600.0 end as awaiting_response_hours,
             case when r.resolved_at is not null
                  then extract(epoch from (r.resolved_at - r.created_at)) / 86400.0 end as resolution_days,
             (select count(*)::int from public.moderation_reports m
               where m.report_id = r.id and m.status = 'open') as open_flags,
             (select count(*)::int from public.authority_submissions s where s.report_id = r.id) as submission_count,
             p.display_name as author_name,
             count(*) over () as total_count
        from public.reports r
        join public.report_categories c on c.id = r.category_id
        left join public.report_categories pc on pc.id = c.parent_id
        left join public.neighborhoods n on n.id = r.neighborhood_id
        left join public.districts d on d.id = r.district_id
        left join public.cities ct on ct.id = r.city_id
        left join public.profiles p on p.id = r.user_id
       where ${where}
       order by
         (r.status = 'new') desc,
         (select count(*) from public.moderation_reports m where m.report_id = r.id and m.status = 'open') desc,
         r.created_at desc
       limit ${Math.min(limit, 100)} offset ${offset}
    `;

    return {
      items: rows.map(({ total_count, ...row }) => row),
      total: rows.length ? Number(rows[0].total_count) : 0,
    };
  });
}

export async function adminGetReport(id: string) {
  await requireModerator();
  const claims = await getClaims();

  return withRls(claims, async (tx) => {
    const [report] = await tx`
      select r.*, c.name as category_name, c.slug as category_slug, c.color as category_color,
             c.icon as category_icon, c.sla_days,
             n.name as neighborhood_name, n.slug as neighborhood_slug,
             d.name as district_name, ct.name as city_name,
             p.display_name as author_name, p.is_anonymous as author_anonymous
        from public.reports r
        join public.report_categories c on c.id = r.category_id
        left join public.neighborhoods n on n.id = r.neighborhood_id
        left join public.districts d on d.id = r.district_id
        left join public.cities ct on ct.id = r.city_id
        left join public.profiles p on p.id = r.user_id
       where r.id = ${id}`;
    if (!report) return null;

    const [media, submissions, history, flags, events, duplicates] = await Promise.all([
      tx`select id, storage_path, kind, sort_order from public.report_media
          where report_id = ${id} order by kind, sort_order`,
      tx`select s.*, a.name as authority_name, a.short_name as authority_short
           from public.authority_submissions s
           join public.authorities a on a.id = s.authority_id
          where s.report_id = ${id} order by s.submitted_at desc`,
      tx`select h.*, p.display_name as actor_name
           from public.report_status_history h
           left join public.profiles p on p.id = h.actor_id
          where h.report_id = ${id} order by h.created_at`,
      tx`select m.*, p.display_name as reporter_name
           from public.moderation_reports m
           left join public.profiles p on p.id = m.reporter_id
          where m.report_id = ${id} order by m.created_at desc`,
      tx`select seq, event_type, summary, occurred_at, hash from public.report_events
          where report_id = ${id} order by seq`,
      tx`select id, ref_code, title, slug from public.reports where duplicate_of_id = ${id}`,
    ]);

    return {
      report,
      media: [...media],
      submissions: [...submissions],
      history: [...history],
      flags: [...flags],
      events: [...events],
      duplicates: [...duplicates],
    };
  });
}

/** Analitik — tüm sayılar canlı veriden gelir. */
export async function adminAnalytics(days = 90) {
  await requireModerator();
  const claims = await getClaims();

  return withRls(claims, async (tx) => {
    const [totals] = await tx`
      select
        count(*)::int as total,
        count(*) filter (where status in ('new','verified','forwarded','in_review','awaiting_resolution'))::int as open,
        count(*) filter (where status = 'resolved')::int as resolved,
        count(*) filter (where status = 'unresolved')::int as unresolved,
        count(*) filter (where status = 'new')::int as awaiting_review,
        count(*) filter (where created_at > now() - interval '7 days')::int as last_week,
        coalesce(sum(support_count), 0)::int as supports,
        round(avg(extract(epoch from (resolved_at - created_at)) / 86400.0)
              filter (where resolved_at is not null)::numeric, 1) as avg_resolution_days,
        round(percentile_cont(0.5) within group (
          order by extract(epoch from (resolved_at - created_at)) / 86400.0
        ) filter (where resolved_at is not null)::numeric, 1) as median_resolution_days
      from public.reports where not is_hidden and status <> 'duplicate'`;

    const [pending] = await tx`
      select
        count(*) filter (where m.status = 'open')::int as open_flags,
        (select count(*)::int from public.reports r
          where r.first_forwarded_at is not null and r.first_response_at is null
            and r.status not in ('resolved','unresolved','duplicate','rejected')) as awaiting_authority
      from public.moderation_reports m`;

    const [byCategory, byNeighborhood, byStatus, timeline, authorities] = await Promise.all([
      tx`select coalesce(pc.name, c.name) as name, coalesce(pc.color, c.color) as color,
                coalesce(pc.icon, c.icon) as icon,
                count(*)::int as total,
                count(*) filter (where r.status = 'resolved')::int as resolved
           from public.reports r
           join public.report_categories c on c.id = r.category_id
           left join public.report_categories pc on pc.id = c.parent_id
          where not r.is_hidden and r.status <> 'duplicate'
            and r.created_at > now() - make_interval(days => ${days})
          group by 1, 2, 3 order by total desc`,
      tx`select n.name, n.slug, count(*)::int as total,
                count(*) filter (where r.status = 'resolved')::int as resolved,
                coalesce(sum(r.support_count), 0)::int as supports
           from public.reports r
           join public.neighborhoods n on n.id = r.neighborhood_id
          where not r.is_hidden and r.status <> 'duplicate'
            and r.created_at > now() - make_interval(days => ${days})
          group by 1, 2 order by total desc limit 12`,
      tx`select status::text, count(*)::int as total
           from public.reports where not is_hidden group by 1`,
      tx`select to_char(date_trunc('week', created_at), 'YYYY-MM-DD') as week,
                count(*)::int as created,
                count(*) filter (where status = 'resolved')::int as resolved
           from public.reports
          where created_at > now() - make_interval(days => ${days}) and not is_hidden
          group by 1 order by 1`,
      tx`select a.name, a.short_name, count(s.id)::int as submissions,
                count(s.id) filter (where s.response_at is not null)::int as responded,
                round(avg(extract(epoch from (s.response_at - s.submitted_at)) / 86400.0)
                      filter (where s.response_at is not null)::numeric, 1) as avg_days,
                a.response_sla_days
           from public.authorities a
           join public.authority_submissions s on s.authority_id = a.id
          group by a.id order by submissions desc`,
    ]);

    const topSupported = await tx`
      select r.id, r.slug, r.title, r.support_count, r.status::text, n.name as neighborhood_name
        from public.reports r
        left join public.neighborhoods n on n.id = r.neighborhood_id
       where not r.is_hidden and r.status <> 'duplicate'
       order by r.support_count desc limit 8`;

    return {
      totals, pending,
      byCategory: [...byCategory],
      byNeighborhood: [...byNeighborhood],
      byStatus: [...byStatus],
      timeline: [...timeline],
      authorities: [...authorities],
      topSupported: [...topSupported],
    };
  });
}

/** Isı haritası için ham noktalar. */
export async function adminHeatmapPoints(categorySlug?: string | null, status?: string | null) {
  await requireModerator();
  const claims = await getClaims();
  return withRls(claims, (tx) => tx`
    select r.latitude, r.longitude, r.support_count, c.color, coalesce(pc.slug, c.slug) as category_slug
      from public.reports r
      join public.report_categories c on c.id = r.category_id
      left join public.report_categories pc on pc.id = c.parent_id
     where not r.is_hidden and r.status <> 'duplicate'
       and (${categorySlug ?? null}::text is null or coalesce(pc.slug, c.slug) = ${categorySlug ?? null})
       and (${status ?? null}::text is null or r.status::text = ${status ?? null})
     limit 5000`);
}

export async function adminModerationQueue() {
  await requireModerator();
  const claims = await getClaims();
  return withRls(claims, (tx) => tx`
    select m.id, m.reason, m.detail, m.status, m.created_at,
           r.id as report_id, r.ref_code, r.slug, r.title, r.is_hidden, r.status::text as report_status,
           p.display_name as reporter_name,
           count(*) over (partition by m.report_id) as flags_on_report
      from public.moderation_reports m
      join public.reports r on r.id = m.report_id
      left join public.profiles p on p.id = m.reporter_id
     where m.status in ('open', 'reviewing')
     order by m.created_at desc limit 100`);
}
