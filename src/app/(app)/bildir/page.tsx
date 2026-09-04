import type { Metadata } from "next";
import { ReportComposer } from "@/components/report-form/ReportComposer";
import { JoinPanel } from "@/components/auth/JoinPanel";
import { getCategoryTree } from "@/lib/queries/reference";
import { acilKelimeler } from "@/lib/queries/aciliyet";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Sorun bildir",
  description: "Yaşadığınız bölgedeki bir sorunu bir dakikadan kısa sürede bildirin.",
  robots: { index: false },
};

export const dynamic = "force-dynamic";

export default async function ReportPage() {
  const [user, categories, kelimeler] = await Promise.all([
    getSessionUser(),
    getCategoryTree(),
    acilKelimeler(),
  ]);

  if (!user) {
    return (
      <JoinPanel
        title="Sorun bildirmek için katılın"
        description="Aynı sorunun defalarca bildirilmesini önlemek ve destekleri sayabilmek için tek bir kimliğe ihtiyacımız var. E-posta zorunlu değil."
      />
    );
  }

  if (user.isBanned) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <h1 className="text-lg font-semibold text-ink-900">Hesabınız askıya alınmış</h1>
        <p className="mt-2 text-sm text-ink-600">
          Topluluk kurallarının ihlali nedeniyle bildirim yapamıyorsunuz.
          İtiraz için dernekle iletişime geçebilirsiniz.
        </p>
      </div>
    );
  }

  return <ReportComposer categories={categories} acilKelimeler={kelimeler} />;
}
