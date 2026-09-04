"use client";

import { useEffect, useState } from "react";
import { HeatMap, type HeatPoint } from "./HeatMap";
import { formatNumber } from "@/lib/format";

export function AnalyticsHeat({
  initialPoints, categories,
}: {
  initialPoints: HeatPoint[];
  categories: Array<{ slug: string; name: string; color: string }>;
}) {
  const [category, setCategory] = useState<string | null>(null);
  const [points, setPoints] = useState(initialPoints);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (category === null) { setPoints(initialPoints); return; }
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/yonetim/isi-haritasi?kategori=${category}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : { points: [] }))
      .then((d) => setPoints(d.points ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [category, initialPoints]);

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-ink-900">Yoğunluk haritası</h2>
        <p className="text-2xs text-ink-500">
          {loading ? "yükleniyor…" : `${formatNumber(points.length)} bildirim`}
        </p>
      </div>
      <HeatMap
        points={points}
        categories={categories}
        activeCategory={category}
        onCategoryChange={setCategory}
        className="h-[26rem]"
      />
    </section>
  );
}
