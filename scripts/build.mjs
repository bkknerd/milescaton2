// Builds the Miles Caton fan site (milescaton2) into dist/.
//
//   content/*.json   everything editors change at /admin (Decap CMS)
//   templates/       page templates (Nunjucks), layouts and partials
//   assets/ img/ admin/ robots.txt   copied as they are
//
// Photos are resized on every build into AVIF, WebP and JPEG at a few widths,
// so anything uploaded through the CMS is optimised automatically.
//
// Run: npm run build      (npm start builds, serves dist/ and rebuilds on change)

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import http from "node:http";
import { fileURLToPath } from "node:url";
import nunjucks from "nunjucks";
import markdownIt from "markdown-it";
import sharp from "sharp";
import YAML from "yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "dist");
const TPL = path.join(ROOT, "templates");
const CACHE = path.join(ROOT, ".cache", "img");
const COPY = ["assets", "img", "admin"];

const IMG_WIDTHS = [400, 800, 1200, 1800];
const IMG_FORMATS = [
  ["avif", { quality: 55 }],
  ["webp", { quality: 76 }],
  ["jpeg", { quality: 78, progressive: true }],
];

const md = markdownIt({ html: false, typographer: true, breaks: true });
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

// ---------------------------------------------------------------- templates
function makeEnv(imgCalls) {
  const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(TPL, { noCache: true }), { autoescape: true });
  const f = (name, fn) => env.addFilter(name, fn);

  // *italic*  **condensed caps**  — used across the CMS text fields
  f("mdi", (s) => (s ? md.renderInline(String(s)) : ""));
  f("md", (s) => (s ? md.render(String(s)) : ""));
  f("nl2br", (s) => (s ? String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>") : ""));
  f("pad2", (n) => String(n).padStart(2, "0"));
  f("roman", (n) => ["i","ii","iii","iv","v","vi","vii","viii","ix","x","xi","xii"][n] || String(n + 1));
  f("chars", (s) => String(s || "").split(""));
  f("absUrl", (p, base) => { try { return new URL(p, base).href; } catch { return p; } });
  f("isCurrent", (url, pageUrl) => url !== "/" && !!pageUrl && pageUrl.startsWith(url));
  f("navHere", (item, pageUrl) => [item.url, ...((item.children || []).map((c) => c.url))].some((u) => u && u !== "/" && !!pageUrl && pageUrl.startsWith(u)));
  f("year", () => new Date().getFullYear());
  f("pressDate", (it) => {
    if (it.display) return it.display;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(it.date || "");
    return m ? `${MON[+m[2] - 1]} ${+m[3]}, ${m[1]}` : it.date || "";
  });
  f("pressYear", (it) => String(it.date || "").slice(0, 4));
  f("sortPress", (items) => [...(items || [])].sort((a, b) => String(b.date).localeCompare(String(a.date))));
  f("uniqKinds", (items) => [...new Set((items || []).map((i) => i.kind).filter(Boolean))]);
  f("onlyFeatured", (items) => (items || []).filter((i) => i.featured));
  f("take", (arr, n) => (arr || []).slice(0, n));

  // {% img src, alt, class, sizes, attrs %} — leaves a marker; the <picture> is filled in after resizing.
  function ImgTag() {
    this.tags = ["img"];
    this.parse = (parser, nodes) => {
      const tok = parser.nextToken();
      const args = parser.parseSignature(null, true);
      parser.advanceAfterBlockEnd(tok.value);
      return new nodes.CallExtension(this, "run", args);
    };
    this.run = (_ctx, src, alt = "", cls = "", sizes = "100vw", attrs = "") => {
      if (!src) return "";
      imgCalls.push({ src, alt, cls, sizes, attrs });
      return new nunjucks.runtime.SafeString(`<!--IMG:${imgCalls.length - 1}-->`);
    };
  }
  env.addExtension("ImgTag", new ImgTag());
  return env;
}

function readPage(file) {
  const raw = fs.readFileSync(path.join(TPL, file), "utf8");
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  return { data: m ? YAML.parse(m[1]) || {} : {}, body: m ? raw.slice(m[0].length) : raw };
}

function urlFor(file, data) {
  if (data.permalink) return data.permalink;
  const name = file.replace(/\.njk$/, "");
  return name === "index" ? "/" : `/${name}/`;
}

function outFile(url) {
  return path.join(OUT, url.endsWith("/") ? path.join(url, "index.html") : url);
}

// ---------------------------------------------------------------- images
async function resize(src) {
  const input = path.join(ROOT, src.replace(/^\//, ""));
  const buf = fs.readFileSync(input);
  const hash = crypto.createHash("sha1").update(buf).digest("base64url").slice(0, 10);
  const meta = await sharp(buf).metadata();
  const rotated = (meta.orientation || 1) >= 5;
  const fullW = rotated ? meta.height : meta.width;
  const fullH = rotated ? meta.width : meta.height;
  const widths = [...new Set([...IMG_WIDTHS.filter((w) => w < fullW), Math.min(fullW, 1800)])].sort((a, b) => a - b);

  fs.mkdirSync(CACHE, { recursive: true });
  fs.mkdirSync(path.join(OUT, "img/r"), { recursive: true });
  const sets = {};
  for (const [fmt, opts] of IMG_FORMATS) {
    sets[fmt] = [];
    for (const w of widths) {
      const name = `${hash}-${w}.${fmt}`;
      const cached = path.join(CACHE, name);
      if (!fs.existsSync(cached)) await sharp(buf).rotate().resize({ width: w }).toFormat(fmt, opts).toFile(cached);
      fs.copyFileSync(cached, path.join(OUT, "img/r", name));
      sets[fmt].push({ url: `/img/r/${name}`, w });
    }
  }
  const largest = widths[widths.length - 1];
  return { sets, width: largest, height: Math.round((fullH / fullW) * largest) };
}

function picture(r, { alt, cls, sizes, attrs }) {
  const srcset = (fmt) => r.sets[fmt].map((s) => `${s.url} ${s.w}w`).join(", ");
  const lazy = /fetchpriority="high"/.test(attrs) ? "eager" : "lazy";
  return (
    `<picture>` +
    `<source type="image/avif" srcset="${srcset("avif")}" sizes="${esc(sizes)}">` +
    `<source type="image/webp" srcset="${srcset("webp")}" sizes="${esc(sizes)}">` +
    `<img class="${esc(cls)}" ${attrs} src="${r.sets.jpeg[0].url}" alt="${esc(alt)}" loading="${lazy}" decoding="async" ` +
    `width="${r.width}" height="${r.height}" srcset="${srcset("jpeg")}" sizes="${esc(sizes)}">` +
    `</picture>`
  );
}

// ---------------------------------------------------------------- build
function copy(rel) {
  const from = path.join(ROOT, rel);
  if (fs.existsSync(from)) fs.cpSync(from, path.join(OUT, rel), { recursive: true, filter: (p) => !p.endsWith(".gitkeep") });
}

export async function build() {
  const t0 = Date.now();
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  COPY.forEach(copy);

  const content = {};
  for (const f of fs.readdirSync(path.join(ROOT, "content")).filter((f) => f.endsWith(".json"))) {
    content[f.replace(/\.json$/, "")] = JSON.parse(fs.readFileSync(path.join(ROOT, "content", f), "utf8"));
  }

  const imgCalls = [];
  const env = makeEnv(imgCalls);
  const pages = fs.readdirSync(TPL).filter((f) => f.endsWith(".njk")).map((file) => {
    const { data, body } = readPage(file);
    return { file, data, body, url: urlFor(file, data) };
  });
  const all = pages.filter((p) => p.data.sitemap !== false).map((p) => ({ url: p.url }));

  const rendered = [];
  for (const p of pages) {
    const { layout, computed, permalink, sitemap, ...front } = p.data;
    const ctx = { ...content, ...front, page: { url: p.url }, collections: { all } };
    for (const [k, v] of Object.entries(computed || {})) ctx[k] = env.renderString(String(v), ctx);
    let html = env.renderString(p.body, ctx);
    if (layout) html = env.render(layout, { ...ctx, content: new nunjucks.runtime.SafeString(html) });
    rendered.push({ url: p.url, html });
  }

  const bySrc = new Map();
  for (const c of imgCalls) {
    if (bySrc.has(c.src)) continue;
    try { bySrc.set(c.src, await resize(c.src)); }
    catch (e) { console.warn(`[img] could not process ${c.src}: ${e.message}`); bySrc.set(c.src, null); }
  }
  const fill = (html) => html.replace(/<!--IMG:(\d+)-->/g, (_, i) => {
    const c = imgCalls[+i];
    const r = bySrc.get(c.src);
    return r ? picture(r, c) : `<img src="${esc(c.src)}" alt="${esc(c.alt)}" class="${esc(c.cls)}" loading="lazy" decoding="async" ${c.attrs}>`;
  });

  for (const { url, html } of rendered) {
    const file = outFile(url);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, fill(html));
  }
  console.log(`Built ${rendered.length} pages and ${bySrc.size} photos in ${((Date.now() - t0) / 1000).toFixed(1)}s → dist/`);
}

// ---------------------------------------------------------------- local preview
function serve(port = 8080) {
  const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".json": "application/json",
    ".xml": "application/xml", ".woff2": "font/woff2", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".webp": "image/webp", ".avif": "image/avif", ".yml": "text/yaml", ".txt": "text/plain" };
  http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = path.join(OUT, p);
    if (!file.startsWith(OUT)) return res.writeHead(403).end();
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file)) { res.writeHead(404, { "content-type": "text/html" }); return res.end(fs.readFileSync(path.join(OUT, "404.html"))); }
    res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  }).listen(port, () => console.log(`Preview: http://localhost:${port}`));

  let timer;
  for (const dir of ["content", "templates", "assets", "img", "admin"]) {
    fs.watch(path.join(ROOT, dir), { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => build().catch((e) => console.error(e.message)), 150);
    });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  build().then(() => { if (process.argv.includes("--serve")) serve(); }).catch((e) => { console.error(e); process.exit(1); });
}
