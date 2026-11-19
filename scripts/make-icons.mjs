// Generates the PWA icons from an inline SVG. Run: node scripts/make-icons.mjs
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const glyph = (scale = 1) => {
  const t = (n) => 256 + (n - 256) * scale;
  return `<g fill="none" stroke="#fff" stroke-width="${34 * scale}" stroke-linecap="round" stroke-linejoin="round">
    <path d="M${t(180)} ${t(156)} H${t(332)}"/><path d="M${t(180)} ${t(214)} H${t(332)}"/>
    <path d="M${t(180)} ${t(156)} H${t(236)} A${58 * scale} ${58 * scale} 0 0 1 ${t(236)} ${t(272)} H${t(184)} L${t(318)} ${t(372)}"/>
  </g>
  <circle cx="${t(372)}" cy="${t(372)}" r="${30 * scale}" fill="#f2c14e"/>`;
};
const svg = (rounded, scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="#2f5d50"/>${glyph(scale)}</svg>`;

const out = [
  ["public/icons/icon-192.png", 192, svg(true, 1)],
  ["public/icons/icon-512.png", 512, svg(true, 1)],
  ["public/icons/icon-maskable-512.png", 512, svg(false, 0.78)],
  ["public/apple-touch-icon.png", 180, svg(false, 0.9)],
];
for (const [file, size, s] of out) {
  await sharp(Buffer.from(s)).resize(size, size).png().toFile(file);
  console.log("wrote", file);
}
writeFileSync("public/icons/icon.svg", svg(true, 1));
