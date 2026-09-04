import type { Metadata } from "next";
import { MapScreen } from "@/components/map/MapScreen";
import { getCategoryTree, getNeighborhoods, getPlatformStats } from "@/lib/queries/reference";

export const metadata: Metadata = {
  title: "Harita",
  description:
    "Ayrancılar ve çevresindeki kent sorunlarını harita üzerinde görün, destekleyin ve çözüm sürecini takip edin.",
};

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const [categories, stats, neighborhoods] = await Promise.all([
    getCategoryTree(),
    getPlatformStats(),
    getNeighborhoods({ withReportsOnly: true }),
  ]);

  return (
    <MapScreen
      categories={categories}
      stats={stats}
      neighborhoods={neighborhoods.map((n) => ({
        slug: n.slug,
        name: n.name,
        center_lat: n.center_lat,
        center_lng: n.center_lng,
      }))}
    />
  );
}
