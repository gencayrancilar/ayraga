import "server-only";
import postgres from "postgres";
import { env } from "./env";

declare global {
  // eslint-disable-next-line no-var
  var __ayra_sql: postgres.Sql | undefined;
}

/**
 * Tek bağlantı havuzu. Next.js geliştirme modunda modüller yeniden
 * yüklendiğinde havuzun çoğalmaması için globalThis'te saklanır.
 *
 * Havuz, modül yüklenirken değil **ilk sorguda** kurulur. Sebebi:
 * `next build` sayfa verisini toplarken bu modülü içe aktarır ve o anda
 * DATABASE_URL henüz tanımlı olmayabilir (Vercel'de ilk dağıtım, ortam
 * değişkenleri girilmeden yapılır). Modül seviyesinde bağlanmaya
 * çalışırsak derleme, hiçbir sorgu çalışmadan kırılır. Gecikmeli kurulum
 * bunu önler; eksik değişken artık istek anında, anlaşılır bir hatayla
 * ortaya çıkar.
 */
/**
 * Sunucusuz ortamda (Vercel) her istek ayrı bir örnekte çalışabilir ve her
 * örnek kendi havuzunu açar. Örnek başına 12 bağlantı istenirse Supabase'in
 * havuzundaki istemci kotası hızla dolar ve istekler "max clients reached"
 * ile 500 döner — üstelik rastgele sayfalarda, çünkü hangi isteğin hangi
 * örneğe düştüğü belli olmaz. Bu yüzden sunucusuzda örnek başına tek
 * bağlantı tutuyoruz; postgres.js eşzamanlı sorguları sıraya alır.
 *
 * Kendi sunucunuzda (tek uzun ömürlü süreç) havuzun geniş olması doğrudur.
 */
const SUNUCUSUZ = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

function havuz(): postgres.Sql {
  if (!globalThis.__ayra_sql) {
    globalThis.__ayra_sql = postgres(env().DATABASE_URL, {
      max: SUNUCUSUZ ? 1 : process.env.NODE_ENV === "production" ? 12 : 4,
      idle_timeout: SUNUCUSUZ ? 20 : 30,
      max_lifetime: SUNUCUSUZ ? 60 * 5 : undefined,
      connect_timeout: 10,
      prepare: false, // Supabase pooler (transaction mode) uyumluluğu
      connection: { application_name: "ayra" },
      onnotice: () => {},
      transform: { undefined: null },
    });
  }
  return globalThis.__ayra_sql;
}

/**
 * `sql` her yerde eskisi gibi kullanılır (etiketli şablon, sql.begin,
 * sql.json...). Aradaki Proxy yalnızca ilk erişimde havuzu kurar.
 */
export const sql: postgres.Sql = new Proxy(function () {} as unknown as postgres.Sql, {
  apply(_target, _thisArg, args: unknown[]) {
    return (havuz() as unknown as (...a: unknown[]) => unknown)(...args);
  },
  get(_target, prop) {
    const h = havuz() as unknown as Record<string | symbol, unknown>;
    const value = h[prop];
    return typeof value === "function" ? value.bind(h) : value;
  },
  set(_target, prop, value) {
    (havuz() as unknown as Record<string | symbol, unknown>)[prop] = value;
    return true;
  },
  has(_target, prop) {
    return prop in (havuz() as unknown as object);
  },
}) as postgres.Sql;

export type JwtClaims = {
  sub: string;
  role: "authenticated";
  email?: string | null;
};

/**
 * Row Level Security altında sorgu çalıştırır.
 *
 * Supabase'de PostgREST her isteği `request.jwt.claims` ayarlayıp rolü
 * değiştirerek çalıştırır. Burada aynısını yapıyoruz; böylece politikalar
 * lokal geliştirmede de birebir aynı şekilde uygulanır ve Supabase'e
 * geçildiğinde davranış değişmez.
 */
export async function withRls<T>(
  claims: JwtClaims | null,
  fn: (tx: postgres.TransactionSql) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    if (claims) {
      await tx`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`;
      await tx`set local role authenticated`;
    } else {
      await tx`select set_config('request.jwt.claims', '', true)`;
      await tx`set local role anon`;
    }
    return fn(tx);
  }) as Promise<T>;
}

/**
 * RLS'yi atlayan ayrıcalıklı erişim. Yalnızca kullanıcı bağlamı olmayan
 * sistem işleri için: oturum açma, oran sınırlama, zamanlanmış görevler.
 * İstek verisiyle doğrudan çağrılmaz.
 */
export async function withSystem<T>(fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => fn(tx)) as Promise<T>;
}

/** PostgreSQL hata kodlarını okunabilir hâle getirir. */
export function dbErrorCode(err: unknown): string | null {
  if (typeof err === "object" && err !== null && "code" in err) return String((err as { code: unknown }).code);
  return null;
}

export function dbErrorMessage(err: unknown): string | null {
  if (typeof err === "object" && err !== null && "message" in err) return String((err as { message: unknown }).message);
  return null;
}
