import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser, getMuhtarMahalleleri } from "@/lib/auth/session";
import { AyraLogo } from "@/components/Logo";
import { MuhtarNav } from "@/components/muhtar/MuhtarNav";
import { IconArrowRight } from "@/components/icons";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Muhtar Paneli",
  robots: { index: false, follow: false },
};

export default async function MuhtarLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  // Muhtarın ayrı bir giriş ekranı yok: herkesin kullandığı /giris ekranından
  // girer, oturum açtıktan sonra rolüne göre buraya yönlenir.
  if (!user) redirect("/giris");

  const mahalleler = await getMuhtarMahalleleri(user.id);
  if (!mahalleler.length) {
    // Moderatör ya da yönetici buraya düşerse kendi paneline gönderilir;
    // vatandaş ana sayfaya. Yetkisiz bir ekran göstermeyiz.
    redirect(user.role === "moderator" || user.role === "admin" ? "/yonetim" : "/");
  }

  return (
    <div className="min-h-[100dvh] bg-surface-muted">
      <header className="sticky top-0 z-30 border-b border-line bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link href="/muhtar" className="flex items-center gap-2">
            <AyraLogo size="sm" />
          </Link>
          <span className="rounded-full bg-teal-50 px-2.5 py-1 text-2xs font-medium text-teal-700">
            Muhtar Paneli
          </span>
          <span className="hidden truncate text-xs text-ink-500 sm:inline">
            {mahalleler.map((m) => m.name).join(", ")} Mahallesi
          </span>
          <Link
            href="/"
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-ink-900"
          >
            Siteye dön <IconArrowRight size={14} />
          </Link>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 lg:flex-row lg:gap-6">
        <MuhtarNav />
        <main className="min-w-0 flex-1 pb-16">{children}</main>
      </div>
    </div>
  );
}
