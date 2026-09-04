"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { cx } from "@/lib/utils";
import { hazirlaGorsel } from "@/lib/image-client";
import { createReport, type ActionState } from "@/lib/actions/reports";
import { LocationPicker } from "../map/LocationPicker";
import { Button } from "../ui/Button";
import { Field, Input, Textarea, ErrorNote } from "../ui/Field";
import { CategoryIcon, IconArrowRight, IconCamera, IconCheck, IconChevronLeft, IconClose, IconCrosshair, IconPin, IconSpinner, IconAlert } from "../icons";
import { StatusBadge } from "../ui/Badge";
import { supportLabel, formatDistance } from "@/lib/format";
import type { Category, ReportCard } from "@/lib/types";

const STEPS = ["Konum", "Kategori", "Fotoğraf", "Ayrıntı", "Önizleme"] as const;
const MAX_PHOTOS = 3;

import { AcilUyarisi, type AcilKelime } from "./AcilUyarisi";

type Place = {
  address: string | null;
  neighborhood: string | null;
  district: string | null;
  city: string | null;
};

export function ReportComposer({
  categories,
  acilKelimeler = [],
}: {
  categories: Category[];
  acilKelimeler?: AcilKelime[];
}) {
  const [step, setStep] = useState(0);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [place, setPlace] = useState<Place>({ address: null, neighborhood: null, district: null, city: null });
  const [addressEdited, setAddressEdited] = useState(false);
  const [locating, setLocating] = useState(false);
  const [rootId, setRootId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [similar, setSimilar] = useState<ReportCard[]>([]);
  const [dismissedSimilar, setDismissedSimilar] = useState(false);

  const [state, formAction, pending] = useActionState<ActionState, FormData>(createReport, { ok: false });
  const fileInput = useRef<HTMLInputElement>(null);

  const root = categories.find((c) => c.id === rootId) ?? null;
  const category =
    categories.flatMap((c) => [c, ...(c.children ?? [])]).find((c) => c.id === categoryId) ?? null;

  // — İlk açılışta konumu dene ————————————————————————————————
  useEffect(() => {
    if (coords || !("geolocation" in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 120_000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // — Konum değişince adres çöz ————————————————————————————
  useEffect(() => {
    if (!coords) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/adres?lat=${coords.lat}&lng=${coords.lng}`, { signal: controller.signal });
        if (!res.ok) return;
        const data = (await res.json()) as Place;
        setPlace((prev) => ({
          address: addressEdited ? prev.address : data.address,
          neighborhood: data.neighborhood,
          district: data.district,
          city: data.city,
        }));
      } catch { /* adres opsiyoneldir */ }
    }, 400);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [coords, addressEdited]);

  // — Benzer bildirim önerisi ————————————————————————————————
  useEffect(() => {
    if (!coords || step < 1) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ lat: String(coords.lat), lng: String(coords.lng) });
    if (categoryId) params.set("kategori", categoryId);
    fetch(`/api/benzer?${params}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setSimilar(d.items ?? []))
      .catch(() => {});
    return () => controller.abort();
  }, [coords, categoryId, step]);

  // — Önizleme URL yönetimi ————————————————————————————————
  useEffect(() => {
    const urls = photos.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  const useMyLocation = useCallback(() => {
    if (!("geolocation" in navigator)) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setAddressEdited(false);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }, []);

  /**
   * Görsel listesini hem React durumuna hem de gerçek <input> öğesine yazar.
   * DataTransfer kullanmazsak kaldırılan bir görsel FormData'da kalmaya
   * devam eder ve sunucuya gönderilir.
   */
  const syncPhotos = useCallback((next: File[]) => {
    const limited = next.slice(0, MAX_PHOTOS);
    setPhotos(limited);
    if (fileInput.current) {
      const dt = new DataTransfer();
      limited.forEach((f) => dt.items.add(f));
      fileInput.current.files = dt.files;
    }
  }, []);

  const [gorselHazirlaniyor, setGorselHazirlaniyor] = useState(false);

  /**
   * Seçilen görseller gönderilmeden önce tarayıcıda küçültülüp JPEG'e
   * çevrilir. Telefon fotoğrafları hem çok büyük (Vercel'in 4,5 MB istek
   * sınırını aşıyor) hem de HEIC biçiminde (sunucu açamıyor).
   */
  const addPhotos = async (list: FileList | null) => {
    if (!list?.length) return;
    setGorselHazirlaniyor(true);
    try {
      const hazir = await Promise.all(Array.from(list).map(hazirlaGorsel));
      syncPhotos([...photos, ...hazir]);
    } finally {
      setGorselHazirlaniyor(false);
    }
  };

  // Ana başlık seçilince alt başlıklar ekranın altında kalabiliyor; oraya kaydır.
  const altBaslikRef = useRef<HTMLFieldSetElement>(null);
  useEffect(() => {
    if (step !== 1 || !rootId) return;
    const el = altBaslikRef.current;
    if (!el) return;
    const t = window.setTimeout(
      () => el.scrollIntoView({ behavior: "smooth", block: "nearest" }),
      60,
    );
    return () => window.clearTimeout(t);
  }, [rootId, step]);

  const canContinue =
    step === 0 ? Boolean(coords) :
    step === 1 ? Boolean(categoryId) :
    step === 2 ? true :
    step === 3 ? title.trim().length >= 8 :
    true;

  /*
    Pasif bir düğme, sebebini söylemediği sürece kullanıcıyı kilitler.
    En sık takılma noktası kategori adımı: ana başlık seçilir, alt başlık
    listesi ekranın altında kalır ve "Devam" gri durur. Aşağıdaki metin
    her adım için eksik olanı açıkça söyler.
  */
  const engel = gorselHazirlaniyor
    ? "Fotoğraf hazırlanıyor…"
    : canContinue
    ? null
    : step === 0
      ? "Devam etmek için haritadan bir konum seçin."
      : step === 1
        ? rootId
          ? "Devam etmek için bir alt başlık seçin."
          : "Devam etmek için bir kategori seçin."
        : step === 3
          ? `Başlık en az 8 karakter olmalı (şu an ${title.trim().length}).`
          : null;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-lg flex-col lg:min-h-0 lg:py-8">
      {/* Adım göstergesi */}
      <div className="sticky top-14 z-20 border-b border-line bg-white px-4 py-3 lg:static lg:rounded-t-2xl lg:border-x lg:border-t">
        <div className="flex items-center gap-3">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="tap-target -ml-2 flex items-center justify-center rounded-lg text-ink-500 hover:text-ink-900"
              aria-label="Geri"
            >
              <IconChevronLeft size={20} />
            </button>
          ) : (
            <Link href="/" className="tap-target -ml-2 flex items-center justify-center rounded-lg text-ink-500 hover:text-ink-900" aria-label="Vazgeç">
              <IconClose size={20} />
            </Link>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-2xs font-medium uppercase tracking-wide text-ink-400">
              Adım {step + 1} / {STEPS.length}
            </p>
            <h1 className="text-base font-semibold text-ink-900">{STEPS[step]}</h1>
          </div>
        </div>
        <ol className="mt-3 flex gap-1" aria-label="İlerleme">
          {STEPS.map((label, i) => (
            <li
              key={label}
              className={cx("h-1 flex-1 rounded-full transition-colors", i <= step ? "bg-ink-900" : "bg-surface-sunken")}
            >
              <span className="sr-only">{label}{i < step ? " (tamamlandı)" : ""}</span>
            </li>
          ))}
        </ol>
      </div>

      <form action={formAction} className="flex flex-1 flex-col bg-white lg:rounded-b-2xl lg:border-x lg:border-b lg:border-line">
        {/* Gizli alanlar — her adımda değer taşınır */}
        <input type="hidden" name="latitude" value={coords?.lat ?? ""} />
        <input type="hidden" name="longitude" value={coords?.lng ?? ""} />
        <input type="hidden" name="address" value={place.address ?? ""} />
        <input type="hidden" name="categoryId" value={categoryId ?? ""} />
        <input type="hidden" name="title" value={title} />
        <input type="hidden" name="description" value={description} />
        {/* Dosya girdisi her adımda takılı kalır; aksi hâlde adım değişince
            seçilen görseller FormData'dan düşerdi. */}
        <input
          ref={fileInput}
          type="file"
          name="photos"
          accept="image/*"
          capture="environment"
          multiple
          className="sr-only"
          onChange={(e) => addPhotos(e.target.files)}
        />

        <div className="flex-1">
          {/* ── 1 · Konum ───────────────────────────────────────────── */}
          {step === 0 && (
            <div>
              <div className="relative h-[46vh] min-h-64 w-full overflow-hidden bg-surface-sunken lg:h-80">
                <LocationPicker value={coords} onChange={setCoords} className="absolute inset-0" />
                <button
                  type="button"
                  onClick={useMyLocation}
                  disabled={locating}
                  className="absolute right-3 top-3 z-10 flex h-10 items-center gap-1.5 rounded-xl bg-white px-3 text-xs font-medium text-ink-700 shadow-card ring-1 ring-line disabled:opacity-60"
                >
                  {locating ? <IconSpinner size={15} /> : <IconCrosshair size={15} />}
                  Konumumu kullan
                </button>
              </div>

              <div className="space-y-4 p-4">
                <p className="flex items-start gap-2 text-sm text-ink-600">
                  <IconPin size={16} className="mt-0.5 shrink-0 text-ink-400" />
                  Haritayı kaydırarak pini sorunun tam olduğu yere getirin.
                </p>

                <Field label="Adres" hint="Otomatik dolar; gerekirse düzeltebilirsiniz." htmlFor="address-field">
                  <Input
                    id="address-field"
                    value={place.address ?? ""}
                    onChange={(e) => { setPlace((p) => ({ ...p, address: e.target.value })); setAddressEdited(true); }}
                    placeholder="Örn. Değirmen Caddesi No:12"
                    maxLength={240}
                  />
                </Field>

                {place.neighborhood && (
                  <p className="text-xs text-ink-500">
                    Bu nokta <strong className="font-medium text-ink-700">{place.neighborhood}</strong>
                    {place.district ? `, ${place.district}` : ""} sınırlarında görünüyor.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── 2 · Kategori ────────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-5 p-4">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {categories.map((c) => {
                  const active = rootId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setRootId(c.id);
                        setCategoryId(c.children?.length ? null : c.id);
                      }}
                      aria-pressed={active}
                      className={cx(
                        "flex min-h-24 flex-col items-start justify-between gap-2 rounded-2xl p-3 text-left transition-all",
                        active
                          ? "bg-ink-900 text-white ring-2 ring-ink-900"
                          : "bg-white text-ink-800 ring-1 ring-line hover:ring-line-strong",
                      )}
                    >
                      <span style={{ color: active ? "#ffffff" : c.color }}>
                        <CategoryIcon name={c.icon} size={24} />
                      </span>
                      <span className="text-sm font-medium leading-tight">{c.name}</span>
                    </button>
                  );
                })}
              </div>

              {root?.children && root.children.length > 0 && (
                <fieldset ref={altBaslikRef}>
                  <legend className="mb-2 text-sm font-medium text-ink-800">
                    {root.name} — hangisi?
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    <SubChip
                      label={`Genel (${root.name})`}
                      active={categoryId === root.id}
                      onClick={() => setCategoryId(root.id)}
                    />
                    {root.children.map((sub) => (
                      <SubChip
                        key={sub.id}
                        label={sub.name}
                        active={categoryId === sub.id}
                        onClick={() => setCategoryId(sub.id)}
                      />
                    ))}
                  </div>
                </fieldset>
              )}

              {similar.length > 0 && !dismissedSimilar && (
                <SimilarNotice items={similar} onDismiss={() => setDismissedSimilar(true)} />
              )}
            </div>
          )}

          {/* ── 3 · Fotoğraf ────────────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-4 p-4">
              <p className="text-sm text-ink-600">
                Bir fotoğraf, sorunun doğrulanmasını ve kuruma iletilmesini çok kolaylaştırır.
                Zorunlu değildir.
              </p>

              <div className="grid grid-cols-3 gap-2.5">
                {previews.map((src, i) => (
                  <div key={src} className="relative aspect-square overflow-hidden rounded-xl bg-surface-sunken ring-1 ring-line">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`Yüklenen görsel ${i + 1}`} className="size-full object-cover" />
                    <button
                      type="button"
                      onClick={() => syncPhotos(photos.filter((_, idx) => idx !== i))}
                      aria-label={`${i + 1}. görseli kaldır`}
                      className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-ink-900/75 text-white backdrop-blur"
                    >
                      <IconClose size={14} />
                    </button>
                  </div>
                ))}

                {photos.length < MAX_PHOTOS && (
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    className="flex aspect-square flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong bg-surface-muted text-ink-500 transition-colors hover:bg-surface-sunken"
                  >
                    <IconCamera size={22} />
                    <span className="text-2xs font-medium">Fotoğraf ekle</span>
                  </button>
                )}
              </div>

              <p className="rounded-xl bg-surface-muted p-3 text-xs leading-relaxed text-ink-600">
                <strong className="font-medium text-ink-800">Gizlilik:</strong> Yüklenen görsellerin
                konum ve cihaz bilgisi (EXIF) sunucuda otomatik olarak silinir. Lütfen insanların
                yüzlerini ve araç plakalarını içeren kareler yüklemeyin.
              </p>

              {state.field === "photos" && <ErrorNote>{state.error}</ErrorNote>}
            </div>
          )}

          {/* ── 4 · Ayrıntı ─────────────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-5 p-4">
              <AcilUyarisi metin={`${title} ${description}`} kelimeler={acilKelimeler} />

              <Field
                label="Başlık"
                required
                htmlFor="title-field"
                hint="Nerede, ne olduğunu tek cümlede yazın."
                error={state.field === "title" ? state.error : undefined}
              >
                <Input
                  id="title-field"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Örn. Değirmen Caddesi'nde kaldırım bozuk"
                  maxLength={120}
                  autoFocus
                />
                <p className="mt-1 text-right text-2xs text-ink-400">{title.length}/120</p>
              </Field>

              <Field label="Açıklama" htmlFor="desc-field" hint="Ne zamandır sürüyor, kimleri etkiliyor?">
                <Textarea
                  id="desc-field"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Kısaca açıklayın."
                  maxLength={2000}
                  rows={5}
                />
              </Field>

              <p className="rounded-xl bg-surface-muted p-3 text-xs leading-relaxed text-ink-600">
                Kişisel veri, hakaret, siyasi propaganda ve ticari içerik yayımlanmaz.
                Bildiriminiz moderasyon sonrası doğrulanır.
              </p>
            </div>
          )}

          {/* ── 5 · Önizleme ────────────────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-4 p-4">
              <article className="overflow-hidden rounded-2xl ring-1 ring-line">
                {previews[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previews[0]} alt="" className="aspect-[4/3] w-full object-cover" />
                )}
                <div className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status="new" />
                    {category && (
                      <span className="inline-flex items-center gap-1.5 text-2xs font-medium text-ink-600">
                        <span className="size-2 rounded-[3px]" style={{ background: category.color }} />
                        {category.name}
                      </span>
                    )}
                  </div>
                  <h2 className="text-lg font-semibold leading-snug text-ink-900">{title}</h2>
                  {description && <p className="text-sm leading-relaxed text-ink-600">{description}</p>}
                  <p className="flex items-center gap-1.5 text-xs text-ink-500">
                    <IconPin size={13} />
                    {place.address || place.neighborhood || "Seçilen konum"}
                  </p>
                </div>
              </article>

              <ul className="space-y-1.5 text-xs text-ink-600">
                <CheckRow>Bildiriminiz haritada herkese açık olarak görünecek.</CheckRow>
                <CheckRow>Adınız yerine profilinizdeki görünen ad kullanılır.</CheckRow>
                <CheckRow>Süreçteki her adım kanıt zincirine kaydedilir.</CheckRow>
              </ul>

              {state.error && <ErrorNote>{state.error}</ErrorNote>}
            </div>
          )}
        </div>

        {/* Alt eylem çubuğu */}
        <div className="sticky bottom-0 border-t border-line bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:rounded-b-2xl">
          {/*
            key'ler bilinçli olarak farklı: React aynı konumdaki iki <button>'ı
            aynı DOM düğümü olarak yeniden kullanırsa, "Devam" tıklaması
            işlenirken düğümün type'ı "submit"e dönüşür ve tarayıcı formu
            beklenmedik biçimde gönderir. Ayrı key, düğümün yeniden
            oluşturulmasını garanti eder.
          */}
          {engel && (
            <p aria-live="polite" className="mb-2 text-center text-sm text-ink-600">
              {engel}
            </p>
          )}
          {step < STEPS.length - 1 ? (
            <Button
              key="ileri"
              type="button"
              size="lg"
              block
              disabled={!canContinue || gorselHazirlaniyor}
              onClick={(event) => {
                event.preventDefault();
                setStep((s) => s + 1);
              }}
            >
              {step === 2 && photos.length === 0 ? "Fotoğrafsız devam et" : "Devam"}
              <IconArrowRight size={18} />
            </Button>
          ) : (
            <Button key="gonder" type="submit" size="lg" block variant="secondary" loading={pending} disabled={!canContinue || gorselHazirlaniyor}>
              Sorunu yayınla
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function SubChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "h-10 rounded-xl px-3.5 text-sm font-medium transition-colors",
        active ? "bg-teal-600 text-white" : "bg-white text-ink-700 ring-1 ring-line hover:bg-surface-muted",
      )}
    >
      {label}
    </button>
  );
}

function CheckRow({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <IconCheck size={14} className="mt-0.5 shrink-0 text-teal-600" />
      {children}
    </li>
  );
}

/** Mükerrer bildirimi önlemek için yakındaki benzer kayıtları gösterir. */
function SimilarNotice({ items, onDismiss }: { items: ReportCard[]; onDismiss: () => void }) {
  return (
    <aside className="rounded-2xl bg-[#fbf3e0] p-3.5 ring-1 ring-inset ring-[#f0e0b8]">
      <div className="mb-2 flex items-start gap-2">
        <IconAlert size={16} className="mt-0.5 shrink-0 text-[#a16207]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-[#7a5406]">
            Bu bölgede benzer bir sorun daha önce bildirilmiş olabilir
          </p>
          <p className="mt-0.5 text-xs text-[#7a5406]/80">
            Aynı sorunu yeniden bildirmek yerine mevcut kaydı desteklemek, sesi daha güçlü çıkarır.
          </p>
        </div>
        <button type="button" onClick={onDismiss} aria-label="Kapat" className="shrink-0 text-[#a16207]">
          <IconClose size={16} />
        </button>
      </div>

      <ul className="space-y-1.5">
        {items.slice(0, 3).map((item) => (
          <li key={item.id}>
            <Link
              href={`/sorun/${item.slug}`}
              className="flex items-center gap-2 rounded-xl bg-white/70 px-3 py-2 text-xs transition-colors hover:bg-white"
            >
              <span className="size-2 shrink-0 rounded-[3px]" style={{ background: item.category_color }} />
              <span className="min-w-0 flex-1 truncate font-medium text-ink-800">{item.title}</span>
              <span className="shrink-0 text-2xs text-ink-500">
                {item.distance_m != null ? formatDistance(item.distance_m) : supportLabel(item.support_count)}
              </span>
              <IconArrowRight size={13} className="shrink-0 text-ink-400" />
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
