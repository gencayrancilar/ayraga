import { requireModerator } from "@/lib/auth/session";
import { withSystem } from "@/lib/db";
import { MuhtarYonetimi } from "@/components/admin/MuhtarYonetimi";

export const dynamic = "force-dynamic";
export const metadata = { title: "Muhtarlar" };

export default async function MuhtarlarSayfasi() {
  await requireModerator();

  const [muhtarlar, duyurular] = await Promise.all([
    withSystem((tx) => tx`
      select o.id, o.title, o.is_active, o.created_at, o.term_end,
             p.display_name, u.email, n.name as neighborhood_name,
             (select count(*) from public.announcements a where a.author_id = o.profile_id and not a.is_hidden)::int as duyuru_sayisi,
             (select count(*) from public.report_official_replies r where r.author_id = o.profile_id and not r.is_hidden)::int as yanit_sayisi
        from public.neighborhood_officials o
        join public.profiles p on p.id = o.profile_id
        join public.neighborhoods n on n.id = o.neighborhood_id
        left join auth.users u on u.id = o.profile_id
       order by o.is_active desc, n.name
    `),
    withSystem((tx) => tx`
      select a.id, a.title, a.body, a.kind::text as kind, a.created_at, a.is_hidden, a.hidden_reason,
             n.name as neighborhood_name, p.display_name as author_name
        from public.announcements a
        join public.neighborhoods n on n.id = a.neighborhood_id
        left join public.profiles p on p.id = a.author_id
       order by a.created_at desc
       limit 30
    `),
  ]);

  return (
    <MuhtarYonetimi muhtarlar={muhtarlar as never} duyurular={duyurular as never} />
  );
}
