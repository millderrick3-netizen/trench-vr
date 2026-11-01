// Procedural canvas textures (no external image assets).
import * as THREE from 'three';

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

export function tileFbm(w, h, base, oct, seed) {
  const r = rng(seed); const out = new Float32Array(w * h); let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const P = base << o; const L = new Float32Array(P * P); for (let i = 0; i < L.length; i++) L[i] = r();
    for (let y = 0; y < h; y++) {
      const fy = y / h * P, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty), ya = (y0 % P) * P, yb = ((y0 + 1) % P) * P;
      for (let x = 0; x < w; x++) {
        const fx = x / w * P, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx), xa = x0 % P, xb = (x0 + 1) % P;
        const a = L[ya + xa], b = L[ya + xb], c = L[yb + xa], d = L[yb + xb];
        out[y * w + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
      }
    }
    tot += amp; amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= tot;
  return out;
}

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { repeat = true, srgb = true, mip = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (!mip) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
  return t;
}
function field(w, h, fn) {
  const c = cv(w, h), g = c.getContext('2d'); const id = g.createImageData(w, h); const d = id.data; const px = [0, 0, 0, 255];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    px[3] = 255; fn(x, y, px); const i = (y * w + x) * 4;
    d[i] = px[0]; d[i + 1] = px[1]; d[i + 2] = px[2]; d[i + 3] = px[3];
  }
  g.putImageData(id, 0, 0); return c;
}
const cl = (v) => v < 0 ? 0 : v > 255 ? 255 : v;

export function makeTextures() {
  const T = {};
  const r = rng(1234);
  { // mud
    const W = 256, n = tileFbm(W, W, 4, 5, 11), n2 = tileFbm(W, W, 3, 3, 12);
    T.mud = tex(field(W, W, (x, y, p) => {
      const i = y * W + x; let v = n[i]; const wet = n2[i] < 0.42 ? 0.72 : 1;
      const gr = (r() - 0.5) * 18;
      p[0] = cl((58 + v * 62) * wet + gr); p[1] = cl((48 + v * 52) * wet + gr); p[2] = cl((36 + v * 36) * wet + gr * 0.8);
    }));
  }
  { // planks (1m x 1m, 6 boards)
    const W = 256, n = tileFbm(W, W, 8, 4, 21);
    const boards = []; for (let b = 0; b < 6; b++) boards.push([0.75 + r() * 0.4, r() * 6.28]);
    T.planks = tex(field(W, W, (x, y, p) => {
      const b = Math.floor(y / (W / 6)), by = (y % (W / 6)) / (W / 6), [bc, ph] = boards[b];
      let v = bc * (0.82 + 0.18 * Math.sin(x * 0.07 + n[y * W + x] * 14 + ph)) * (0.8 + 0.3 * n[((y * 7) % W) * W + x]);
      if (by < 0.06 || by > 0.95) v *= 0.35;
      const joint = (x + b * 61) % 128; if (joint < 2) v *= 0.4;
      if ((joint > 4 && joint < 8) && Math.abs(by - 0.5) < 0.05) v *= 0.3; // nails
      const g = (r() - 0.5) * 10;
      p[0] = cl(86 * v + g); p[1] = cl(70 * v + g); p[2] = cl(50 * v + g);
    }));
  }
  { // burlap
    const W = 128, n = tileFbm(W, W, 4, 3, 31);
    T.burlap = tex(field(W, W, (x, y, p) => {
      const wv = ((x >> 1) & 1) ^ ((y >> 1) & 1); const v = (0.78 + wv * 0.12 + (n[y * W + x] - 0.5) * 0.5) * (0.92 + r() * 0.12);
      p[0] = cl(120 * v); p[1] = cl(108 * v); p[2] = cl(82 * v);
    }));
  }
  { // clouds (equirect-ish strip)
    const W = 512, H = 256, n = tileFbm(W, H, 4, 6, 41);
    T.clouds = tex(field(W, H, (x, y, p) => { const v = 120 + n[y * W + x] * 135; p[0] = p[1] = p[2] = cl(v); }), { srgb: false });
  }
  { // soft smoke puff
    const W = 64, n = tileFbm(W, W, 4, 3, 51);
    T.puff = tex(field(W, W, (x, y, p) => {
      const dx = x / W - 0.5, dy = y / W - 0.5, d = Math.sqrt(dx * dx + dy * dy) * 2;
      const a = Math.max(0, 1 - d) ** 1.5 * (0.55 + 0.6 * n[y * W + x]);
      p[0] = p[1] = p[2] = 255; p[3] = cl(a * 255);
    }), { repeat: false });
  }
  { // glow
    T.glow = tex(field(64, 64, (x, y, p) => {
      const dx = x / 64 - 0.5, dy = y / 64 - 0.5, d = Math.sqrt(dx * dx + dy * dy) * 2;
      const a = Math.max(0, 1 - d) ** 2; p[0] = p[1] = p[2] = 255; p[3] = cl(a * 255);
    }), { repeat: false });
  }
  { // muzzle flash star
    T.flash = tex(field(128, 128, (x, y, p) => {
      const dx = x / 128 - 0.5, dy = y / 128 - 0.5, d = Math.sqrt(dx * dx + dy * dy) * 2, a0 = Math.atan2(dy, dx);
      const spikes = Math.pow(Math.abs(Math.cos(a0 * 3)), 8) * Math.max(0, 1 - d);
      const a = Math.min(1, Math.max(0, 1 - d * 2.2) + spikes * 0.9);
      p[0] = 255; p[1] = cl(200 + 55 * (1 - d)); p[2] = cl(120 * (1 - d)); p[3] = cl(a * 255);
    }), { repeat: false });
  }
  { // red dot reticle
    T.dot = tex(field(64, 64, (x, y, p) => {
      const dx = x / 64 - 0.5, dy = y / 64 - 0.5, d = Math.sqrt(dx * dx + dy * dy) * 2;
      const a = Math.max(0, 1 - d * 1.6) ** 1.2; p[0] = 255; p[1] = 40; p[2] = 30; p[3] = cl(a * 255);
    }), { repeat: false });
  }
  { // holographic ring + dot (68 MOA ring, 1 MOA dot scaled up for visibility)
    const W = 256;
    T.holo = tex(field(W, W, (x, y, p) => {
      const dx = x / W - 0.5, dy = y / W - 0.5, d = Math.sqrt(dx * dx + dy * dy) * 2;
      let a = Math.max(0, 1 - Math.abs(d - 0.9) * 28); a = Math.max(a, Math.max(0, 1 - d * 22));
      // tick marks
      if (d > 0.78 && d < 0.84 && (Math.abs(dx) < 0.006 || Math.abs(dy) < 0.006)) a = 1;
      p[0] = 255; p[1] = 50; p[2] = 40; p[3] = cl(a * 255);
    }), { repeat: false });
  }
  { // camo net (alpha tested)
    const W = 256, n = tileFbm(W, W, 8, 3, 61), n2 = tileFbm(W, W, 4, 2, 62);
    T.net = tex(field(W, W, (x, y, p) => {
      const v = n[y * W + x]; const mesh = ((x % 16) < 2) || ((y % 16) < 2);
      const leaf = v > 0.5; const c = n2[y * W + x] > 0.5 ? [70, 72, 44] : [92, 80, 56];
      p[0] = c[0]; p[1] = c[1]; p[2] = c[2]; p[3] = (leaf || mesh) ? 255 : 0;
    }));
  }
  { // vest/uniform camo (muted multicam-ish)
    const W = 128, a = tileFbm(W, W, 4, 3, 71), b = tileFbm(W, W, 8, 2, 72);
    T.camo = tex(field(W, W, (x, y, p) => {
      const i = y * W + x; let c = [104, 98, 74];
      if (a[i] > 0.55) c = [78, 80, 56]; if (b[i] > 0.62) c = [62, 54, 40]; if (a[i] < 0.3) c = [124, 114, 88];
      p[0] = c[0]; p[1] = c[1]; p[2] = c[2];
    }));
  }
  return T;
}
