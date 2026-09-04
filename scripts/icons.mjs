#!/usr/bin/env node
/** AYRA uygulama ikonlarını marka işaretinden üretir. */
import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";

const mark = (size, radiusRatio = 0.275, bg = "#0b1c33") => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 40 40">
  <rect width="40" height="40" rx="${40 * radiusRatio}" fill="${bg}"/>
  <path d="M20 9.5c-4.4 0-8 3.5-8 7.9 0 5.6 6.7 11.6 7.4 12.2a.9.9 0 0 0 1.2 0c.7-.6 7.4-6.6 7.4-12.2 0-4.4-3.6-7.9-8-7.9Z"
        fill="none" stroke="#ffffff" stroke-width="2.1" stroke-linejoin="round"/>
  <circle cx="20" cy="17.2" r="3.3" fill="#33bfa7"/>
</svg>`;

mkdirSync("public/icons", { recursive: true });

const jobs = [
  ["public/icons/icon-192.png", 192, 0.275],
  ["public/icons/icon-512.png", 512, 0.275],
  ["public/icons/icon-maskable-512.png", 512, 0],
  ["public/icons/apple-touch-icon.png", 180, 0],
  ["public/icons/favicon-32.png", 32, 0.2],
];

for (const [path, size, radius] of jobs) {
  const png = await sharp(Buffer.from(mark(size, radius))).png().toBuffer();
  writeFileSync(path, png);
  console.log("✓", path);
}

// favicon.ico — 32×32 PNG, modern tarayıcılar kabul eder
writeFileSync("src/app/icon.png", await sharp(Buffer.from(mark(180, 0.2))).png().toBuffer());
writeFileSync("src/app/apple-icon.png", await sharp(Buffer.from(mark(180, 0))).png().toBuffer());
console.log("✓ src/app/icon.png, src/app/apple-icon.png");
