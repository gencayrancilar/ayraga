import "server-only";
import { createHash, randomBytes, scrypt as _scrypt } from "node:crypto";
import { promisify } from "node:util";
import { withSystem } from "../db";
import { mailGonder, mailAcik } from "../mail";
import { publicConfig } from "../public-config";
import { AuthError } from "./session";

/**
 * Parola sıfırlama.
 *
 * Bağlantıdaki jeton veritabanında hiç durmaz; yalnızca özeti saklanır.
 * Böylece veritabanı yedeğini eline geçiren biri kimsenin hesabına giremez.
 *
 * "Bu e-posta kayıtlı mı" sorusuna hiçbir koşulda cevap vermiyoruz: kayıtlı
 * olsun olmasın aynı mesaj döner. Aksi hâlde form, kimin AYRA'da hesabı
 * olduğunu öğrenmek için kullanılabilecek bir sorgu aracına dönerdi.
 */

const scrypt = promisify(_scrypt) as (p: string, s: Buffer, k: number) => Promise<Buffer>;
const OMUR_DAKIKA = 60;

async function parolaOzeti(parola: string): Promise<string> {
  const tuz = randomBytes(16);
  const turetilmis = await scrypt(parola, tuz, 64);
  return `scrypt$${tuz.toString("base64")}$${turetilmis.toString("base64")}`;
}

function jetonOzeti(jeton: string): string {
  return createHash("sha256").update(jeton).digest("hex");
}

/**
 * Sıfırlama bağlantısı ister.
 *
 * E-posta kayıtlı değilse ya da hesap takma adlıysa hiçbir şey yapılmaz;
 * çağıran taraf yine de başarılı sonuç alır.
 */
export async function sifirlamaIste(email: string): Promise<void> {
  const normalize = email.trim().toLowerCase();

  const hedef = await withSystem(async (tx) => {
    const [kullanici] = await tx`
      select id, email from auth.users
       where email = ${normalize} and coalesce(is_anonymous, false) = false
       limit 1
    `;
    if (!kullanici) return null;

    // Yeni istek, bekleyen bütün bağlantıları geçersiz kılar: aynı anda iki
    // geçerli bağlantı dolaşmasın.
    await tx`
      update public.password_resets set used_at = now()
       where user_id = ${kullanici.id} and used_at is null
    `;
    return { id: kullanici.id as string, email: kullanici.email as string };
  });

  if (!hedef) return;

  const jeton = randomBytes(32).toString("base64url");
  const biter = new Date(Date.now() + OMUR_DAKIKA * 60_000);

  await withSystem((tx) => tx`
    insert into public.password_resets (token_hash, user_id, expires_at)
    values (${jetonOzeti(jeton)}, ${hedef.id}, ${biter})
  `);

  const baglanti = `${publicConfig.siteUrl.replace(/\/$/, "")}/parola-sifirla/${jeton}`;
  if (!mailAcik()) {
    // Posta kapalıyken sessizce başarısız olmak, kullanıcıyı sonsuza kadar
    // bekletir. Sunucu günlüğüne düşsün ki en azından fark edilsin.
    console.error("parola sıfırlama: RESEND_API_KEY tanımlı değil");
    return;
  }

  await mailGonder({
    to: [hedef.email],
    subject: "AYRA · parola sıfırlama",
    text: [
      "Merhaba,",
      "",
      "AYRA hesabınız için parola sıfırlama isteği aldık. Yeni parolanızı",
      "belirlemek için aşağıdaki bağlantıya tıklayın:",
      "",
      baglanti,
      "",
      `Bağlantı ${OMUR_DAKIKA} dakika geçerlidir ve yalnızca bir kez kullanılabilir.`,
      "",
      "Bu isteği siz yapmadıysanız yapmanız gereken bir şey yok; parolanız",
      "değişmedi ve bağlantı süresi dolunca kendiliğinden geçersiz olacak.",
      "",
      "—",
      "AYRA — Gör. Bildir. Destekle. Takip et.",
      publicConfig.siteUrl,
    ].join("\n"),
  });
}

export type JetonDurumu =
  | { gecerli: true; userId: string; email: string }
  | { gecerli: false; sebep: "yok" | "kullanildi" | "suresi-doldu" };

/** Bağlantıdaki jetonu doğrular. Formu göstermeden önce çağrılır. */
export async function jetonuDogrula(jeton: string): Promise<JetonDurumu> {
  if (!jeton || jeton.length < 20) return { gecerli: false, sebep: "yok" };

  const kayit = await withSystem(async (tx) => {
    const [r] = await tx`
      select p.user_id, p.used_at, p.expires_at, u.email
        from public.password_resets p
        join auth.users u on u.id = p.user_id
       where p.token_hash = ${jetonOzeti(jeton)}
    `;
    return r;
  });

  if (!kayit) return { gecerli: false, sebep: "yok" };
  if (kayit.used_at) return { gecerli: false, sebep: "kullanildi" };
  if (new Date(kayit.expires_at as string) < new Date()) {
    return { gecerli: false, sebep: "suresi-doldu" };
  }
  return { gecerli: true, userId: kayit.user_id as string, email: kayit.email as string };
}

/** Parolayı değiştirir ve jetonu tüketir. Oturum açacak hesabı döndürür. */
export async function parolayiDegistir(
  jeton: string, yeniParola: string,
): Promise<{ id: string; email: string }> {
  const ozet = jetonOzeti(jeton);
  const parolaHash = await parolaOzeti(yeniParola);

  const sonuc = await withSystem(async (tx) => {
    // Tek deyimde tüket: aynı bağlantıya iki kez tıklanırsa ikincisi boş döner.
    const [kayit] = await tx`
      update public.password_resets
         set used_at = now()
       where token_hash = ${ozet} and used_at is null and expires_at > now()
      returning user_id
    `;
    if (!kayit) return null;

    const [kullanici] = await tx`
      update auth.users set encrypted_password = ${parolaHash}
       where id = ${kayit.user_id}
      returning id, email
    `;
    // Aynı hesabın başka bekleyen bağlantıları varsa onlar da düşsün.
    await tx`
      update public.password_resets set used_at = now()
       where user_id = ${kayit.user_id} and used_at is null
    `;
    return kullanici;
  });

  if (!sonuc) throw new AuthError("INVALID_TOKEN", "Bağlantı geçersiz ya da süresi dolmuş.");
  return { id: sonuc.id as string, email: sonuc.email as string };
}
