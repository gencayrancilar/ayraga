import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { KurulumSeridi } from "@/components/kurulum/KurulumSeridi";
import { getSessionUser } from "@/lib/auth/session";
import { getUnreadCount } from "@/lib/queries/notifications";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  const unread = user ? await getUnreadCount(user.id) : 0;

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <AppHeader user={user} />
      <main id="icerik" className="flex-1">
        {children}
      </main>
      <KurulumSeridi />
      <BottomNav unreadCount={unread} />
    </div>
  );
}
