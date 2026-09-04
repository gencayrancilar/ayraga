import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../env";
import { withSystem, type JwtClaims } from "../db";

export const SESSION_COOKIE = "ayra_session";
const SESSION_DAYS = 90;

export type SessionUser = {
  id: string;
  displayName: string;
  handle: string | null;
  role: "citizen" | "muhtar" | "moderator" | "admin";
  isAnonymous: boolean;
  isBanned: boolean;
  email: string | null;
};

function secret() {
  return new TextEncoder().encode(env().AUTH_JWT_SECRET);
}

/**
 * Supabase Auth ile birebir aynı claim şeklinde token üretir.
 * AUTH_PROVIDER=supabase yapıldığında GoTrue'nun ürettiği token da aynı
 * alanları taşıdığı için doğrulama ve RLS tarafı değişmez.
 */
export async function issueToken(userId: string, email: string | null): Promise<string> {
  return new SignJWT({ role: "authenticated", email: email ?? undefined, aud: "authenticated" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export async function verifyToken(token: string): Promise<JwtClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { audience: "authenticated" });
    if (!payload.sub) return null;
    return { sub: payload.sub, role: "authenticated", email: (payload.email as string) ?? null };
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** İstek başına doğrulanmış claim'ler. RLS bağlamı buradan gelir. */
export async function getClaims(): Promise<JwtClaims | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyToken(token);
}

/**
 * Oturum sahibinin profil bilgisi. Kimlik doğrulaması JWT ile yapıldığı için
 * bu okuma sistem bağlamında yapılır; kullanıcı verisi dışında bir şey dönmez.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const claims = await getClaims();
  if (!claims) return null;

  const rows = await withSystem(
    (tx) => tx`
      select p.id, p.display_name, p.handle, p.role, p.is_anonymous, p.is_banned, u.email
      from public.profiles p
      left join auth.users u on u.id = p.id
      where p.id = ${claims.sub}
      limit 1
    `,
  );
  const r = rows[0];
  if (!r) return null;

  return {
    id: r.id,
    displayName: r.display_name,
    handle: r.handle,
    role: r.role,
    isAnonymous: r.is_anonymous,
    isBanned: r.is_banned,
    email: r.email ?? null,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new AuthError("AUTH_REQUIRED", "Bu işlem için giriş yapmalısınız.");
  if (user.isBanned) throw new AuthError("ACCOUNT_SUSPENDED", "Hesabınız askıya alınmış.");
  return user;
}

/**
 * Moderasyon yetkisi. Rolü tek tek sayıyoruz: "citizen değilse yetkilidir"
 * demek, sonradan eklenen her rolü (muhtar gibi) sessizce yönetime sokardı.
 */
export async function requireModerator(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "moderator" && user.role !== "admin") {
    throw new AuthError("FORBIDDEN", "Bu alana erişim yetkiniz yok.");
  }
  return user;
}

/** Muhtar paneli yetkisi. Muhtarın sorumlu olduğu mahalleler de döner. */
export async function requireMuhtar(): Promise<SessionUser & { mahalleler: MuhtarMahalle[] }> {
  const user = await requireUser();
  const mahalleler = await getMuhtarMahalleleri(user.id);
  if (!mahalleler.length) {
    throw new AuthError("FORBIDDEN", "Bu alan mahalle muhtarlarına açıktır.");
  }
  return { ...user, mahalleler };
}

export type MuhtarMahalle = {
  id: string;
  name: string;
  slug: string;
  title: string;
};

/** Bir hesabın muhtarı olduğu mahalleler. Muhtar değilse boş dizi. */
export async function getMuhtarMahalleleri(userId: string): Promise<MuhtarMahalle[]> {
  const rows = await withSystem(
    (tx) => tx`
      select n.id, n.name, n.slug, o.title
        from public.neighborhood_officials o
        join public.neighborhoods n on n.id = o.neighborhood_id
       where o.profile_id = ${userId} and o.is_active
       order by n.name
    `,
  );
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    slug: r.slug as string,
    title: (r.title as string) ?? "Mahalle Muhtarı",
  }));
}

export class AuthError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "AuthError";
  }
}
