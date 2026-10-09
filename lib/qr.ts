// Minimal dependency-free QR Code generator (byte mode, error correction M, versions 1-6 = up to 106 bytes).
// Enough for a WhatsApp link or an app URL. Returns a square boolean matrix (true = dark module).
const EC: Record<number, { data: number; ecc: number; blocks: number }> = {
  1: { data: 16, ecc: 10, blocks: 1 }, 2: { data: 28, ecc: 16, blocks: 1 }, 3: { data: 44, ecc: 26, blocks: 1 },
  4: { data: 64, ecc: 18, blocks: 2 }, 5: { data: 86, ecc: 24, blocks: 2 }, 6: { data: 108, ecc: 16, blocks: 4 },
};
const ALIGN: Record<number, number[]> = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34] };

const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
(() => { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
const gmul = (a: number, b: number) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function rsGenerator(deg: number): number[] {
  let g = [1];
  for (let i = 0; i < deg; i++) { const n = new Array(g.length + 1).fill(0); for (let j = 0; j < g.length; j++) { n[j] ^= g[j]; n[j + 1] ^= gmul(g[j], EXP[i]); } g = n; }
  return g;
}
function rsRemainder(data: number[], deg: number): number[] {
  const gen = rsGenerator(deg), res = new Array(deg).fill(0);
  for (const b of data) { const f = b ^ res.shift()!; res.push(0); if (f) for (let i = 0; i < deg; i++) res[i] ^= gmul(gen[i + 1], f); }
  return res;
}

export function qrMatrix(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  const ver = [1, 2, 3, 4, 5, 6].find(v => bytes.length <= EC[v].data - 2);
  if (!ver) throw new Error("QR text too long (max 106 bytes)");
  const { data: dataCw, ecc, blocks } = EC[ver], size = 17 + 4 * ver;

  // ---- bit stream: mode 0100, 8-bit length, data, terminator, pad bytes
  const bits: number[] = []; const put = (v: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(4, 4); put(bytes.length, 8); bytes.forEach(b => put(b, 8));
  put(0, Math.min(4, dataCw * 8 - bits.length)); while (bits.length % 8) bits.push(0);
  for (let p = 0xec; bits.length < dataCw * 8; p ^= 0xec ^ 0x11) put(p, 8);
  const cw: number[] = []; for (let i = 0; i < bits.length; i += 8) cw.push(parseInt(bits.slice(i, i + 8).join(""), 2));

  // ---- split into blocks, add Reed-Solomon, interleave
  const per = dataCw / blocks, dBlocks: number[][] = [], eBlocks: number[][] = [];
  for (let b = 0; b < blocks; b++) { const d = cw.slice(b * per, (b + 1) * per); dBlocks.push(d); eBlocks.push(rsRemainder(d, ecc)); }
  const out: number[] = [];
  for (let i = 0; i < per; i++) for (const d of dBlocks) out.push(d[i]);
  for (let i = 0; i < ecc; i++) for (const e of eBlocks) out.push(e[i]);

  // ---- function patterns
  const m: (boolean | null)[][] = Array.from({ length: size }, () => new Array(size).fill(null));
  const fn: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (r: number, c: number, v: boolean) => { if (r < 0 || c < 0 || r >= size || c >= size) return; m[r][c] = v; fn[r][c] = true; };
  const finder = (r0: number, c0: number) => { for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) { const on = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6 && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4)); set(r0 + dr, c0 + dc, on); } };
  finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
  for (let i = 8; i < size - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const al = ALIGN[ver];
  for (const r of al) for (const c of al) { if ((r === 6 && c === 6) || (r === 6 && c === al[al.length - 1]) || (c === 6 && r === al[al.length - 1])) continue; for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1); }
  set(size - 8, 8, true);                                     // dark module
  for (let i = 0; i < 9; i++) { if (!fn[8][i]) set(8, i, false); if (!fn[i][8]) set(i, 8, false); }   // reserve format areas
  for (let i = 0; i < 8; i++) { set(8, size - 1 - i, false); set(size - 1 - i, 8, false); }

  // ---- place data (zig-zag), then mask
  const dataBits: number[] = []; out.forEach(b => put2(b)); function put2(b: number) { for (let i = 7; i >= 0; i--) dataBits.push((b >>> i) & 1); }
  const place = (mask: number) => {
    const g = m.map(r => r.slice()); let k = 0, up = true;
    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (let i = 0; i < size; i++) { const r = up ? size - 1 - i : i;
        for (let dc = 0; dc < 2; dc++) { const c = col - dc; if (fn[r][c]) continue; let v = k < dataBits.length ? dataBits[k++] === 1 : false;
          const hit = [(r + c) % 2 === 0, r % 2 === 0, c % 3 === 0, (r + c) % 3 === 0, (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, ((r * c) % 2) + ((r * c) % 3) === 0, (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (((r + c) % 2) + ((r * c) % 3)) % 2 === 0][mask];
          g[r][c] = hit ? !v : v; } }
      up = !up;
    }
    // format info (ECC M = 00)
    let f = mask; let rem = f; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537); const fmt = ((f << 10) | (rem & 0x3ff)) ^ 0x5412;
    const bit = (i: number) => ((fmt >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) g[i][8] = bit(i); g[7][8] = bit(6); g[8][8] = bit(7); g[8][7] = bit(8); for (let i = 9; i < 15; i++) g[8][14 - i] = bit(i);
    for (let i = 0; i < 8; i++) g[8][size - 1 - i] = bit(i); for (let i = 8; i < 15; i++) g[size - 15 + i][8] = bit(i);
    g[size - 8][8] = true;
    return g as boolean[][];
  };
  const penalty = (g: boolean[][]) => {
    let p = 0;
    for (let a = 0; a < 2; a++) for (let i = 0; i < size; i++) { let run = 1; for (let j = 1; j < size; j++) { const x = a ? g[j][i] : g[i][j], y = a ? g[j - 1][i] : g[i][j - 1]; if (x === y) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1; } }
    for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) if (g[r][c] === g[r][c + 1] && g[r][c] === g[r + 1][c] && g[r][c] === g[r + 1][c + 1]) p += 3;
    const pat = [true, false, true, true, true, false, true, false, false, false, false], pr = [...pat].reverse();
    const hasPat = (get: (k: number) => boolean) => { let n = 0; for (let k = 0; k + 11 <= size; k++) { if (pat.every((v, t) => get(k + t) === v)) n++; if (pr.every((v, t) => get(k + t) === v)) n++; } return n; };
    for (let i = 0; i < size; i++) { p += 40 * hasPat(k => g[i][k]); p += 40 * hasPat(k => g[k][i]); }
    let dark = 0; for (const r of g) for (const v of r) if (v) dark++; p += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
    return p;
  };
  let best = place(0), bp = penalty(best);
  for (let k = 1; k < 8; k++) { const g = place(k), q = penalty(g); if (q < bp) { best = g; bp = q; } }
  return best;
}

// SVG fragment (rects merged per row) for embedding in a poster. `x`,`y` = top-left, `px` = overall size incl. 4-module quiet zone.
export function qrSvg(text: string, x: number, y: number, px: number, dark = "#0d2a4a", light = "#ffffff"): string {
  const g = qrMatrix(text), n = g.length, q = 4, u = px / (n + q * 2);
  let d = ""; for (let r = 0; r < n; r++) { let c = 0; while (c < n) { if (!g[r][c]) { c++; continue; } let e = c; while (e < n && g[r][e]) e++; d += `M${(x + (c + q) * u).toFixed(2)} ${(y + (r + q) * u).toFixed(2)}h${((e - c) * u).toFixed(2)}v${u.toFixed(2)}h${(-(e - c) * u).toFixed(2)}z`; c = e; } }
  return `<rect x="${x}" y="${y}" width="${px}" height="${px}" fill="${light}"/><path d="${d}" fill="${dark}"/>`;
}
