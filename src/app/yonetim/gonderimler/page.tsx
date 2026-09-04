import { requireModerator } from "@/lib/auth/session";
import { withSystem } from "@/lib/db";
import { GonderimListesi } from "@/components/admin/GonderimListesi";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kuruma gönderimler" };

export default async function GonderimlerSayfasi() {
  await requireModerator();

  const [gonderimler, kurumlar, ozet] = await Promise.all([
    withSystem((tx) => tx`
      select o.id, o.kind, o.subject, o.body, o.status, o.error, o.recipients,
             o.created_at, o.sent_at, a.name as authority_name, r.ref_code
        from public.outbound_messages o
        left join public.authorities a on a.id = o.authority_id
        left join public.reports r on r.id = o.report_id
       order by o.created_at desc
       limit 50
    `),
    // Sayaç onaylıları gösterir: gönderilecek olan budur, aday havuzu değil.
    withSystem((tx) => tx`
      select o.authority_name as name, o.contact_email,
             o.onayli as bekleyen, o.bekleyen as karar_bekleyen
        from public.gonderim_ozeti() o
       order by o.authority_name
    `),
    withSystem((tx) => tx`
      select count(*) filter (where status = 'sent')::int as gonderildi,
             count(*) filter (where status = 'failed')::int as hata,
             count(*) filter (where status = 'skipped')::int as atlanan
        from public.outbound_messages
    `),
  ]);

  return (
    <GonderimListesi
      gonderimler={gonderimler as never}
      kurumlar={kurumlar as never}
      ozet={(ozet as never as Array<{ gonderildi: number; hata: number; atlanan: number }>)[0]}
    />
  );
}
