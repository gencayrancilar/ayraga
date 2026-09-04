import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { withSystem } from "./db";

export type Bucket = "report_create" | "media_upload" | "support" | "moderation_report" | "auth";

const LIMITS: Record<Bucket, { max: number; windowMinutes: number; message: string }> = {
  report_create:     { max: 5,  windowMinutes: 60,  message: "Saatte en fazla 5 bildirim gönderebilirsiniz." },
  media_upload:      { max: 30, windowMinutes: 60,  message: "Çok fazla görsel yüklediniz, biraz bekleyin." },
  support:           { max: 60, windowMinutes: 10,  message: "Çok hızlı destek veriyorsunuz, biraz bekleyin." },
  moderation_report: { max: 10, windowMinutes: 60,  message: "Saatte en fazla 10 içerik bildirebilirsiniz." },
  auth:              { max: 10, windowMinutes: 15,  message: "Çok fazla deneme yaptınız, 15 dakika sonra tekrar deneyin." },
};

export class RateLimitError extends Error {
  constructor(message: string, public retryAfterSeconds: number) {
    super(message);
    this.name = "RateLimitError";
  }
}

/** İstemci kimliği — IP adresi ham hâliyle saklanmaz, yalnızca özeti tutulur. */
export async function clientIdentity(userId?: string | null): Promise<string> {
  if (userId) return `u:${userId}`;
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown";
  return `i:${createHash("sha256").update(ip + "|ayra").digest("hex").slice(0, 32)}`;
}

export async function enforceRateLimit(bucket: Bucket, identity: string): Promise<void> {
  const cfg = LIMITS[bucket];
  const windowMs = cfg.windowMinutes * 60_000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

  const count = await withSystem(async (tx) => {
    const [row] = await tx`
      insert into public.rate_limits (bucket, identity, window_start, count)
      values (${bucket}, ${identity}, ${windowStart}, 1)
      on conflict (bucket, identity, window_start)
      do update set count = public.rate_limits.count + 1
      returning count
    `;
    // Eski pencereleri ara sıra temizle
    if (Math.random() < 0.02) {
      await tx`delete from public.rate_limits where window_start < now() - interval '1 day'`;
    }
    return row.count as number;
  });

  if (count > cfg.max) {
    const retryAfter = Math.ceil((windowStart.getTime() + windowMs - Date.now()) / 1000);
    throw new RateLimitError(cfg.message, Math.max(retryAfter, 1));
  }
}
