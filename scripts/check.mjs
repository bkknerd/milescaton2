// Checks the built site in dist/. Runs after every build (npm run build) or on its own (npm run check).
// Errors fail the build. Warnings are things to fix before launch.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "dist");
const site = JSON.parse(fs.readFileSync(path.join(ROOT, "content/site.json"), "utf8"));
const errors = [], warnings = [];
const err = (f, m) => errors.push(`${f}: ${m}`);
const warn = (f, m) => warnings.push(`${f}: ${m}`);

if (!fs.existsSync(OUT)) { console.error("No dist/ folder. Run npm run build first."); process.exit(1); }

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk(OUT);
const pages = files.filter((f) => f.endsWith(".html") && !f.includes(`${path.sep}admin${path.sep}`));
const exists = (url) => {
  const clean = decodeURIComponent(url.split(/[?#]/)[0]);
  const p = path.join(OUT, clean);
  return fs.existsSync(p) && (fs.statSync(p).isFile() || fs.existsSync(path.join(p, "index.html")));
};
// Glyphs phones draw as emoji, and decorative emoji in general
const GLYPHS = /[←-⇿⬀-⯿☀-➿\u{1F300}-\u{1FAFF}]/u;

for (const file of pages) {
  const rel = "/" + path.relative(OUT, file).replace(/\\/g, "/");
  const html = fs.readFileSync(file, "utf8");
  const text = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ");

  if (!/<title>[^<]{3,}<\/title>/.test(html)) err(rel, "missing <title>");
  if (!/<meta name="description" content="[^"]{20,}"/.test(html)) err(rel, "missing or short meta description");
  if (!/<link rel="canonical"/.test(html)) err(rel, "missing canonical link");
  const h1 = (html.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) err(rel, `expected one <h1>, found ${h1}`);
  for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\balt="/.test(m[0])) err(rel, `image without alt: ${m[0].slice(0, 80)}`);
  for (const m of html.matchAll(/\b(?:href|src)="(\/[^"]*)"/g)) {
    const url = m[1];
    if (url.startsWith("//")) continue;
    if (!exists(url)) err(rel, `broken link or file: ${url}`);
  }
  for (const m of html.matchAll(/\bsrcset="([^"]+)"/g)) for (const part of m[1].split(",")) {
    const u = part.trim().split(/\s+/)[0]; if (u.startsWith("/") && !exists(u)) err(rel, `missing resized photo: ${u}`);
  }
  if (GLYPHS.test(text)) err(rel, `arrow or emoji glyph in visible text: "${text.match(GLYPHS)[0]}"`);
  for (const m of html.matchAll(/<form\b[^>]*data-netlify="true"[^>]*>([\s\S]*?)<\/form>/g)) {
    const name = (m[0].match(/\bname="([^"]+)"/) || [])[1];
    if (!name) err(rel, "Netlify form without a name");
    else if (!m[1].includes(`name="form-name" value="${name}"`)) err(rel, `form "${name}" is missing its hidden form-name field`);
  }
  if (rel !== "/404.html" && !/href="https:\/\/draftandlogic\.com\/?"[^>]*>\s*Site by Draft &amp; Logic/.test(html)) err(rel, "footer credit to Draft & Logic is missing");
  if (/href="#"/.test(html)) warn(rel, 'link with href="#"');
}

if (!fs.existsSync(path.join(OUT, site.og_image.replace(/^\//, "")))) err("site.json", `share image not found: ${site.og_image}`);
const sm = fs.existsSync(path.join(OUT, "sitemap.xml")) ? fs.readFileSync(path.join(OUT, "sitemap.xml"), "utf8") : "";
if (!sm.includes(site.url)) err("sitemap.xml", `does not use the site address ${site.url}`);
const robots = fs.existsSync(path.join(OUT, "robots.txt")) ? fs.readFileSync(path.join(OUT, "robots.txt"), "utf8") : "";
if (!robots.includes(`${site.url}/sitemap.xml`)) err("robots.txt", "sitemap line does not point at the site address");
const cfg = fs.readFileSync(path.join(ROOT, "admin/config.yml"), "utf8");
if (!cfg.includes(`site_url: ${site.url}`)) warn("admin/config.yml", `site_url does not match content/site.json (${site.url})`);
if (/netlify\.app/.test(site.url)) warn("site.json", `site address is still ${site.url}. Set the custom domain before launch`);

for (const e of errors) console.error("  error  " + e);
for (const w of warnings) console.warn("  warn   " + w);
console.log(`Checked ${pages.length} pages: ${errors.length} errors, ${warnings.length} warnings`);
if (errors.length) process.exit(1);
