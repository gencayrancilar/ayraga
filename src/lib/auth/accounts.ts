import "server-only";
import { randomBytes, randomUUID, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { withSystem } from "../db";
import { AuthError } from "./session";

const scrypt = promisify(_scrypt) as (p: string, s: Buffer, k: number) => Promise<Buffer>;

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${derived.toString("base64")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt" || !saltB64 || !hashB64) return false;
  const derived = await scrypt(password, Buffer.from(saltB64, "base64"), 64);
  const expected = Buffer.from(hashB64, "base64");
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

const ANON_NAMES = [
  "Mahalle sakini", "Ayrancılar sakini", "Torbalı sakini",
  "Komşu", "Yaya", "Bir vatandaş",
];

/**
 * Takma adla katılım. Kullanıcı e-posta vermeden bildirim yapabilir ve
 * destekleyebilir; hesap tarayıcı çerezinde yaşar, sonradan e-postayla
 * kalıcı hâle getirilebilir.
 */
export async function createAnonymousAccount(displayName?: string) {
  const name =
    displayName?.trim().slice(0, 40) ||
    `${ANON_NAMES[Math.floor(Math.random() * ANON_NAMES.length)]}`;

  return withSystem(async (tx) => {
    // id ve created_at'i biz veriyoruz: Supabase'de auth.users bu iki
    // sütuna varsayılan tanımlamaz (GoTrue kendi doldurur). Yerelde
    // varsayılan olsa da açıkça yazmak iki ortamda da doğru sonuç verir.
    const [user] = await tx`
      insert into auth.users (id, is_anonymous, raw_user_meta_data, created_at)
      values (${randomUUID()}, true, ${tx.json({ display_name: name })}, now())
      returning id
    `;
    return { id: user.id as string, email: null as string | null };
  });
}

export async function registerAccount(email: string, password: string, displayName?: string) {
  const normalized = email.trim().toLowerCase();
  const hash = await hashPassword(password);
  const name = displayName?.trim().slice(0, 40) || normalized.split("@")[0];

  return withSystem(async (tx) => {
    const existing = await tx`select id from auth.users where email = ${normalized}`;
    if (existing.length) throw new AuthError("EMAIL_TAKEN", "Bu e-posta zaten kayıtlı.");

    const [user] = await tx`
      insert into auth.users (id, email, encrypted_password, raw_user_meta_data, created_at)
      values (${randomUUID()}, ${normalized}, ${hash}, ${tx.json({ display_name: name })}, now())
      returning id, email
    `;
    return { id: user.id as string, email: user.email as string };
  });
}

export async function signIn(email: string, password: string) {
  const normalized = email.trim().toLowerCase();
  return withSystem(async (tx) => {
    const [user] = await tx`
      select id, email, encrypted_password from auth.users where email = ${normalized} limit 1
    `;
    if (!user?.encrypted_password || !(await verifyPassword(password, user.encrypted_password))) {
      throw new AuthError("INVALID_CREDENTIALS", "E-posta veya parola hatalı.");
    }
    await tx`update auth.users set last_sign_in_at = now() where id = ${user.id}`;
    return { id: user.id as string, email: user.email as string };
  });
}

/** Takma adlı hesabı e-posta ile kalıcı hâle getirir; kimlik ve geçmiş korunur. */
export async function upgradeAnonymousAccount(
  userId: string,
  email: string,
  password: string,
) {
  const normalized = email.trim().toLowerCase();
  const hash = await hashPassword(password);

  return withSystem(async (tx) => {
    const taken = await tx`select 1 from auth.users where email = ${normalized} and id <> ${userId}`;
    if (taken.length) throw new AuthError("EMAIL_TAKEN", "Bu e-posta zaten kayıtlı.");

    const [user] = await tx`
      update auth.users
         set email = ${normalized}, encrypted_password = ${hash}, is_anonymous = false
       where id = ${userId} and is_anonymous = true
      returning id, email
    `;
    if (!user) throw new AuthError("NOT_ANONYMOUS", "Bu hesap zaten kalıcı.");

    await tx`update public.profiles set is_anonymous = false where id = ${userId}`;
    return { id: user.id as string, email: user.email as string };
  });
}
