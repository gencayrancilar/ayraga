import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { getUserReports } from "@/lib/queries/reports";
import { JoinPanel } from "@/components/auth/JoinPanel";
import { ReportCardItem } from "@/components/ReportCardItem";
import { ProfileTabs, UpgradePanel, LogoutButton } from "@/components/profile/ProfilePanels";
import { EmptyState } from "@/components/ui/Card";
import { IconUser, IconChart, IconArrowRight } from "@/components/icons";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Profil", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getSessionUser();
  if (!user) return <JoinPanel title="Profil" description="Bildirimlerinizi ve desteklerinizi görmek için katılın." />;

  const [authored, supported, resolved] = await Promise.all([
    getUserReports(user.id, "authored"),
    getUserReports(user.id, "supported"),
    getUserReports(user.id, "resolved"),
  ]);

  const panel = (
    items: typeof authored,
    empty: { title: string; description: string; href: string; cta: string },
  ) => (
    <div className="space-y-2.5">
      {items.length === 0 ? (
        <EmptyState
          icon={<IconUser size={30} />}
          title={empty.title}
          description={empty.description}
          action={
            <Link href={empty.href} className="inline-flex h-11 items-center rounded-xl bg-ink-900 px-4 text-sm font-medium text-white">
              {empty.cta}
            </Link>
          }
        />
      ) : (
        items.map((r) => <ReportCardItem key={r.id} report={r} />)
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-4 lg:py-6">
      <header className="mb-5 flex items-center gap-3.5">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-ink-900 text-lg font-semibold text-white">
          {user.displayName.slice(0, 2).toLocaleUpperCase("tr-TR")}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-ink-900">{user.displayName}</h1>
          <p className="text-xs text-ink-500">
            {user.isAnonymous ? "Takma adlı katılımcı" : user.email}
            {user.role !== "citizen" &&
              ` · ${
                user.role === "admin" ? "Yönetici" : user.role === "moderator" ? "Moderatör" : "Mahalle Muhtarı"
              }`}
          </p>
        </div>
      </header>

      <div className="mb-5 grid grid-cols-3 gap-2">
        <Stat label="Bildirdiğim" value={authored.length} />
        <Stat label="Desteklediğim" value={supported.length} />
        <Stat label="Çözülen" value={resolved.length} />
      </div>

      {user.role !== "citizen" && (
        <Link
          href="/yonetim"
          className="mb-4 flex items-center gap-3 rounded-2xl bg-ink-900 p-4 text-white transition-colors hover:bg-ink-800"
        >
          <IconChart size={20} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Yönetim paneli</span>
            <span className="block text-xs text-ink-300">Bildirimler, başvurular, moderasyon ve analitik</span>
          </span>
          <IconArrowRight size={17} />
        </Link>
      )}

      <ProfileTabs
        tabs={[
          {
            key: "authored", label: "Bildirdiklerim", count: authored.length,
            content: panel(authored, {
              title: "Henüz bildirim yapmadınız",
              description: "İlk bildiriminizi yaparak başlayın.",
              href: "/bildir", cta: "Sorun bildir",
            }),
          },
          {
            key: "supported", label: "Desteklediklerim", count: supported.length,
            content: panel(supported, {
              title: "Henüz bir sorunu desteklemediniz",
              description: "Desteklediğiniz sorunlar burada toplanır.",
              href: "/kesfet", cta: "Sorunlara göz at",
            }),
          },
          {
            key: "resolved", label: "Çözülenler", count: resolved.length,
            content: panel(resolved, {
              title: "Henüz çözülen bildiriminiz yok",
              description: "Bildirdiğiniz bir sorun çözüldüğünde burada görünür.",
              href: "/kesfet", cta: "Sorunlara göz at",
            }),
          },
        ]}
      />

      <div className="mt-8 space-y-3">
        {user.isAnonymous && <UpgradePanel />}
        <nav className="overflow-hidden rounded-2xl bg-white ring-1 ring-line">
          <SettingsLink href="/hakkinda">AYRA hakkında</SettingsLink>
          <SettingsLink href="/kurallar">Topluluk kuralları</SettingsLink>
          <SettingsLink href="/gizlilik">Gizlilik</SettingsLink>
        </nav>
        <LogoutButton />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white p-3 text-center ring-1 ring-line">
      <p className="text-xl font-semibold tabular-nums text-ink-900">{formatNumber(value)}</p>
      <p className="mt-0.5 text-2xs text-ink-500">{label}</p>
    </div>
  );
}

function SettingsLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between border-b border-line px-4 py-3.5 text-sm text-ink-700 transition-colors last:border-0 hover:bg-surface-muted"
    >
      {children}
      <IconArrowRight size={15} className="text-ink-300" />
    </Link>
  );
}
