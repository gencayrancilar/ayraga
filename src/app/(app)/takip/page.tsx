import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { listNotifications, listFollowedReports } from "@/lib/queries/notifications";
import { MarkNotificationsRead } from "@/components/MarkNotificationsRead";
import { JoinPanel } from "@/components/auth/JoinPanel";
import { ReportCardItem } from "@/components/ReportCardItem";
import { EmptyState } from "@/components/ui/Card";
import { IconBell, IconCheck, IconArrowRight } from "@/components/icons";
import { timeAgo } from "@/lib/format";
import { STATUS } from "@/lib/status";
import type { ReportCard, ReportStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Takip", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function FollowPage() {
  const user = await getSessionUser();
  if (!user) {
    return (
      <JoinPanel
        title="Takip ettiklerinizi görmek için katılın"
        description="Desteklediğiniz sorunlarda ne olduğunu buradan takip edersiniz."
      />
    );
  }

  const [notifications, followed] = await Promise.all([listNotifications(), listFollowedReports()]);
  const hasUnread = notifications.some((n) => !n.read_at);

  const open = (followed as ReportCard[]).filter((r) => !["resolved", "unresolved"].includes(r.status));
  const closed = (followed as ReportCard[]).filter((r) => ["resolved", "unresolved"].includes(r.status));

  return (
    <div className="mx-auto max-w-3xl px-4 py-4 lg:py-6">
      <MarkNotificationsRead hasUnread={hasUnread} />
      <header className="mb-5">
        <h1 className="text-2xl font-semibold text-ink-900">Takip</h1>
        <p className="mt-1 text-sm text-ink-600">
          Desteklediğiniz ve bildirdiğiniz sorunlarda olan bitenler.
        </p>
      </header>

      {notifications.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-ink-900">Son güncellemeler</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-white ring-1 ring-line">
            {notifications.slice(0, 12).map((n) => (
              <li key={n.id}>
                <Link
                  href={n.url ?? (n.report_slug ? `/sorun/${n.report_slug}` : "/kesfet")}
                  className={`flex items-start gap-3 p-3.5 transition-colors hover:bg-surface-muted ${
                    n.read_at ? "" : "bg-teal-50/40"
                  }`}
                >
                  <span
                    className={`mt-1 size-2 shrink-0 rounded-full ${
                      n.report_status ? STATUS[n.report_status as ReportStatus].dot : "bg-ink-300"
                    }`}
                    aria-hidden="true"
                  />
                  {!n.read_at && <span className="sr-only">Okunmadı.</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink-900">{n.title}</span>
                    {n.body && <span className="mt-0.5 block truncate text-xs text-ink-600">{n.body}</span>}
                    <span className="mt-0.5 block text-2xs text-ink-400">{timeAgo(n.created_at)}</span>
                  </span>
                  <IconArrowRight size={15} className="mt-1 shrink-0 text-ink-300" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2.5">
        <h2 className="text-sm font-semibold text-ink-900">Takip ettikleriniz</h2>
        {open.length === 0 && closed.length === 0 ? (
          <EmptyState
            icon={<IconBell size={30} />}
            title="Henüz bir sorunu takip etmiyorsunuz"
            description="Bir sorunu desteklediğinizde otomatik olarak takip etmeye başlarsınız."
            action={
              <Link href="/kesfet" className="inline-flex h-11 items-center rounded-xl bg-ink-900 px-4 text-sm font-medium text-white">
                Sorunlara göz at
              </Link>
            }
          />
        ) : (
          open.map((r) => <ReportCardItem key={r.id} report={r} />)
        )}
      </section>

      {closed.length > 0 && (
        <section className="mt-6 space-y-2.5">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink-900">
            <IconCheck size={15} className="text-teal-600" />
            Sonuçlananlar
          </h2>
          {closed.map((r) => <ReportCardItem key={r.id} report={r} compact />)}
        </section>
      )}
    </div>
  );
}
