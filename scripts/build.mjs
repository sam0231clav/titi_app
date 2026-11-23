// Compila Titi: junta y minimiza el código en pocos archivos, genera la caché offline y deja todo en /www.
//   npm run build        → genera /www (lo que se publica en Firebase Hosting y se empaqueta en el APK)
//   npm run dev          → compila y abre un servidor local en http://localhost:5173
import { build } from "esbuild";
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { join, relative, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(RAIZ, "src");
const WWW = join(RAIZ, "www");

rmSync(WWW, { recursive: true, force: true });
mkdirSync(WWW, { recursive: true });

const r = await build({
  entryPoints: { "js/app": join(SRC, "js/app.js"), "css/app": join(SRC, "css/app.css") },
  outdir: WWW,
  entryNames: "[dir]/[name]-[hash]",
  chunkNames: "js/[name]-[hash]",
  bundle: true,
  splitting: true,
  format: "esm",
  minify: true,
  target: ["es2022"],
  legalComments: "none",
  metafile: true,
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "warning",
});

const salidas = Object.keys(r.metafile.outputs).map((f) => relative(WWW, join(RAIZ, f)).replace(/\\/g, "/"));
const js = salidas.find((f) => /^js\/app-.*\.js$/.test(f));
const css = salidas.find((f) => /^css\/app-.*\.css$/.test(f));

cpSync(join(SRC, "assets"), join(WWW, "assets"), { recursive: true });
cpSync(join(SRC, "manifest.webmanifest"), join(WWW, "manifest.webmanifest"));

const html = readFileSync(join(SRC, "index.html"), "utf8").replace("css/app.css", css).replace("js/app.js", js);
writeFileSync(join(WWW, "index.html"), html);

const todos = [];
(function recorrer(d) {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    statSync(p).isDirectory() ? recorrer(p) : todos.push(relative(WWW, p).replace(/\\/g, "/"));
  }
})(WWW);
const precache = ["./", ...todos.map((f) => "./" + f)];
const version = "titi-" + createHash("sha1").update(todos.map((f) => f + readFileSync(join(WWW, f)).length).join("|")).digest("hex").slice(0, 10);
const sw = readFileSync(join(SRC, "sw.js"), "utf8")
  .replace('"__VERSION__"', JSON.stringify(version))
  .replace("__PRECACHE__", JSON.stringify(precache));
if (sw.includes("__VERSION__") || sw.includes("__PRECACHE__")) throw new Error("sw.js: faltó rellenar la versión o la caché");
writeFileSync(join(WWW, "sw.js"), sw);

let kb = 0;
for (const f of todos) kb += statSync(join(WWW, f)).size;
console.log(`✔ Titi compilado en /www (${todos.length} archivos, ${(kb / 1024).toFixed(0)} KB) · versión ${version}`);

if (process.argv.includes("--servir")) {
  const tipos = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
  createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/index.html";
    const f = join(WWW, p);
    if (!f.startsWith(WWW) || !existsSync(f) || statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": tipos[extname(f)] || "application/octet-stream" });
    res.end(readFileSync(f));
  }).listen(5173, () => console.log("Abre http://localhost:5173"));
}
