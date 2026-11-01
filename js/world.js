// World: terrain heightfield, trench polylines with revetments, sandbags, dugout, craters, treelines, props.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './textures.js';

export const D = 1.25;        // trench depth (floor -> wall top)
export const HW = 0.75;       // half width of trench
export const TOPW = 2.6;      // width of wall-top band
export const PARA = 0.30;     // sandbag parapet height

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function hash(ix, iz) { let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vnoise(x, z) { const ix = Math.floor(x), iz = Math.floor(z); let fx = x - ix, fz = z - iz; fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz); const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1); return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz; }
export const rise = (z) => (z < -40 ? Math.min(0.8, (-40 - z) * 0.008) : 0) + (z < -125 ? (-125 - z) * 0.06 : 0) + (z > 42 ? (z - 42) * 0.05 : 0);

export class Polyline {
  constructor(pts, floorY = 0) {
    this.pts = pts; this.floorY = floorY; this.cum = [0]; this.dirs = []; this.lens = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const dx = pts[i + 1][0] - pts[i][0], dz = pts[i + 1][1] - pts[i][1], l = Math.hypot(dx, dz);
      this.lens.push(l); this.dirs.push([dx / l, dz / l]); this.cum.push(this.cum[i] + l);
    }
    this.L = this.cum[this.cum.length - 1];
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
    this.bb = [x0, x1, z0, z1];
  }
  closest(x, z, o) {
    let best = 1e18, bi = 0, bt = 0;
    for (let i = 0; i < this.lens.length; i++) {
      const a = this.pts[i], d = this.dirs[i]; let t = (x - a[0]) * d[0] + (z - a[1]) * d[1];
      if (t < 0) t = 0; else if (t > this.lens[i]) t = this.lens[i];
      const px = a[0] + d[0] * t - x, pz = a[1] + d[1] * t - z, d2 = px * px + pz * pz;
      if (d2 < best) { best = d2; bi = i; bt = t; }
    }
    const a = this.pts[bi], d = this.dirs[bi];
    o.d = Math.sqrt(best); o.i = bi; o.s = this.cum[bi] + bt; o.px = a[0] + d[0] * bt; o.pz = a[1] + d[1] * bt;
    o.end = (bi === 0 && bt <= 0) || (bi === this.lens.length - 1 && bt >= this.lens[bi]);
    return o;
  }
  pointAt(s, o) {
    s = Math.max(0, Math.min(this.L, s)); let i = 0; while (i < this.lens.length - 1 && this.cum[i + 1] < s) i++;
    const t = s - this.cum[i], a = this.pts[i], d = this.dirs[i];
    o.x = a[0] + d[0] * t; o.z = a[1] + d[1] * t; o.dx = d[0]; o.dz = d[1]; o.i = i; return o;
  }
  offset(off, ext) {
    const n = this.pts.length, P = this.pts, Dd = this.dirs, res = [];
    for (let i = 0; i < n; i++) {
      if (i === 0 || i === n - 1) {
        const d = Dd[i === 0 ? 0 : n - 2], sg = i === 0 ? -1 : 1;
        res.push([P[i][0] - d[1] * off + d[0] * ext * sg, P[i][1] + d[0] * off + d[1] * ext * sg]); continue;
      }
      const a = Dd[i - 1], b = Dd[i]; let mx = -a[1] - b[1], mz = a[0] + b[0]; const ml = Math.hypot(mx, mz); mx /= ml; mz /= ml;
      const dot = mx * -a[1] + mz * a[0];
      res.push([P[i][0] + mx * off / dot, P[i][1] + mz * off / dot]);
    }
    return res;
  }
}

// --- simple geometry accumulator with vertex colors ---
class GeoBuilder {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; }
  quad(a, b, c, d, nrm, uvs, cols) { // a,b,c,d: [x,y,z] in CCW order seen from front (nrm)
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
    let V = [a, b, c, d], U = uvs, C = cols;
    if (cx * nrm[0] + cy * nrm[1] + cz * nrm[2] < 0) { V = [a, d, c, b]; U = [uvs[0], uvs[3], uvs[2], uvs[1]]; C = [cols[0], cols[3], cols[2], cols[1]]; }
    for (const k of [0, 1, 2, 0, 2, 3]) { this.p.push(...V[k]); this.n.push(...nrm); this.uv.push(...U[k]); this.c.push(C[k], C[k], C[k]); }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere(); return g;
  }
}

function colorize(geo, col) {
  const g = geo.index ? geo.toNonIndexed() : geo; const n = g.attributes.position.count; const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2)); return g;
}
export function part(geo, hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  const g = colorize(geo.clone(), new THREE.Color(hex)); g.applyMatrix4(m); return g;
}
export const merge = (arr) => mergeGeometries(arr, false);

export class World {
  constructor(scene, T) {
    this.scene = scene; this.T = T; this.R = rng(777);
    const R = this.R;
    // trench layouts
    this.main = new Polyline([[-4, 0], [6, 0], [13, -3.5], [21, -1], [28, -5], [36, -2.5], [43, -6.5], [51, -4], [58, -8], [66, -5.5], [74, -9], [82, -7]], 0);
    const ep = []; for (let x = -45; x <= 115; x += 10) ep.push([x, -84 + (Math.floor(x / 10) % 2 ? 2.2 : -1.2) + (R() - 0.5)]);
    this.enemyT = new Polyline(ep, rise(-84));
    this.trenches = [this.main, this.enemyT];
    this.roofS = 7.5; // main trench s < roofS is a covered dugout
    this.mat = {
      mud: new THREE.MeshLambertMaterial({ map: T.mud, vertexColors: true }),
      planks: new THREE.MeshLambertMaterial({ map: T.planks, vertexColors: true }),
      burlap: new THREE.MeshLambertMaterial({ map: T.burlap, vertexColors: true }),
      flat: new THREE.MeshLambertMaterial({ vertexColors: true }),
    };
    this.buildCraters();
    this.buildGrid();
    this.buildTerrainMesh();
    for (const t of this.trenches) this.buildTrench(t, t === this.main);
    this.buildDugout();
    this.buildProps();
    this.buildTrees();
    this.buildSky();
  }

  // -------- heightfield --------
  buildCraters() {
    const R = this.R, cr = []; const tmp = {};
    const tryAdd = (x, z, r) => {
      for (const t of this.trenches) { t.closest(x, z, tmp); if (tmp.d < r + 3.5) return; }
      for (const c of cr) if (Math.hypot(c.x - x, c.z - z) < (c.r + r) * 0.8) return;
      cr.push({ x, z, r, depth: r * (0.28 + R() * 0.1) });
    };
    for (let k = 0; k < 400 && cr.length < 70; k++) {
      const big = R() < 0.25; const r = big ? 2.6 + R() * 2.4 : 1.0 + R() * 1.6;
      const zone = R(); let z;
      if (zone < 0.75) z = -78 + R() * 70; else if (zone < 0.88) z = -110 + R() * 20; else z = 6 + R() * 30;
      tryAdd(-40 + R() * 150, z, r);
    }
    this.craters = cr;
  }
  buildGrid() {
    const RES = 0.25, X0 = -60, Z0 = -170, NX = 801, NZ = 921;
    Object.assign(this, { RES, X0, Z0, NX, NZ });
    const N = NX * NZ; this.ROOF = 2.02; const hb = new Float32Array(N), dT = new Float32Array(N).fill(12), tf = new Int8Array(N).fill(-1), endf = new Uint8Array(N);
    const tmp = {};
    this.trenches.forEach((t, ti) => {
      const [x0, x1, z0, z1] = t.bb; const E = 12;
      const i0 = Math.max(0, Math.floor((x0 - E - X0) / RES)), i1 = Math.min(NX - 1, Math.ceil((x1 + E - X0) / RES));
      const j0 = Math.max(0, Math.floor((z0 - E - Z0) / RES)), j1 = Math.min(NZ - 1, Math.ceil((z1 + E - Z0) / RES));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        t.closest(X0 + i * RES, Z0 + j * RES, tmp); const k = j * NX + i;
        if (tmp.d < dT[k]) { dT[k] = tmp.d; tf[k] = ti; endf[k] = tmp.end ? 1 : 0; }
      }
    });
    for (let j = 0; j < NZ; j++) {
      const z = Z0 + j * RES, rz = rise(z);
      for (let i = 0; i < NX; i++) {
        const x = X0 + i * RES, k = j * NX + i; const amp = smooth(HW + TOPW, HW + 9, dT[k]);
        hb[k] = D + rz + amp * ((vnoise(x * 0.11, z * 0.11) - 0.5) * 0.7 + (vnoise(x * 0.37 + 17, z * 0.37 - 9) - 0.5) * 0.22);
      }
    }
    for (const c of this.craters) {
      const ext = c.r * 1.5; const i0 = Math.floor((c.x - ext - X0) / RES), i1 = Math.ceil((c.x + ext - X0) / RES), j0 = Math.floor((c.z - ext - Z0) / RES), j1 = Math.ceil((c.z + ext - Z0) / RES);
      for (let j = Math.max(0, j0); j <= Math.min(NZ - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(NX - 1, i1); i++) {
        const rn = Math.hypot(X0 + i * RES - c.x, Z0 + j * RES - c.z) / c.r;
        hb[j * NX + i] += -c.depth * Math.max(0, 1 - rn * rn) + c.depth * 0.3 * Math.exp(-(((rn - 1) / 0.25) ** 2));
      }
      c.y = this.sampleArr(hb, c.x, c.z);
    }
    const H = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      const ti = tf[k]; if (ti < 0) { H[k] = hb[k]; continue; }
      const f = this.trenches[ti].floorY, d = dT[k];
      if (d < HW) H[k] = f; else if (d < HW + 0.6 && !endf[k]) H[k] = f + D + PARA; else if (d < HW + TOPW) H[k] = f + D; else H[k] = hb[k];
    }
    // dugout: sandbag walls up to the raised roof
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const k = j * NX + i, x = X0 + i * RES; if (tf[k] === 0 && x < 3.6 && x > -5.6 && dT[k] >= HW && dT[k] < HW + 0.7) H[k] = this.ROOF + 0.4; }
    this.hb = hb; this.dT = dT; this.tf = tf; this.Hg = H;
  }
  sampleArr(A, x, z) {
    let fx = (x - this.X0) / this.RES, fz = (z - this.Z0) / this.RES;
    if (fx < 0) fx = 0; if (fz < 0) fz = 0; if (fx > this.NX - 1.001) fx = this.NX - 1.001; if (fz > this.NZ - 1.001) fz = this.NZ - 1.001;
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, k = j * this.NX + i;
    const a = A[k], b = A[k + 1], c = A[k + this.NX], d = A[k + this.NX + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }
  H(x, z) { return this.sampleArr(this.Hg, x, z); }
  Hn(x, z) { // nearest (keeps wall steps sharp)
    let i = Math.round((x - this.X0) / this.RES), j = Math.round((z - this.Z0) / this.RES);
    if (i < 0) i = 0; if (j < 0) j = 0; if (i >= this.NX) i = this.NX - 1; if (j >= this.NZ) j = this.NZ - 1;
    return this.Hg[j * this.NX + i];
  }
  inDugout(x, z, tmp = {}) { this.main.closest(x, z, tmp); return tmp.s < this.roofS && tmp.d < HW + 0.7; }
  blockedAt(x, y, z) {
    if (y < this.Hn(x, z)) return true;
    if (y > this.ROOF - 0.08 && y < this.ROOF + 0.5 && x < 3.6 && x > -5 && Math.abs(z) < HW + 0.7) return true; // dugout roof
    return false;
  }
  los(a, b, skipA = 0.4, skipB = 0.4) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const step = 0.3, n = Math.floor((L - skipA - skipB) / step);
    for (let k = 0; k <= n; k++) {
      const t = (skipA + k * step) / L; if (this.blockedAt(a.x + dx * t, a.y + dy * t, a.z + dz * t)) return false;
    }
    return true;
  }
  constrainPlayer(p, r = 0.22) { // keep head xz inside the main trench
    const o = this.main.closest(p.x, p.z, this._c || (this._c = {}));
    const lim = HW - r;
    if (o.d > lim) { const k = lim / o.d; p.x = o.px + (p.x - o.px) * k; p.z = o.pz + (p.z - o.pz) * k; return true; }
    return false;
  }
  inTrench(x, z, r = 0.25) { const o = this.main.closest(x, z, this._c2 || (this._c2 = {})); return o.d < HW - r; }

  buildTerrainMesh() {
    const X0 = -60, Z0 = -170, W = 200, Hh = 230, S = 1; const nx = W / S + 1, nz = Hh / S + 1;
    const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
    const c1 = new THREE.Color(0x6e5c46), c2 = new THREE.Color(0x6c6a48), c3 = new THREE.Color(0x4e4234);
    const cc = new THREE.Color();
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = X0 + i * S, z = Z0 + j * S, k = j * nx + i;
      const gi = Math.round((x - this.X0) / this.RES), gj = Math.round((z - this.Z0) / this.RES), gk = gj * this.NX + gi;
      const d = this.dT[gk], ti = this.tf[gk]; let y = this.hb[gk];
      if (ti >= 0) { const f = this.trenches[ti].floorY; if (d < HW + 1.0) y = f - 0.6; else if (d < HW + TOPW) y = f + D - 0.12; }
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z; uv[k * 2] = x / 4; uv[k * 2 + 1] = z / 4;
      const n = vnoise(x * 0.07 + 3, z * 0.07), n2 = vnoise(x * 0.3, z * 0.3);
      cc.copy(c1).lerp(c2, smooth(0.5, 0.75, n) * smooth(HW + 4, HW + 14, d));
      cc.lerp(c3, (1 - smooth(HW + 2, HW + 7, d)) * 0.6 + (n2 < 0.3 ? 0.3 : 0));
      const shade = 0.85 + 0.3 * n2 - Math.max(0, (this.sampleArr(this.hb, x, z) - (D + rise(z)))) * -0.0; // keep simple
      let cav = 1; const hh = this.hb[gk] - (D + rise(z)); if (hh < -0.15) cav = Math.max(0.55, 1 + hh * 0.45);
      col[k * 3] = cc.r * shade * cav; col[k * 3 + 1] = cc.g * shade * cav; col[k * 3 + 2] = cc.b * shade * cav;
    }
    const idx = [];
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, this.mat.mud); m.matrixAutoUpdate = false; this.scene.add(m); this.terrain = m;
    // puddles in deep craters
    const deep = this.craters.filter(c => c.depth > 0.75);
    const pm = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3a3d3a }), deep.length);
    const M = new THREE.Matrix4();
    deep.forEach((c, i) => { const r = c.r * 0.42; M.makeScale(r, 1, r).setPosition(c.x, c.y + c.depth * 0.18, c.z); pm.setMatrixAt(i, M); });
    this.scene.add(pm);
  }

  buildTrench(t, isMain) {
    const f = t.floorY, top = f + D; const G = new GeoBuilder(), Gt = new GeoBuilder();
    const dark = (x, z) => { if (!isMain) return 1; const o = t.closest(x, z, {}); return o.s < this.roofS - 0.5 ? 0.42 : o.s < this.roofS + 1.5 ? 0.42 + (o.s - this.roofS + 0.5) / 2 * 0.58 : 1; };
    for (const side of [1, -1]) {
      const inn = t.offset(side * HW, HW), out = t.offset(side * (HW + TOPW), HW);
      let u = 0;
      for (let i = 0; i < inn.length - 1; i++) {
        const a = inn[i], b = inn[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const d = t.dirs[i]; const nin = [d[1] * side, 0, -d[0] * side]; // toward trench center
        const da = dark(a[0], a[1]), db = dark(b[0], b[1]);
        G.quad([a[0], f, a[1]], [b[0], f, b[1]], [b[0], top, b[1]], [a[0], top, a[1]], nin, [[u, 0], [u + l, 0], [u + l, D], [u, D]], [0.5 * da, 0.5 * db, 1.0 * db, 1.0 * da]);
        u += l;
        const oa = out[i], ob = out[i + 1];
        Gt.quad([a[0], top, a[1]], [b[0], top, b[1]], [ob[0], top, ob[1]], [oa[0], top, oa[1]], [0, 1, 0], [[a[0] / 4, a[1] / 4], [b[0] / 4, b[1] / 4], [ob[0] / 4, ob[1] / 4], [oa[0] / 4, oa[1] / 4]], [0.8, 0.8, 0.95, 0.95]);
        Gt.quad([oa[0], top, oa[1]], [ob[0], top, ob[1]], [ob[0], f - 0.6, ob[1]], [oa[0], f - 0.6, oa[1]], [-nin[0], 0, -nin[2]], [[0, 0], [1, 0], [1, 1], [0, 1]], [0.8, 0.8, 0.6, 0.6]);
      }
    }
    // floor
    const L = t.offset(HW, HW), Rr = t.offset(-HW, HW);
    for (let i = 0; i < L.length - 1; i++) {
      const a = L[i], b = L[i + 1], c = Rr[i + 1], d = Rr[i]; const k1 = dark(a[0], a[1]), k2 = dark(b[0], b[1]);
      G.quad([a[0], f, a[1]], [b[0], f, b[1]], [c[0], f, c[1]], [d[0], f, d[1]], [0, 1, 0], [[a[0] / 2, a[1] / 2], [b[0] / 2, b[1] / 2], [c[0] / 2, c[1] / 2], [d[0] / 2, d[1] / 2]], [0.45 * k1, 0.45 * k2, 0.45 * k2, 0.45 * k1]);
    }
    // end caps
    const P = t.pts, n = P.length;
    for (const end of [0, 1]) {
      const iL = end ? L[n - 1] : L[0], iR = end ? Rr[n - 1] : Rr[0];
      const d = end ? t.dirs[n - 2] : t.dirs[0], sg = end ? 1 : -1; const nrm = [-d[0] * sg, 0, -d[1] * sg];
      const k = isMain && !end ? 0.42 : 1;
      G.quad([iL[0], f, iL[1]], [iR[0], f, iR[1]], [iR[0], top, iR[1]], [iL[0], top, iL[1]], nrm, [[0, 0], [1.5, 0], [1.5, D], [0, D]], [0.5 * k, 0.5 * k, k, k]);
      const oL = t.offset(HW + TOPW, HW), oR = t.offset(-(HW + TOPW), HW); const a = end ? oL[n - 1] : oL[0], b = end ? oR[n - 1] : oR[0];
      const ex = d[0] * sg * TOPW, ez = d[1] * sg * TOPW;
      Gt.quad([a[0], top, a[1]], [b[0], top, b[1]], [b[0] + ex, top, b[1] + ez], [a[0] + ex, top, a[1] + ez], [0, 1, 0], [[a[0] / 4, a[1] / 4], [b[0] / 4, b[1] / 4], [(b[0] + ex) / 4, (b[1] + ez) / 4], [(a[0] + ex) / 4, (a[1] + ez) / 4]], [0.9, 0.9, 0.9, 0.9]);
      Gt.quad([a[0] + ex, top, a[1] + ez], [b[0] + ex, top, b[1] + ez], [b[0] + ex, f - 0.6, b[1] + ez], [a[0] + ex, f - 0.6, a[1] + ez], [d[0] * sg, 0, d[1] * sg], [[0, 0], [1, 0], [1, 1], [0, 1]], [0.7, 0.7, 0.6, 0.6]);
    }
    const wm = new THREE.Mesh(G.build(), this.mat.planks); const tm = new THREE.Mesh(Gt.build(), this.mat.mud);
    wm.matrixAutoUpdate = tm.matrixAutoUpdate = false; this.scene.add(wm, tm);
    // sandbags along both edges, posts, duckboards
    const R = this.R; const bags = this.bagList || (this.bagList = []); const wood = this.woodList || (this.woodList = []);
    for (const side of [1, -1]) {
      const line = t.offset(side * (HW + 0.3), 0.4);
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i], b = line[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / l, dz = (b[1] - a[1]) / l, yaw = Math.atan2(dx, dz);
        for (let layer = 0; layer < 2; layer++) {
          const step = 0.47, off = layer ? step / 2 : 0;
          for (let s = off; s < l; s += step) {
            const x = a[0] + dx * s, z = a[1] + dz * s; let y = top + 0.075 + layer * 0.14;
            if (isMain && x < 3.7 && x > -5.5) { for (let h = 2; h < 6; h++) bags.push([x + (R() - 0.5) * 0.05, top + 0.075 + h * 0.14, z, yaw + Math.PI / 2 + (R() - 0.5) * 0.15, 0.95, R()]); }
            bags.push([x, y, z, yaw + Math.PI / 2 + (R() - 0.5) * 0.15, 0.9 + R() * 0.2, R()]);
          }
        }
      }
      const pl = t.offset(side * (HW - 0.05), 0);
      for (let i = 0; i < pl.length - 1; i++) {
        const a = pl[i], b = pl[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]), dx = (b[0] - a[0]) / l, dz = (b[1] - a[1]) / l;
        for (let s = 0.3; s < l; s += 1.6) wood.push([a[0] + dx * s, f + D / 2, a[1] + dz * s, Math.atan2(dx, dz), 0.1, D + 0.08, 0.1, 0.55]);
      }
    }
    if (isMain) {
      for (let s = 0.2; s < t.L; s += 0.34) {
        const o = t.pointAt(s, {}); const yaw = Math.atan2(o.dx, o.dz);
        wood.push([o.x, f + 0.085, o.z, yaw, 1.05, 0.03, 0.11, 0.8 + R() * 0.3]);
      }
      for (let i = 0; i < t.lens.length; i++) {
        const a = t.pts[i], d = t.dirs[i], l = t.lens[i];
        for (const lat of [-0.42, 0.42]) wood.push([a[0] + d[0] * l / 2 - d[1] * lat, f + 0.035, a[1] + d[1] * l / 2 + d[0] * lat, Math.atan2(d[0], d[1]), 0.07, 0.07, l, 0.6]);
      }
    }
  }
  buildDugout() {
    const R = this.R; const top = this.ROOF - 0.07;
    // roof logs across the first segment (x from -4.75 to 3.5)
    const logs = []; for (let x = -4.7; x < 3.5; x += 0.17) logs.push([x, top + 0.07, (R() - 0.5) * 0.1]);
    const lg = new THREE.CylinderGeometry(0.085, 0.085, 2 * HW + 1.4, 7).rotateX(Math.PI / 2);
    const lm = new THREE.InstancedMesh(lg, new THREE.MeshLambertMaterial({ color: 0x4a3d2e }), logs.length);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(1, 1, 1), V = new THREE.Vector3();
    logs.forEach((l, i) => { Q.setFromEuler(new THREE.Euler(0, (R() - 0.5) * 0.06, 0)); M.compose(V.set(l[0], l[1], l[2]), Q, S); lm.setMatrixAt(i, M); lm.setColorAt(i, new THREE.Color().setScalar(0.75 + R() * 0.4)); });
    this.scene.add(lm);
    for (let x = -4.5; x < 3.4; x += 0.47) for (const z of [-0.45, 0, 0.45]) this.bagList.push([x + (R() - 0.5) * 0.1, top + 0.22, z, Math.PI / 2 + (R() - 0.5) * 0.2, 1, R()]);
    for (let x = -4.3; x < 3.3; x += 0.5) for (const z of [-0.22, 0.25]) this.bagList.push([x, top + 0.36, z, Math.PI / 2 + (R() - 0.5) * 0.3, 1, R()]);
    for (let x = -4.4; x < 3.5; x += 1.6) for (const z of [-HW + 0.06, HW - 0.06]) this.woodList.push([x, this.ROOF / 2, z, 0, 0.12, this.ROOF, 0.12, 0.6]);
    for (let x = -4.4; x < 3.5; x += 1.6) this.woodList.push([x, this.ROOF - 0.1, 0, 0, 0.14, 0.12, 2 * HW, 0.55]);
    // interior props: bench, table, ammo cans, lamp
    const W = this.woodList;
    W.push([-1.5, 0.45, 0.55, 0, 1.6, 0.05, 0.35, 0.8]);   // bench top
    W.push([-2.2, 0.22, 0.55, 0, 0.06, 0.44, 0.3, 0.6]); W.push([-0.8, 0.22, 0.55, 0, 0.06, 0.44, 0.3, 0.6]);
    W.push([-3.6, 0.75, -0.45, 0, 0.9, 0.05, 0.55, 0.9]);  // table
    W.push([-3.95, 0.37, -0.45, 0, 0.06, 0.74, 0.5, 0.6]); W.push([-3.25, 0.37, -0.45, 0, 0.06, 0.74, 0.5, 0.6]);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd9a0 })); lamp.position.set(-1.2, this.ROOF - 0.25, 0); this.scene.add(lamp);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.T.glow, color: 0xffb060, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    glow.scale.setScalar(0.5); glow.position.copy(lamp.position); this.scene.add(glow);
  }
  buildProps() {
    const R = this.R;
    // resupply crates
    const crateG = merge([
      part(new THREE.BoxGeometry(0.8, 0.42, 0.45), 0x4b5236, 0, 0.21, 0),
      part(new THREE.BoxGeometry(0.82, 0.04, 0.47), 0x3c422b, 0, 0.43, 0),
      part(new THREE.BoxGeometry(0.06, 0.3, 0.47), 0x3a3f2a, -0.3, 0.2, 0), part(new THREE.BoxGeometry(0.06, 0.3, 0.47), 0x3a3f2a, 0.3, 0.2, 0),
      part(new THREE.BoxGeometry(0.3, 0.08, 0.005), 0xc8b860, 0, 0.3, 0.228),
    ]);
    const crateMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.crates = [];
    const o = {};
    for (const s of [2.2, 44]) {
      this.main.pointAt(s, o); const yaw = Math.atan2(o.dx, o.dz);
      const m = new THREE.Mesh(crateG, crateMat); const lat = 0.42; // against +side wall
      m.position.set(o.x - o.dz * lat, 0.02, o.z + o.dx * lat); m.rotation.y = yaw + Math.PI / 2; this.scene.add(m);
      this.crates.push(m);
    }
    // ammo cans in dugout
    const can = merge([part(new THREE.BoxGeometry(0.28, 0.18, 0.12), 0x47502f, 0, 0.09, 0), part(new THREE.BoxGeometry(0.1, 0.02, 0.03), 0x222, 0, 0.19, 0)]);
    for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(can, crateMat); m.position.set(-4.2 + i * 0.3, i === 3 ? 0.19 : 0.02, 0.45); m.rotation.y = (R() - 0.5) * 0.3; this.scene.add(m); }
    // barbed wire: posts + concertina
    const wire = []; let x = -12;
    while (x < 92) {
      const len = 6 + R() * 8; const z0 = -13.5 + (R() - 0.5) * 2;
      for (let s = 0; s < len; s += 0.22) {
        const xx = x + s, yb = this.H(xx, z0);
        for (let k = 0; k < 10; k++) {
          const a1 = k / 10 * Math.PI * 2, a2 = (k + 1) / 10 * Math.PI * 2; const r = 0.38;
          wire.push(xx + 0.22 * k / 10, yb + 0.4 + Math.sin(a1) * r, z0 + Math.cos(a1) * r, xx + 0.22 * (k + 1) / 10, yb + 0.4 + Math.sin(a2) * r, z0 + Math.cos(a2) * r);
        }
      }
      for (let s = 0; s < len; s += 3) this.woodList.push([x + s, this.H(x + s, z0) + 0.45, z0, R(), 0.06, 0.9, 0.06, 0.5]);
      x += len + 2 + R() * 6;
    }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    this.scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x3c3a36 })));
    // wrecked APC hulk (cover in no-man's land)
    const hx = 31, hz = -47, hy = this.H(hx, hz);
    const apc = merge([
      part(new THREE.BoxGeometry(2.8, 1.1, 6.5), 0x3b3a32, 0, 0.95, 0), part(new THREE.BoxGeometry(2.6, 0.6, 2.2), 0x37352d, 0, 1.6, 2.4, 0.5, 0, 0),
      part(new THREE.CylinderGeometry(0.55, 0.65, 0.4, 8), 0x2e2c27, 0.2, 1.7, -0.6, 0.3, 0, 0.4), part(new THREE.CylinderGeometry(0.05, 0.05, 2, 6), 0x2a2925, 0.4, 1.9, -1.6, 1.3, 0, 0),
      ...[-2.3, -0.8, 0.8, 2.3].flatMap(z => [part(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 10), 0x232220, 1.45, 0.45, z, 0, 0, Math.PI / 2), part(new THREE.CylinderGeometry(0.5, 0.5, 0.35, 10), 0x232220, -1.45, 0.4, z, 0, 0, Math.PI / 2)]),
      part(new THREE.BoxGeometry(2.9, 0.1, 1.5), 0x4a3a2a, 0, 1.52, -2.2, 0, 0, 0.1),
    ]);
    const apcm = new THREE.Mesh(apc, this.mat.flat); apcm.position.set(hx, hy - 0.25, hz); apcm.rotation.set(0.04, 0.6, 0.12); this.scene.add(apcm);
    this.apc = { x: hx, z: hz, y: hy };
    // camo net over a bay
    const ng = new THREE.PlaneGeometry(3.2, 7, 6, 10).rotateX(-Math.PI / 2); const np = ng.attributes.position;
    for (let i = 0; i < np.count; i++) { const px = np.getX(i), pz = np.getZ(i); np.setY(i, -0.35 * (1 - (px / 1.6) ** 2) * (0.6 + 0.4 * Math.cos(pz * 0.9)) + (R() - 0.5) * 0.06); }
    ng.computeVertexNormals();
    const net = new THREE.Mesh(ng, new THREE.MeshLambertMaterial({ map: this.T.net, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.main.pointAt(33, o); net.position.set(o.x, D + 0.95, o.z); net.rotation.y = Math.atan2(o.dx, o.dz); this.scene.add(net);
    for (const s of [30, 36]) for (const lat of [-1.3, 1.3]) { this.main.pointAt(s, o); this.woodList.push([o.x - o.dz * lat, D + 0.45, o.z + o.dx * lat, 0, 0.06, 0.9, 0.06, 0.5]); }
    // scattered debris boxes in the field
    for (let i = 0; i < 25; i++) { const x = -30 + R() * 130, z = -75 + R() * 65; this.woodList.push([x, this.H(x, z) + 0.08, z, R() * 6, 0.5 + R() * 0.6, 0.12 + R() * 0.15, 0.3 + R() * 0.3, 0.5]); }
    // finalize instanced sandbags + wood
    const bg = new THREE.BoxGeometry(0.46, 0.15, 0.28, 3, 1, 2); const bp = bg.attributes.position;
    for (let i = 0; i < bp.count; i++) { const px = bp.getX(i) / 0.23, pz = bp.getZ(i) / 0.14, py = bp.getY(i); bp.setY(i, py * (1 - 0.35 * px * px) * (1 - 0.25 * pz * pz)); bp.setZ(i, bp.getZ(i) * (1 - 0.15 * px * px)); }
    bg.computeVertexNormals();
    const B = this.bagList; const bm = new THREE.InstancedMesh(bg, new THREE.MeshLambertMaterial({ map: this.T.burlap }), B.length);
    const M = new THREE.Matrix4(), Qt = new THREE.Quaternion(), Sv = new THREE.Vector3(), V = new THREE.Vector3(), E = new THREE.Euler(), C = new THREE.Color();
    B.forEach((b, i) => { E.set((R() - 0.5) * 0.08, b[3], (R() - 0.5) * 0.08); Qt.setFromEuler(E); M.compose(V.set(b[0], b[1], b[2]), Qt, Sv.set(b[4], 1, 1)); bm.setMatrixAt(i, M); const k = b[5]; C.setRGB(0.8 + k * 0.25, 0.8 + k * 0.2, 0.7 + k * 0.15); if (k < 0.3) C.setRGB(0.68, 0.74, 0.55); bm.setColorAt(i, C); });
    this.scene.add(bm);
    const Wd = this.woodList; const wmsh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x6a5640 }), Wd.length);
    Wd.forEach((w, i) => { Qt.setFromEuler(E.set(0, w[3], 0)); M.compose(V.set(w[0], w[1], w[2]), Qt, Sv.set(w[4], w[5], w[6])); wmsh.setMatrixAt(i, M); C.setScalar(w[7] * (0.85 + R() * 0.3)); wmsh.setColorAt(i, C); });
    this.scene.add(wmsh);
  }
  buildTrees() {
    const R = this.R; const trunks = [], branches = [];
    const zone = (n, x0, x1, z0, z1) => { for (let i = 0; i < n; i++) trunks.push([x0 + R() * (x1 - x0), z0 + R() * (z1 - z0)]); };
    zone(90, -60, 140, -122, -98); zone(60, -60, 140, 22, 50); zone(6, -20, 100, -70, -20);
    const tg = new THREE.CylinderGeometry(0.6, 1, 1, 6, 2).translate(0, 0.5, 0); const tp = tg.attributes.position;
    for (let i = 0; i < tp.count; i++) if (tp.getY(i) > 0.99) { tp.setY(i, 1 + (R() - 0.5) * 0.25); }
    const bg = new THREE.CylinderGeometry(0.5, 1, 1, 4).translate(0, 0.5, 0);
    const tm = new THREE.InstancedMesh(tg, new THREE.MeshLambertMaterial({ color: 0x4a4339 }), trunks.length);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), V = new THREE.Vector3(), E = new THREE.Euler(), C = new THREE.Color();
    trunks.forEach((t, i) => {
      const h = R() < 0.35 ? 1 + R() * 2.5 : 4 + R() * 8, r = 0.12 + R() * 0.16; const y = this.H(t[0], t[1]) - 0.2;
      E.set((R() - 0.5) * 0.25, R() * 6, (R() - 0.5) * 0.25); Q.setFromEuler(E); M.compose(V.set(t[0], y, t[1]), Q, S.set(r, h, r)); tm.setMatrixAt(i, M);
      C.setScalar(0.7 + R() * 0.5); tm.setColorAt(i, C);
      const nb = h > 4 ? Math.floor(R() * 4) : 0;
      for (let k = 0; k < nb; k++) branches.push([t[0], y + h * (0.45 + R() * 0.45), t[1], R() * 6, 0.5 + R() * 0.6, 0.6 + R() * 2.2, r * 0.3]);
    });
    this.scene.add(tm);
    const bm = new THREE.InstancedMesh(bg, new THREE.MeshLambertMaterial({ color: 0x413a31 }), Math.max(1, branches.length));
    branches.forEach((b, i) => { E.set(b[4], b[3], 0, 'YXZ'); Q.setFromEuler(E); M.compose(V.set(b[0], b[1], b[2]), Q, S.set(b[6], b[5], b[6])); bm.setMatrixAt(i, M); });
    this.scene.add(bm);
  }
  buildSky() {
    const g = new THREE.SphereGeometry(380, 32, 16);
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.T.clouds }, fogColor: { value: this.scene.fog.color }, zen: { value: new THREE.Color(0x767b76) } },
      vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 fogColor; uniform vec3 zen; varying vec3 vD;
        void main(){ vec3 d = normalize(vD); float el = d.y;
          vec2 uv = vec2(atan(d.x, d.z)/6.2831853, el*1.2) ; float c = texture2D(map, uv*vec2(3.0,1.0)).r;
          float c2 = texture2D(map, uv*vec2(7.0,2.3)+vec2(0.3,0.1)).r;
          vec3 cloud = mix(zen*0.85, zen*1.25, c*0.7+c2*0.3);
          vec3 col = mix(fogColor, cloud, smoothstep(0.0, 0.38, el));
          gl_FragColor = vec4(col,1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(g, this.skyMat); this.sky.renderOrder = 5; this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }
}
