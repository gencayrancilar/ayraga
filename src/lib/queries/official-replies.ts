import "server-only";
import { withSystem } from "../db";
import type { ResmiYanitKaydi } from "@/components/report-detail/OfficialReplies";

/** Bir bildirimin yayındaki resmî yanıtları. */
export async function resmiYanitlar(reportId: string): Promise<ResmiYanitKaydi[]> {
  const rows = await withSystem(
    (tx) => tx`
      select o.id, o.body, o.reference_no, o.created_at,
             p.display_name as author_name,
             off.title      as author_title,
             n.name         as neighborhood_name
        from public.report_official_replies o
        left join public.profiles p on p.id = o.author_id
        left join public.neighborhood_officials off
               on off.profile_id = o.author_id and off.is_active
        left join public.neighborhoods n on n.id = off.neighborhood_id
       where o.report_id = ${reportId} and not o.is_hidden
       order by o.created_at
    `,
  );
  return rows as unknown as ResmiYanitKaydi[];
}

/** Bu kişi, bu mahallenin görevli muhtarı mı? */
export async function muhtarMi(userId: string, neighborhoodId: string | null): Promise<boolean> {
  if (!neighborhoodId) return false;
  const rows = await withSystem(
    (tx) => tx`
      select 1 from public.neighborhood_officials
       where profile_id = ${userId} and neighborhood_id = ${neighborhoodId} and is_active
       limit 1
    `,
  );
  return rows.length > 0;
}
