#!/usr/bin/env node
/**
 * AYRA · Vercel'den kaynak kodu kurtarma
 *
 * Yayındaki sürüm sizin kaynak dosyalarınızla derlendi ve Vercel o dosyaları
 * saklıyor. Bu betik en son üretim dağıtımının dosya ağacını indirir.
 *
 * Hiçbir şeyin üzerine yazmaz: her şeyi ~/ayra-vercel içine koyar.
 * Kullanım:  node vercel-den-kurtar.mjs [proje-adi]
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const PROJE = process.argv[2] ?? "ayra";
const CIKTI = path.join(os.homedir(), "ayra-vercel");
const API = "https://api.vercel.com";
const ATLA = new Set([".git", "node_modules", ".next", ".vercel"]);

function jeton() {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN;
  const p = path.join(os.homedir(), "Library/Application Support/com.vercel.cli/auth.json");
  try {
    const t = JSON.parse(fs.readFileSync(p, "utf8")).token;
    if (t) return t;
  } catch { /* aşağıda anlatılır */ }
  console.error(
    "Vercel oturum anahtarı bulunamadı.\n" +
    "Terminal'de 'npx vercel login' çalıştırıp tekrar deneyin."
  );
  process.exit(1);
}

const JETON = jeton();

async function iste(yol) {
  const y = await fetch(API + yol, { headers: { Authorization: `Bearer ${JETON}` } });
  if (!y.ok) throw new Error(`${yol} → ${y.status} ${await y.text().catch(() => "")}`);
  return y.json();
}

/** Kişisel hesap ve tüm takımlar — proje hangisindeyse orada bulunur. */
async function kapsamlar() {
  const liste = [null];
  try {
    const { teams } = await iste("/v2/teams?limit=50");
    for (const t of teams ?? []) liste.push(t.id);
  } catch { /* takım yoksa sorun değil */ }
  return liste;
}

async function sonDagitim() {
  for (const takim of await kapsamlar()) {
    const ek = takim ? `&teamId=${takim}` : "";
    const { deployments } = await iste(`/v6/deployments?limit=100&state=READY${ek}`);
    const uygun = (deployments ?? [])
      .filter((d) => (d.name ?? "").includes(PROJE))
      .sort((a, b) => b.created - a.created);
    if (uygun.length) {
      const d = uygun.find((x) => x.target === "production") ?? uygun[0];
      return { id: d.uid ?? d.id, url: d.url, tarih: new Date(d.created), takim };
    }
  }
  throw new Error(`'${PROJE}' adında bir dağıtım bulunamadı.`);
}

async function agacIndir(id, takim) {
  const ek = takim ? `?teamId=${takim}` : "";
  const kok = await iste(`/v6/deployments/${id}/files${ek}`);
  const dosyalar = [];
  const gez = (dugumler, onek) => {
    for (const d of dugumler ?? []) {
      if (ATLA.has(d.name)) continue;
      const yol = onek ? `${onek}/${d.name}` : d.name;
      if (d.type === "directory") gez(d.children, yol);
      else if (d.type === "file" && d.uid) dosyalar.push({ yol, uid: d.uid });
    }
  };
  gez(kok, "");
  return dosyalar;
}

async function main() {
  const d = await sonDagitim();
  console.log(`Dağıtım: ${d.url}`);
  console.log(`Tarih  : ${d.tarih.toLocaleString("tr-TR")}`);

  const dosyalar = await agacIndir(d.id, d.takim);
  console.log(`Dosya  : ${dosyalar.length}\n`);

  const ek = d.takim ? `?teamId=${d.takim}` : "";
  let ok = 0, hata = 0;
  for (const f of dosyalar) {
    try {
      const veri = await iste(`/v8/deployments/${d.id}/files/${f.uid}${ek}`);
      const govde = typeof veri === "string" ? veri : (veri.data ?? "");
      const hedef = path.join(CIKTI, f.yol);
      fs.mkdirSync(path.dirname(hedef), { recursive: true });
      fs.writeFileSync(hedef, Buffer.from(govde, "base64"));
      ok++;
      process.stdout.write(`\r  indirilen: ${ok}/${dosyalar.length}`);
    } catch (e) {
      hata++;
      console.error(`\n  ! ${f.yol}: ${e.message}`);
    }
  }
  console.log(`\n\nBitti. ${ok} dosya indi${hata ? `, ${hata} hata` : ""}.`);
  console.log(`Konum: ${CIKTI}`);
}

main().catch((e) => { console.error("\nHata:", e.message); process.exit(1); });
