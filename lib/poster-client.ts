// Browser side of the GeoAI poster: fetch data, colour the zone raster, build the SVG, rasterise to JPEG, zip for batches.
import { ZONE } from "./poster-kit";
import { buildA2Svg, buildSocialSvg, A2, SOCIAL, type PosterAssets, type PosterData } from "./poster-svg";

const hex = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
export function decodeRle(b64: string, n: number): Uint8Array {
  const bin = atob(b64), out = new Uint8Array(n); let p = 0;
  for (let i = 0; i + 2 < bin.length && p < n; i += 3) { const v = bin.charCodeAt(i), len = bin.charCodeAt(i + 1) | (bin.charCodeAt(i + 2) << 8); out.fill(v, p, Math.min(n, p + len)); p += len; }
  return out;
}
// Colour the per-cell flood classes (1/0 Low, 2 Moderate, 3 High, 4 stream, 5 water, 255 outside) and upscale smoothly.
export function zoneRasterDataUri(r: { ncols: number; nrows: number; rle: string }, scale = 3): string {
  const cls = decodeRle(r.rle, r.ncols * r.nrows), c = document.createElement("canvas"); c.width = r.ncols; c.height = r.nrows;
  const ctx = c.getContext("2d")!, img = ctx.createImageData(r.ncols, r.nrows), pal: Record<number, number[]> = { 2: hex(ZONE.mod), 3: hex(ZONE.high), 4: hex(ZONE.water), 5: hex(ZONE.water) }, low = hex(ZONE.low);
  for (let i = 0; i < cls.length; i++) { const v = cls[i]; if (v === 255) continue; const col = pal[v] || low; img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  const big = document.createElement("canvas"); big.width = r.ncols * scale; big.height = r.nrows * scale;
  const b = big.getContext("2d")!; b.imageSmoothingEnabled = true; b.imageSmoothingQuality = "high"; b.drawImage(c, 0, 0, big.width, big.height);
  return big.toDataURL("image/png");
}
const toDataUri = (blob: Blob) => new Promise<string>((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result)); f.onerror = rej; f.readAsDataURL(blob); });
let shared: Promise<{ logo: string; lgaFc: any }> | null = null;
export function loadSharedAssets() {
  return (shared ??= (async () => {
    const [logo, fc] = await Promise.all([fetch("/geoestate-logo.png").then(r => r.blob()).then(toDataUri), fetch("/lga-osun.geojson").then(r => r.json())]);
    return { logo, lgaFc: fc };
  })().catch(e => { shared = null; throw e; }));
}
export async function fetchPosterData(lga: string): Promise<PosterData> {
  const r = await fetch(`/api/poster-data?lga=${encodeURIComponent(lga)}`); const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Could not load poster data");
  return j;
}
export function svgToJpeg(svg: string, w: number, h: number, outW: number, quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" })), img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas"), k = outW / w; c.width = Math.round(w * k); c.height = Math.round(h * k);
        const x = c.getContext("2d")!; x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.imageSmoothingQuality = "high"; x.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); c.toBlob(b => (b ? resolve(b) : reject(new Error("JPEG export failed"))), "image/jpeg", quality);
      } catch (e) { reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Poster could not be rendered")); };
    img.src = url;
  });
}
export const A2_PX = 3307; // A2 (420 mm) at ~200 dpi = 3307 x 4677 px (15.5 MP, inside the mobile canvas limit)
export type PosterKind = "a2" | "social";
export async function makePoster(lga: string, kind: PosterKind, prefetched?: PosterData): Promise<{ blob: Blob; name: string }> {
  const [shared2, data] = await Promise.all([loadSharedAssets(), prefetched ? Promise.resolve(prefetched) : fetchPosterData(lga)]);
  const assets: PosterAssets = { ...shared2, zoneImg: zoneRasterDataUri(data.map.raster, kind === "a2" ? 3 : 2) };
  const slug = data.analysis.name.replace(/\W+/g, "-");
  if (kind === "a2") return { blob: await svgToJpeg(buildA2Svg(data, assets), A2.w, A2.h, A2_PX), name: `GeoEstate_${slug}_LGA_Flood_Poster_A2.jpg` };
  return { blob: await svgToJpeg(buildSocialSvg(data, assets), SOCIAL.w, SOCIAL.h, 2160, 0.9), name: `GeoEstate_${slug}_LGA_Flood_Post_1080x1350.jpg` };
}

/* ---- minimal ZIP (store only) so a batch of 30 JPEGs downloads as one file ---- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b: Uint8Array) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function zipStore(files: { name: string; data: Uint8Array }[]): Blob {
  const parts: BlobPart[] = [], central: BlobPart[] = []; let off = 0, cdSize = 0; const enc = new TextEncoder();
  for (const f of files) {
    const nm = enc.encode(f.name), crc = crc32(f.data), h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint32(14, crc, true); h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, nm.length, true);
    parts.push(h.buffer, nm as BlobPart, f.data as BlobPart);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true); c.setUint32(20, f.data.length, true); c.setUint32(24, f.data.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    central.push(c.buffer, nm as BlobPart); cdSize += 46 + nm.length; off += 30 + nm.length + f.data.length;
  }
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...central, end.buffer], { type: "application/zip" });
}
export const downloadBlob = (blob: Blob, name: string) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
