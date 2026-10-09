import { buildPosterSvg, posterSize, type PosterFormat } from "@/lib/geoai-poster";

// Browser-side poster delivery for the GeoAI panel: fetch the figures, build the SVG, then save a JPEG (canvas) or open a print view (PDF).
export type PosterKind = "a2-pdf" | "a2-jpg" | "social-jpg";

async function toDataUri(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error("Could not read the logo")); r.readAsDataURL(blob); });
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// A QR code to LandCheck only makes sense on a public address.
const publicOrigin = () => (/^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname) ? null : location.origin + "/");

async function svgToJpeg(svg: string, w: number, h: number, scale: number): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("The browser could not draw the poster")); img.src = url; });
    const c = document.createElement("canvas"); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    const ctx = c.getContext("2d"); if (!ctx) throw new Error("Canvas is not available");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error("Could not encode the JPEG"))), "image/jpeg", 0.92));
  } finally { URL.revokeObjectURL(url); }
}
function saveBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function makePoster(lga: string, kind: PosterKind, printWindow?: Window | null): Promise<void> {
  const [res, logo] = await Promise.all([fetch(`/api/poster-data?lga=${encodeURIComponent(lga)}`), toDataUri("/geoestate-logo.png")]);
  const bundle = await res.json(); if (!res.ok) throw new Error(bundle.error || "Poster data unavailable");
  const format: PosterFormat = kind === "social-jpg" ? "social" : "a2", size = posterSize(format);
  const svg = buildPosterSvg(bundle, { format, logo, appUrl: publicOrigin() });
  const name = `geoestate-${slug(lga)}-flood-poster-${format}`;
  if (kind === "a2-pdf") {
    const w = printWindow ?? window.open("", "_blank"); if (!w) throw new Error("Your browser blocked the poster window. Allow pop-ups for this site and try again.");
    w.document.open();
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${name}</title><style>@page{size:420mm 594mm;margin:0}html,body{margin:0;background:#fff}svg{display:block;width:420mm;height:594mm}.bar{font:14px Arial;padding:10px 16px;background:#0c2a4d;color:#fff}.bar button{margin-left:12px;padding:6px 12px;border:0;border-radius:6px;background:#2e7d32;color:#fff;font-weight:700;cursor:pointer}@media print{.bar{display:none}}</style></head><body><div class="bar">A2 poster. Choose paper size A2 (or "Save as PDF" with margins set to none).<button onclick="window.print()">Print / Save as PDF</button></div>${svg}</body></html>`);
    w.document.close();
    return;
  }
  const scale = kind === "a2-jpg" ? 0.59 : 1;            // A2 at ~150 dpi (2478 x 3505 px); social at 1080 x 1350
  saveBlob(`${name}.jpg`, await svgToJpeg(svg, size.w, size.h, scale));
}
