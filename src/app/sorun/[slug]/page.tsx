import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { getReportBySlug, registerView, reportsNearby } from "@/lib/queries/reports";
import { getSessionUser } from "@/lib/auth/session";
import { publicConfig, publicMediaUrl } from "@/lib/public-config";
import { formatDate, formatDateTime, formatNumber, timeAgo } from "@/lib/format";
import { STATUS } from "@/lib/status";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { StatusBadge } from "@/components/ui/Badge";
import { SupportButton } from "@/components/report-detail/SupportButton";
import { SilenceCounter } from "@/components/report-detail/SilenceCounter";
import { EvidenceChain } from "@/components/report-detail/EvidenceChain";
import { StatusTimeline } from "@/components/report-detail/StatusTimeline";
import { ShareRow } from "@/components/report-detail/ShareRow";
import { ReportAbuseDialog } from "@/components/report-detail/ReportAbuseDialog";
import { ReportCardItem } from "@/components/ReportCardItem";
import { OfficialReplies } from "@/components/report-detail/OfficialReplies";
import { ResmiYanitFormu } from "@/components/muhtar/ResmiYanit";
import { resmiYanitlar, muhtarMi } from "@/lib/queries/official-replies";
import { CategoryIcon, IconChevronLeft, IconExternal, IconPin, IconCheck } from "@/components/icons";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getReportBySlug(slug);
  if (!detail) return { title: "Sorun bulunamadı" };

  const r = detail.report;
  const place = [r.neighborhood_name, r.district_name, r.city_name].filter(Boolean).join(", ");
  const description =
    r.description?.slice(0, 160) ??
    `${r.category_name} · ${place}. ${r.support_count} kişi bu sorunu destekliyor. Durum: ${STATUS[r.status].label}.`;

  return {
    title: r.title,
    description,
    alternates: { canonical: `/sorun/${r.slug}` },
    openGraph: {
      type: "article",
      title: r.title,
      description,
      url: `/sorun/${r.slug}`,
      publishedTime: r.created_at,
      modifiedTime: r.updated_at,
      images: [{ url: `/api/paylasim/${r.slug}`, width: 1200, height: 630, alt: r.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: r.title,
      description,
      images: [`/api/paylasim/${r.slug}`],
    },
  };
}

export default async function ReportDetailPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const query = await searchParams;
  const [detail, user] = await Promise.all([getReportBySlug(slug), getSessionUser()]);
  if (!detail) notFound();

  const { report: r, media, events, submissions, chainValid, supportedByMe, duplicateOf, mergedCount } = detail;

  // Muhtar yanıtları herkese görünür; yanıt yazma yetkisi yalnızca bu
  // bildirimin bulunduğu mahallenin muhtarındadır.
  const [yanitlar, yanitYazabilir] = await Promise.all([
    resmiYanitlar(r.id),
    user ? muhtarMi(user.id, r.neighborhood_id) : Promise.resolve(false),
  ]);

  // Görüntülenme — aynı ziyaretçi aynı gün bir kez sayılır, IP saklanmaz.
  const h = await headers();
  const viewerHash = createHash("sha256")
    .update(`${h.get("x-forwarded-for") ?? "?"}|${h.get("user-agent") ?? "?"}|${new Date().toDateString()}|ayra`)
    .digest("hex")
    .slice(0, 40);
  // İkisi birbirinden bağımsız; sırayla beklemek sayfayı bir sorgu boyu geciktiriyordu.
  const [viewCount, yakindakiler] = await Promise.all([
    registerView(r.id, viewerHash),
    reportsNearby(r.latitude, r.longitude, 700, 6),
  ]);
  const nearby = yakindakiler.filter((n) => n.id !== r.id).slice(0, 3);

  const issueMedia = media.filter((m) => m.kind === "issue");
  const resolutionMedia = media.filter((m) => m.kind === "resolution");
  const place = [r.neighborhood_name, r.district_name].filter(Boolean).join(", ");
  const url = `${publicConfig.siteUrl}/sorun/${r.slug}`;
  const openSubmission = submissions.find((s) => !s.response_at);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Report",
    headline: r.title,
    description: r.description ?? undefined,
    identifier: r.ref_code,
    datePublished: r.created_at,
    dateModified: r.updated_at,
    url,
    image: r.cover_path ? `${publicConfig.siteUrl}${publicMediaUrl(r.cover_path)}` : undefined,
    about: r.category_name,
    contentLocation: {
      "@type": "Place",
      name: place || r.address || undefined,
      address: {
        "@type": "PostalAddress",
        streetAddress: r.address ?? undefined,
        addressLocality: r.district_name ?? undefined,
        addressRegion: r.city_name ?? undefined,
        addressCountry: "TR",
      },
      geo: { "@type": "GeoCoordinates", latitude: r.latitude, longitude: r.longitude },
    },
    interactionStatistic: [
      { "@type": "InteractionCounter", interactionType: "https://schema.org/LikeAction", userInteractionCount: r.support_count },
      { "@type": "InteractionCounter", interactionType: "https://schema.org/ViewAction", userInteractionCount: r.view_count },
    ],
    publisher: { "@type": "Organization", name: "AYRA — Genç Ayrancılar Derneği", url: publicConfig.siteUrl },
  };

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <AppHeader user={user} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <main id="icerik" className="flex-1 pb-8">
        <div className="mx-auto max-w-5xl px-4 py-4 lg:py-6">
          <Link href="/kesfet" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-ink-500 hover:text-ink-800">
            <IconChevronLeft size={14} /> Keşfet
          </Link>

          {query.yeni === "1" && (
            <p className="mb-4 flex items-start gap-2 rounded-2xl bg-teal-50 p-3.5 text-sm text-teal-900 ring-1 ring-inset ring-teal-200">
              <IconCheck size={17} className="mt-0.5 shrink-0 text-teal-600" />
              <span>
                <strong className="font-semibold">Bildiriminiz yayında.</strong> Doğrulandıktan sonra ilgili
                kuruma iletilecek; her adımı buradan takip edebilirsiniz.
              </span>
            </p>
          )}

          {duplicateOf && (
            <p className="mb-4 rounded-2xl bg-surface-muted p-3.5 text-sm text-ink-700 ring-1 ring-inset ring-line">
              Bu bildirim{" "}
              <Link href={`/sorun/${duplicateOf.slug}`} className="font-medium underline underline-offset-2">
                {duplicateOf.title}
              </Link>{" "}
              kaydıyla birleştirildi. Destekleriniz orada toplanıyor.
            </p>
          )}

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
            {/* ── Ana sütun ─────────────────────────────────────────── */}
            <div className="space-y-5">
              <article className="overflow-hidden rounded-2xl bg-white ring-1 ring-line">
                {issueMedia.length > 0 ? (
                  <div className={issueMedia.length > 1 ? "grid grid-cols-2 gap-0.5" : ""}>
                    {issueMedia.map((m, i) => (
                      <div
                        key={m.id}
                        className={`relative bg-surface-sunken ${issueMedia.length === 1 ? "aspect-[16/10]" : i === 0 ? "col-span-2 aspect-[16/9]" : "aspect-square"}`}
                      >
                        <Image
                          src={publicMediaUrl(m.storage_path)!}
                          alt={i === 0 ? r.title : `${r.title} — görsel ${i + 1}`}
                          fill
                          sizes="(max-width: 1024px) 100vw, 640px"
                          priority={i === 0}
                          className="object-cover"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div
                    className="flex aspect-[16/6] items-center justify-center bg-surface-sunken"
                    style={{ color: r.category_color }}
                    aria-hidden="true"
                  >
                    <CategoryIcon name={r.category_icon} size={44} />
                  </div>
                )}

                <div className="space-y-3 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={r.status} />
                    <Link
                      href={`/kesfet?kategori=${r.category_slug}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-2xs font-medium text-ink-600 hover:bg-surface-sunken"
                    >
                      <span className="size-2 rounded-[3px]" style={{ background: r.category_color }} />
                      {r.category_name}
                    </Link>
                    <span className="font-mono text-2xs text-ink-400">{r.ref_code}</span>
                  </div>

                  <h1 className="text-2xl font-semibold leading-tight text-ink-900">{r.title}</h1>

                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
                    {r.neighborhood_slug && (
                      <Link href={`/mahalle/${r.neighborhood_slug}`} className="inline-flex items-center gap-1 hover:text-ink-800">
                        <IconPin size={13} /> {place}
                      </Link>
                    )}
                    {r.address && r.address.trim() !== place && (
                      <span>{r.address}</span>
                    )}
                    <time dateTime={r.created_at} title={formatDateTime(r.created_at)}>
                      {formatDate(r.created_at)}
                    </time>
                    <span>{formatNumber(Math.max(viewCount, r.view_count))} görüntülenme</span>
                  </p>

                  {r.description && (
                    <p className="whitespace-pre-line text-base leading-relaxed text-ink-700">{r.description}</p>
                  )}

                  {mergedCount > 0 && (
                    <p className="rounded-xl bg-surface-muted px-3 py-2 text-xs text-ink-600">
                      Aynı konudaki {mergedCount} bildirim bu kayıtla birleştirildi.
                    </p>
                  )}
                </div>
              </article>

              {resolutionMedia.length > 0 && (
                <section className="overflow-hidden rounded-2xl bg-white ring-1 ring-line">
                  <header className="flex items-center gap-2 border-b border-line px-4 py-3">
                    <IconCheck size={17} className="text-teal-600" />
                    <h2 className="text-sm font-semibold text-ink-900">Çözümden sonra</h2>
                    {r.resolved_at && (
                      <span className="ml-auto text-2xs text-ink-500">{formatDate(r.resolved_at)}</span>
                    )}
                  </header>
                  <div className="grid grid-cols-2 gap-0.5">
                    {issueMedia[0] && (
                      <figure className="relative aspect-square bg-surface-sunken">
                        <Image src={publicMediaUrl(issueMedia[0].storage_path)!} alt="Çözümden önce" fill sizes="320px" className="object-cover" />
                        <figcaption className="absolute bottom-2 left-2 rounded-md bg-ink-900/75 px-2 py-0.5 text-2xs font-medium text-white">Önce</figcaption>
                      </figure>
                    )}
                    {resolutionMedia.map((m) => (
                      <figure key={m.id} className="relative aspect-square bg-surface-sunken">
                        <Image src={publicMediaUrl(m.storage_path)!} alt="Çözümden sonra" fill sizes="320px" className="object-cover" />
                        <figcaption className="absolute bottom-2 left-2 rounded-md bg-teal-700/85 px-2 py-0.5 text-2xs font-medium text-white">Sonra</figcaption>
                      </figure>
                    ))}
                  </div>
                </section>
              )}

              {/* Mobilde birincil eylem, sorunun hemen altında durur. */}
              <div className="rounded-2xl bg-white p-4 ring-1 ring-line lg:hidden">
                <SupportButton
                  reportId={r.id}
                  initialCount={r.support_count}
                  initialSupported={supportedByMe}
                  isAuthenticated={Boolean(user)}
                />
              </div>

              <StatusTimeline status={r.status} />

              {submissions.length > 0 && (
                <section className="rounded-2xl bg-white p-4 ring-1 ring-line sm:p-5">
                  <h2 className="mb-3 text-base font-semibold text-ink-900">Resmî başvurular</h2>
                  <ul className="space-y-3">
                    {submissions.map((s) => (
                      <li key={s.id} className="rounded-xl bg-surface-muted p-3.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm font-medium text-ink-900">
                            {s.authority_website ? (
                              <a href={s.authority_website} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 hover:underline">
                                {s.authority_name} <IconExternal size={12} />
                              </a>
                            ) : s.authority_name}
                          </p>
                          <time className="text-2xs text-ink-500" dateTime={s.submitted_at}>{formatDate(s.submitted_at)}</time>
                        </div>
                        {s.reference_no && (
                          <p className="mt-1.5 font-mono text-2xs text-ink-600">Başvuru no: {s.reference_no}</p>
                        )}
                        {s.response_at ? (
                          <div className="mt-2 border-t border-line pt-2">
                            <p className="text-2xs font-medium text-ink-500">
                              Yanıt · {formatDate(s.response_at)}
                            </p>
                            {s.response_text && (
                              <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-ink-700">{s.response_text}</p>
                            )}
                          </div>
                        ) : (
                          <p className="mt-2 text-2xs text-ink-500">Yanıt bekleniyor.</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <OfficialReplies yanitlar={yanitlar} />

              {yanitYazabilir && <ResmiYanitFormu reportId={r.id} />}

              <EvidenceChain events={events} valid={chainValid} />
            </div>

            {/* ── Yan sütun ─────────────────────────────────────────── */}
            <aside className="space-y-4 lg:sticky lg:top-20">
              <div className="hidden rounded-2xl bg-white p-4 ring-1 ring-line lg:block">
                <SupportButton
                  reportId={r.id}
                  initialCount={r.support_count}
                  initialSupported={supportedByMe}
                  isAuthenticated={Boolean(user)}
                />
              </div>

              {openSubmission && r.first_forwarded_at && (
                <SilenceCounter
                  since={r.first_forwarded_at}
                  slaDays={openSubmission.response_sla_days}
                  authorityName={openSubmission.authority_short ?? openSubmission.authority_name}
                />
              )}

              <div className="rounded-2xl bg-white p-4 ring-1 ring-line">
                <h2 className="mb-2.5 text-sm font-semibold text-ink-900">Paylaş</h2>
                <ShareRow
                  slug={r.slug}
                  url={url}
                  baslik={r.title}
                  yer={place || null}
                  adres={r.address}
                  enlem={r.latitude}
                  boylam={r.longitude}
                  destek={r.support_count}
                />
              </div>

              {nearby.length > 0 && (
                <div className="space-y-2">
                  <h2 className="px-1 text-sm font-semibold text-ink-900">Yakındaki bildirimler</h2>
                  {nearby.map((n) => (
                    <ReportCardItem key={n.id} report={n} showDistance compact />
                  ))}
                </div>
              )}

              <div className="px-1 pb-2">
                <ReportAbuseDialog reportId={r.id} isAuthenticated={Boolean(user)} />
                <p className="mt-2 text-2xs text-ink-400">
                  Son güncelleme {timeAgo(r.updated_at)}
                </p>
              </div>
            </aside>
          </div>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
