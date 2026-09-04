#!/usr/bin/env node
/**
 * Paylaşım görsellerinin yazı tiplerini üretir.
 *
 * Inter'in 500/600/700 kesimlerini Latin+Türkçe karakterlere indirger ve
 * src/lib/fontlar/ altına base64 modül olarak yazar. Vercel'in sunucusunda
 * kurulu yazı tipi olmadığı için font kaynak kodunun içinde taşınıyor.
 *
 * Gerekenler:  npm i -D @expo-google-fonts/inter   ·   pip install fonttools
 * Kullanım:    node scripts/font-goem.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const KESIMLER = { "500Medium": 500, "600SemiBold": 600, "700Bold": 700 };
const HEDEF = "src/lib/fontlar";

const karakterler = [
  ...Array.from({ length: 0x7f - 0x20 }, (_, i) => String.fromCharCode(0x20 + i)),
  ..."ÇĞİÖŞÜçğıöşüÂÎÛâîû",
  ..."·…–—“”‘’«»°′″×÷±≈≤≥№™©®",
];
const unicodes = karakterler.map((c) => `U+${c.codePointAt(0).toString(16).padStart(4, "0").toUpperCase()}`).join(",");

mkdirSync(HEDEF, { recursive: true });
const gecici = mkdtempSync(join(tmpdir(), "ayra-font-"));

for (const [kesim, agirlik] of Object.entries(KESIMLER)) {
  const kaynak = `node_modules/@expo-google-fonts/inter/${kesim}/Inter_${kesim}.ttf`;
  const cikti = join(gecici, `${agirlik}.ttf`);
  execFileSync("pyftsubset", [kaynak, `--unicodes=${unicodes}`, `--output-file=${cikti}`,
    "--layout-features=", "--no-hinting", "--desubroutinize"]);

  const b64 = readFileSync(cikti).toString("base64");
  const satirlar = b64.match(/.{1,100}/g) ?? [];
  const govde = satirlar.map((s, i) => `  "${s}"${i < satirlar.length - 1 ? " +" : ""}`).join("\n");

  writeFileSync(join(HEDEF, `inter-${agirlik}.ts`), `/**
 * Inter ${kesim} — Latin ve Türkçe karakterlere indirgenmiş TTF, base64.
 *
 * Neden dosya değil de kaynak kodu: Vercel'in sunucusunda hiçbir yazı tipi
 * kurulu değil ve sunucusuz işlevin dosya sistemine ayrı bir dosyanın
 * gireceğinin garantisi yok. Font kaynak kodunun içinde olduğunda paylaşım
 * görselleri her ortamda aynı çıkar. Elle düzenlenmez; scripts/font-goem.mjs
 * üretir.
 *
 * Inter, SIL Open Font License 1.1 ile dağıtılır.
 */
export const INTER_${agirlik} =
${govde};
`);
  console.log(`inter-${agirlik}.ts yazıldı (${(b64.length / 1024).toFixed(1)} KB)`);
}
