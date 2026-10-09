// Generates the GeoEstate flood posters for one or all 30 Osun LGAs, straight from the project data (no server needed).
//
//   node scripts/generate-posters.mjs                      all 30 LGAs  -> posters/
//   node scripts/generate-posters.mjs --lga "Ife South"    one LGA
//   node scripts/generate-posters.mjs --url https://your-app.up.railway.app/   adds a LandCheck QR code beside the WhatsApp one
//   node scripts/generate-posters.mjs --out D:/posters --svg-only
//
// Per LGA it writes:  <slug>-a2.svg  <slug>-a2.jpg (A2, ~150 dpi)  <slug>-a2.pdf (A2, print)  <slug>-social.jpg (1080x1350)
// Needs Node 22.18+ (runs the TypeScript lib files directly; on 22.6-22.17 add --experimental-strip-types).
// JPEG needs `sharp`, PDF needs `playwright` (or `puppeteer`) with Chromium:  npm i -D sharp playwright && npx playwright install chromium
// Without them the script still writes the SVGs, which open in any browser and print to PDF.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { register } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2), opt = (n, d = null) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : (args[i + 1]?.startsWith("--") || args[i + 1] === undefined ? true : args[i + 1]); };
const only = opt("lga"), outDir = path.resolve(String(opt("out", "posters"))), appUrl = opt("url") && opt("url") !== true ? String(opt("url")) : null, svgOnly = !!opt("svg-only");

const [maj, min] = process.versions.node.split(".").map(Number);
if (maj < 22 || (maj === 22 && min < 6)) { console.error("Node 22.18+ is required (it runs the TypeScript lib files directly)."); process.exit(1); }
const origWarn = process.emitWarning; process.emitWarning = (w, ...r) => (String(w).includes("Module type of file") || String(w).includes("ExperimentalWarning") ? undefined : origWarn.call(process, w, ...r));

// let Node resolve the project's "@/..." alias and extensionless relative imports of .ts files
const hook = `import{pathToFileURL,fileURLToPath}from"node:url";import fs from"node:fs";const ROOT=${JSON.stringify(root)};
export async function resolve(s,c,n){if(s.startsWith("@/"))return n(pathToFileURL(ROOT+"/"+s.slice(2)+".ts").href,c);
if(s.startsWith("./")&&!/\\.\\w+$/.test(s)&&c.parentURL){const p=fileURLToPath(new URL(s+".ts",c.parentURL));if(fs.existsSync(p))return n(pathToFileURL(p).href,c);}return n(s,c);}`;
register("data:text/javascript," + encodeURIComponent(hook));
process.chdir(root);
const geoai = await import(pathToFileURL(path.join(root, "lib/geoai.ts")).href);
const poster = await import(pathToFileURL(path.join(root, "lib/geoai-poster.ts")).href);

const req = createRequire(import.meta.url);
const tryLoad = n => { try { return req(n); } catch { return null; } };
const sharp = svgOnly ? null : tryLoad("sharp");
const pw = svgOnly ? null : (tryLoad("playwright") || tryLoad("puppeteer"));
if (!svgOnly && !sharp) console.warn("• sharp not installed: JPEG files will be skipped (npm i -D sharp).");
if (!svgOnly && !pw) console.warn("• playwright/puppeteer not installed: PDF files will be skipped (npm i -D playwright && npx playwright install chromium).");

fs.mkdirSync(outDir, { recursive: true });
const logo = "data:image/png;base64," + fs.readFileSync(path.join(root, "public/geoestate-logo.png")).toString("base64");
const ranking = geoai.rankLgas();
const names = only ? [geoai.findLga(String(only))].filter(Boolean) : geoai.lgaNames();
if (!names.length) { console.error(`Unknown LGA "${only}". Choose from: ${geoai.lgaNames().join(", ")}`); process.exit(1); }
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

let browser = null, newPage = null;
if (pw) {
  try {
    const launcher = pw.chromium; browser = await launcher.launch();
    newPage = async () => (pw.chromium && browser.newPage ? browser.newPage() : null);
  } catch (e) { console.warn("• Could not start Chromium for PDFs:", e.message.split("\n")[0]); browser = null; }
}

for (const name of names) {
  const bundle = { analysis: geoai.analyse({ lga: name }), extras: geoai.posterExtras(name), ranking };
  const base = path.join(outDir, slug(name)), made = [];
  const a2 = poster.buildPosterSvg(bundle, { format: "a2", logo, appUrl }), soc = poster.buildPosterSvg(bundle, { format: "social", logo, appUrl });
  fs.writeFileSync(`${base}-a2.svg`, a2); fs.writeFileSync(`${base}-social.svg`, soc); made.push("svg");
  if (sharp) {
    await sharp(Buffer.from(a2), { density: 72 }).resize(2478, 3505).flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toFile(`${base}-a2.jpg`);
    await sharp(Buffer.from(soc), { density: 72 }).resize(1080, 1350).flatten({ background: "#ffffff" }).jpeg({ quality: 92 }).toFile(`${base}-social.jpg`); made.push("jpg");
  }
  if (browser) {
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><html><head><style>@page{size:420mm 594mm;margin:0}html,body{margin:0}svg{display:block;width:420mm;height:594mm}</style></head><body>${a2}</body></html>`);
    await page.pdf({ path: `${base}-a2.pdf`, width: "420mm", height: "594mm", printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
    await page.close(); made.push("pdf");
  }
  console.log(`${name.padEnd(18)} rank ${String(bundle.analysis.rank.position).padStart(2)}  High ${String(bundle.analysis.flood.exposedPct).padStart(4)}%  -> ${made.join(", ")}`);
}
if (browser) await browser.close();
console.log(`\nDone: ${names.length} LGA(s) in ${outDir}`);
