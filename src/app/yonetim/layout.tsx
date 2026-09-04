import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { AyraLogo } from "@/components/Logo";
import { AdminNav } from "@/components/admin/AdminNav";
import { IconArrowRight } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/giris");
  // Muhtar rolü yönetim panelinin kullanıcısı değildir; kendi paneline gider.
  if (user.role !== "moderator" && user.role !== "admin") {
    redirect(user.role === "muhtar" ? "/muhtar" : "/");
  }

  return (
    <div className="min-h-[100dvh] bg-surface-muted">
      <header className="sticky top-0 z-30 border-b border-line bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <Link href="/yonetim" className="flex items-center gap-2">
            <AyraLogo size="sm" />
          </Link>
          <span className="rounded-full bg-ink-100 px-2.5 py-1 text-2xs font-medium text-ink-700">
            Yönetim
          </span>
          <Link
            href="/"
            className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 hover:text-ink-900"
          >
            Siteye dön <IconArrowRight size={14} />
          </Link>
          <span className="hidden text-xs text-ink-500 sm:inline">{user.displayName}</span>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 lg:flex-row lg:gap-6">
        <AdminNav />
        <main className="min-w-0 flex-1 pb-16">{children}</main>
      </div>
    </div>
  );
}
