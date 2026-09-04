import "server-only";
import { withRls, withSystem } from "../db";
import { getClaims } from "../auth/session";

export type NotificationRow = {
  id: string;
  report_id: string | null;
  kind: string;
  title: string;
  body: string | null;
  url: string | null;
  read_at: string | null;
  created_at: string;
  report_slug: string | null;
  report_status: string | null;
};

export async function getUnreadCount(userId: string): Promise<number> {
  const [row] = await withSystem(
    (tx) => tx`select count(*)::int as n from public.notifications
                where user_id = ${userId} and read_at is null`,
  );
  return row?.n ?? 0;
}

export async function listNotifications(limit = 50) {
  const claims = await getClaims();
  if (!claims) return [] as NotificationRow[];
  return withRls(claims, (tx) => tx<NotificationRow[]>`
    select n.id, n.report_id, n.kind, n.title, n.body, n.url, n.read_at, n.created_at,
           r.slug as report_slug, r.status::text as report_status
      from public.notifications n
      left join public.reports r on r.id = n.report_id
     where n.user_id = ${claims.sub}
     order by n.created_at desc
     limit ${limit}
  `);
}

/** Takip edilen sorunlar — "bunu bildirdik, sonra ne oldu?" ekranının kaynağı. */
export async function listFollowedReports() {
  const claims = await getClaims();
  if (!claims) return [];
  return withRls(claims, (tx) => tx`
    select rc.*, f.created_at as followed_at
      from public.report_cards rc
      join public.report_follows f on f.report_id = rc.id
     where f.user_id = ${claims.sub}
     order by
       case when rc.status in ('resolved','unresolved') then 1 else 0 end,
       rc.updated_at desc
     limit 50
  `);
}
