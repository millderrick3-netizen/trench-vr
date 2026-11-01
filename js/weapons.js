// Weapons: AR-platform rifle with modular attachments, sidearm, frag grenades, manual reload logic.
import * as THREE from 'three';
import { part, merge } from './world.js';

export const ATT = {
  optic: [
    { id: 'iron', name: 'Iron sights', desc: 'Flip-up irons. Light, no magnification.', h: 0.150, weight: 0 },
    { id: 'dot', name: 'Red dot (2 MOA)', desc: 'Fast tube sight. Parallax-free dot.', h: 0.162, weight: 0.1 },
    { id: 'holo', name: 'Holographic', desc: 'Ring + dot reticle, wide window.', h: 0.168, weight: 0.12 },
    { id: 'lpvo', name: 'LPVO 1-8x', desc: 'Variable scope. R-stick click / V cycles 1x 4x 8x.', h: 0.172, weight: 0.3 },
  ],
  muzzle: [
    { id: 'hider', name: 'Flash hider', desc: 'Standard. Moderate flash.', flash: 0.6, loud: 1, vr: 1, hr: 1, weight: 0 },
    { id: 'comp', name: 'Compensator', desc: 'Less muzzle climb, bigger flash, louder.', flash: 1.25, loud: 1.15, vr: 0.7, hr: 0.85, weight: 0.05 },
    { id: 'supp', name: 'Suppressor', desc: 'Much quieter, almost no flash, enemies spot you later. Heavier.', flash: 0.08, loud: 0.35, vr: 0.9, hr: 0.95, weight: 0.25 },
  ],
  under: [
    { id: 'none', name: 'Bare handguard', desc: 'No grip.', vr: 1, hr: 1, weight: 0 },
    { id: 'vfg', name: 'Vertical grip', desc: 'Big vertical recoil reduction.', vr: 0.78, hr: 0.92, weight: 0.1 },
    { id: 'afg', name: 'Angled grip', desc: 'Reduces side-to-side recoil, quick handling.', vr: 0.9, hr: 0.75, weight: 0.05 },
  ],
  side: [
    { id: 'none', name: 'Nothing', desc: 'Clean rail.', weight: 0 },
    { id: 'laser', name: 'IR/visible laser', desc: 'X / F toggles. Hip-fire aid.', weight: 0.05 },
    { id: 'light', name: 'Weapon light', desc: 'X / F toggles. Lights up the dugout.', weight: 0.08 },
  ],
};
export function rifleStats(lo) {
  const o = ATT.optic.find(a => a.id === lo.optic), m = ATT.muzzle.find(a => a.id === lo.muzzle), u = ATT.under.find(a => a.id === lo.under), s = ATT.side.find(a => a.id === lo.side);
  const weight = o.weight + m.weight + u.weight + s.weight;
  return { vr: m.vr * u.vr, hr: m.hr * u.hr, flash: m.flash, loud: m.loud, weight, sightH: o.h, optic: o.id, handling: 1 - weight * 0.6 };
}

const MUZ_Z = { hider: -0.635, comp: -0.64, supp: -0.78 };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function buildRifleParts(T) {
  const C = { blk: 0x26272a, dk: 0x1d1e20, fde: 0x8a7a5c, mt: 0x3a3b3e, od: 0x4a4e38 };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d), Cy = (r1, r2, l, n = 10) => new THREE.CylinderGeometry(r1, r2, l, n).rotateX(Math.PI / 2);
  const base = merge([
    part(B(0.03, 0.1, 0.042), C.blk, 0, -0.015, 0.005, -0.32), // pistol grip
    part(B(0.034, 0.055, 0.19), C.dk, 0, 0.05, -0.045), // lower
    part(B(0.012, 0.012, 0.05), C.blk, 0, 0.012, -0.02), // trigger guard
    part(B(0.032, 0.05, 0.075), C.dk, 0, 0.02, -0.105, 0.08), // magwell
    part(B(0.036, 0.045, 0.235), C.mt, 0, 0.1, -0.055), // upper
    part(B(0.022, 0.01, 0.62), C.blk, 0, 0.128, -0.17), // top rail (receiver + handguard)
    part(B(0.052, 0.058, 0.31), C.fde, 0, 0.096, -0.32), // handguard (FDE)
    part(B(0.012, 0.03, 0.3), C.blk, 0.028, 0.096, -0.32), part(B(0.012, 0.03, 0.3), C.blk, -0.028, 0.096, -0.32), // side rails
    part(B(0.02, 0.01, 0.3), C.blk, 0, 0.064, -0.32), // bottom rail
    part(Cy(0.0095, 0.0095, 0.14), C.blk, 0, 0.096, -0.535), // barrel
    part(Cy(0.016, 0.016, 0.2), C.blk, 0, 0.09, 0.15), // buffer tube
    part(B(0.04, 0.085, 0.12), C.od, 0, 0.072, 0.245), part(B(0.042, 0.11, 0.025), C.dk, 0, 0.06, 0.31), // stock + pad
    part(B(0.01, 0.022, 0.012), C.blk, 0.0, 0.135, -0.008), // ejection detail
  ]);
  const irons = merge([
    part(B(0.024, 0.02, 0.02), C.blk, 0, 0.142, 0.0), part(new THREE.TorusGeometry(0.006, 0.002, 4, 10), C.blk, 0, 0.152, 0.0),
    part(B(0.024, 0.016, 0.014), C.blk, 0, 0.141, -0.43), part(B(0.003, 0.014, 0.003), C.blk, 0, 0.151, -0.43),
    part(B(0.003, 0.02, 0.006), C.blk, 0.01, 0.15, -0.43), part(B(0.003, 0.02, 0.006), C.blk, -0.01, 0.15, -0.43),
  ]);
  const ironsFolded = merge([part(B(0.024, 0.008, 0.03), C.blk, 0, 0.137, 0.0), part(B(0.024, 0.008, 0.03), C.blk, 0, 0.137, -0.43)]);
  const dot = merge([
    part(B(0.026, 0.02, 0.05), C.blk, 0, 0.142, -0.12), part(Cy(0.017, 0.017, 0.075, 14), C.blk, 0, 0.162, -0.12),
    part(Cy(0.004, 0.004, 0.012), C.blk, 0.019, 0.164, -0.12).rotateY(0), part(B(0.012, 0.008, 0.015), C.blk, 0, 0.183, -0.12),
  ]);
  const holo = merge([
    part(B(0.042, 0.022, 0.1), C.blk, 0, 0.144, -0.09), part(B(0.006, 0.042, 0.06), C.blk, 0.022, 0.172, -0.08), part(B(0.006, 0.042, 0.06), C.blk, -0.022, 0.172, -0.08),
    part(B(0.05, 0.006, 0.06), C.blk, 0, 0.194, -0.08), part(B(0.034, 0.012, 0.012), C.dk, 0, 0.156, -0.13),
  ]);
  const lpvo = merge([
    part(B(0.024, 0.03, 0.12), C.blk, 0, 0.145, -0.07), part(Cy(0.016, 0.016, 0.02), C.blk, 0, 0.172, -0.01), part(Cy(0.016, 0.016, 0.02), C.blk, 0, 0.172, -0.14),
    part(Cy(0.0125, 0.0125, 0.2, 14), C.blk, 0, 0.172, -0.08), part(Cy(0.02, 0.016, 0.04, 14), C.blk, 0, 0.172, 0.035), part(Cy(0.024, 0.0125, 0.06, 14), C.blk, 0, 0.172, -0.2),
    part(Cy(0.0155, 0.0155, 0.012, 12), C.mt, 0, 0.172, 0.01), part(B(0.006, 0.006, 0.022), C.mt, 0.016, 0.172, 0.01), // mag ring + throw lever
    part(Cy(0.007, 0.007, 0.012), C.blk, 0, 0.19, -0.08), part(Cy(0.007, 0.007, 0.012), C.blk, 0.019, 0.172, -0.08),
  ]);
  const hider = merge([part(Cy(0.011, 0.011, 0.05, 8), C.blk, 0, 0.096, -0.61)]);
  const comp = merge([part(Cy(0.014, 0.014, 0.06, 8), C.blk, 0, 0.096, -0.61), part(B(0.03, 0.006, 0.008), C.dk, 0, 0.108, -0.6), part(B(0.03, 0.006, 0.008), C.dk, 0, 0.108, -0.62)]);
  const supp = merge([part(Cy(0.02, 0.02, 0.19, 14), C.od, 0, 0.096, -0.68), part(Cy(0.021, 0.021, 0.012, 14), C.blk, 0, 0.096, -0.59), part(Cy(0.019, 0.016, 0.01, 14), C.blk, 0, 0.096, -0.776)]);
  const vfg = merge([part(Cy(0.014, 0.012, 0.095, 10).rotateX(Math.PI / 2), C.blk, 0, 0.012, -0.36), part(B(0.02, 0.012, 0.04), C.blk, 0, 0.058, -0.36)]);
  const afg = merge([part(B(0.022, 0.03, 0.075), C.blk, 0, 0.05, -0.33, 0.55), part(B(0.02, 0.012, 0.06), C.blk, 0, 0.06, -0.33)]);
  const laser = merge([part(B(0.022, 0.024, 0.06), C.od, 0.042, 0.1, -0.4), part(Cy(0.004, 0.004, 0.006), 0x111111, 0.042, 0.105, -0.432), part(Cy(0.005, 0.005, 0.006), 0x111111, 0.042, 0.094, -0.432)]);
  const light = merge([part(Cy(0.013, 0.013, 0.09, 12), C.blk, 0.044, 0.1, -0.42), part(Cy(0.016, 0.013, 0.02, 12), C.blk, 0.044, 0.1, -0.47), part(B(0.012, 0.02, 0.03), C.blk, 0.033, 0.1, -0.41)]);
  const mag = merge([part(B(0.024, 0.11, 0.064), C.dk, 0, -0.055, 0, 0.06), part(B(0.024, 0.085, 0.06), C.dk, 0, -0.145, -0.012, 0.22), part(B(0.028, 0.012, 0.07), C.blk, 0, -0.19, -0.022, 0.22), part(B(0.012, 0.006, 0.05), 0xb08a40, 0, 0.002, 0)]);
  const ch = merge([part(B(0.01, 0.008, 0.06), C.blk, 0, 0, -0.02), part(B(0.05, 0.01, 0.012), C.blk, 0, 0, 0.012)]);
  return { base, irons, ironsFolded, dot, holo, lpvo, hider, comp, supp, vfg, afg, laser, light, mag, ch };
}
function buildPistolParts() {
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  return {
    frame: merge([part(B(0.028, 0.11, 0.045), 0x232426, 0, -0.03, 0.012, -0.3), part(B(0.028, 0.03, 0.17), 0x232426, 0, 0.04, -0.055), part(B(0.01, 0.01, 0.04), 0x1a1a1a, 0, 0.008, -0.03), part(B(0.006, 0.014, 0.008), 0x111, 0, 0.098, 0.035), part(B(0.003, 0.008, 0.004), 0x111, 0, 0.097, -0.135)]),
    slide: merge([part(B(0.026, 0.03, 0.19), 0x2c2d30, 0, 0.075, -0.06), part(new THREE.CylinderGeometry(0.006, 0.006, 0.01, 8).rotateX(Math.PI / 2), 0x0a0a0a, 0, 0.072, -0.156)]),
    mag: merge([part(B(0.022, 0.1, 0.035), 0x1d1e20, 0, -0.05, 0, 0), part(B(0.026, 0.01, 0.04), 0x111, 0, -0.1, 0)]),
  };
}

const ocularVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const ocularFS = `uniform sampler2D map; uniform vec2 eye; uniform float on; uniform float mag; varying vec2 vUv;
  void main(){ vec2 p = vUv*2.0-1.0; float r = length(p);
    vec3 c = on > 0.5 ? texture2D(map, vUv).rgb : vec3(0.02,0.025,0.03);
    float e = length(p - eye); float sh = 1.0 - smoothstep(0.55, 0.95, e); c *= sh * (1.0 - 0.35*smoothstep(0.7,1.0,r));
    float w = 0.012 + (r > 0.55 ? 0.03 : 0.0);
    float cross = (abs(p.x) < w && abs(p.y) > 0.06) || (abs(p.y) < w && abs(p.x) > 0.06) ? 1.0 : 0.0;
    if (mag < 1.5) cross *= step(0.6, r);
    float tick = abs(p.x) < 0.04 && abs(p.y+0.25) < 0.006 ? 1.0 : 0.0;
    c = mix(c, vec3(0.0), max(cross, tick) * 0.95);
    float d = smoothstep(0.035, 0.018, r); c = mix(c, vec3(1.0,0.12,0.05), d);
    if (r > 1.0) c = vec3(0.0);
    gl_FragColor = linearToOutputTexel(vec4(c,1.0)); }`;

export class Rifle {
  constructor(T) {
    this.T = T; const P = buildRifleParts(T); this.P = P;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true }); this.mat = mat;
    const g = this.group = new THREE.Group(); this.group.name = 'rifle';
    this.recoilNode = new THREE.Group(); g.add(this.recoilNode); const r = this.recoilNode;
    const add = (geo) => { const m = new THREE.Mesh(geo, mat); r.add(m); return m; };
    this.m = {}; for (const k of ['base', 'irons', 'ironsFolded', 'dot', 'holo', 'lpvo', 'hider', 'comp', 'supp', 'vfg', 'afg', 'laser', 'light']) this.m[k] = add(P[k]);
    this.magMesh = new THREE.Mesh(P.mag, mat); this.magMesh.position.set(0, 0.03, -0.1); r.add(this.magMesh);
    this.ch = new THREE.Mesh(P.ch, mat); this.ch.position.set(0, 0.118, 0.07); r.add(this.ch);
    // red dot lens + reticle (stencil masked)
    const lensMat = (op) => new THREE.MeshBasicMaterial({ color: 0x6a8a9a, transparent: true, opacity: op, depthWrite: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp });
    this.dotLens = new THREE.Mesh(new THREE.CircleGeometry(0.0145, 16), lensMat(0.12)); this.dotLens.position.set(0, 0.162, -0.083); this.dotLens.renderOrder = 50; r.add(this.dotLens);
    this.holoLens = new THREE.Mesh(new THREE.PlaneGeometry(0.036, 0.03), lensMat(0.1)); this.holoLens.position.set(0, 0.17, -0.07); this.holoLens.renderOrder = 50; r.add(this.holoLens);
    const retMat = (tex, s) => new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp });
    this.dotRet = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), retMat(T.dot)); this.dotRet.position.set(0, 0.162, -40); this.dotRet.renderOrder = 51; this.dotRet.frustumCulled = false; r.add(this.dotRet);
    this.holoRet = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95), retMat(T.holo)); this.holoRet.position.set(0, 0.168, -40); this.holoRet.renderOrder = 51; this.holoRet.frustumCulled = false; r.add(this.holoRet);
    // LPVO: ocular render-to-texture
    this.scopeRT = new THREE.WebGLRenderTarget(448, 448, { samples: 0 });
    this.scopeCam = new THREE.PerspectiveCamera(20, 1, 0.12, 900); this.scopeCam.position.set(0, 0.172, -0.235); r.add(this.scopeCam);
    this.ocMat = new THREE.ShaderMaterial({ uniforms: { map: { value: this.scopeRT.texture }, eye: { value: new THREE.Vector2() }, on: { value: 0 }, mag: { value: 1 } }, vertexShader: ocularVS, fragmentShader: ocularFS });
    this.ocular = new THREE.Mesh(new THREE.CircleGeometry(0.0175, 24), this.ocMat); this.ocular.position.set(0, 0.172, 0.0555); r.add(this.ocular);
    this.objLens = new THREE.Mesh(new THREE.CircleGeometry(0.022, 16).rotateY(Math.PI), new THREE.MeshBasicMaterial({ color: 0x0c1418 })); this.objLens.position.set(0, 0.172, -0.231); r.add(this.objLens);
    this.mags = [1, 4, 8]; this.magIdx = 0;
    // laser + light
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 1, 4).translate(0, 0.5, 0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff2a10, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.beam.position.set(0.042, 0.105, -0.435); r.add(this.beam);
    this.laserDot = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: 0xff3010, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, sizeAttenuation: true }));
    this.laserDot.scale.setScalar(0.05);
    this.spot = new THREE.SpotLight(0xfff2dd, 0, 45, 0.33, 0.5, 1.2); this.spot.position.set(0.044, 0.1, -0.48); this.spotTarget = new THREE.Object3D(); this.spotTarget.position.set(0.044, 0.1, -5); r.add(this.spot, this.spotTarget); this.spot.target = this.spotTarget;
    this.lightOn = false;
    // muzzle flash
    const fm = new THREE.MeshBasicMaterial({ map: T.flash, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false, color: 0xffc890 });
    const fg = merge([new THREE.PlaneGeometry(0.16, 0.16).translate(0, 0, 0), new THREE.PlaneGeometry(0.06, 0.2).rotateX(Math.PI / 2).translate(0, 0, -0.08), new THREE.PlaneGeometry(0.06, 0.2).rotateY(Math.PI / 2).rotateZ(Math.PI / 2).translate(0, 0, -0.08)].map(gg => { gg.deleteAttribute('normal'); return gg; }));
    this.flash = new THREE.Mesh(fg, fm); this.flash.visible = false; r.add(this.flash);
    // state
    this.cap = 30; this.magIn = true; this.rounds = 29; this.chambered = true; this.boltLocked = false;
    this.auto = true; this.rpm = 760; this.cool = 0;
    this.points = { grip: V(0, 0, 0), support: V(0, 0.07, -0.33), magwell: V(0, 0.03, -0.1), ch: V(0, 0.118, 0.085) };
    this.setLoadout({ optic: 'dot', muzzle: 'hider', under: 'vfg', side: 'light' });
  }
  setLoadout(lo) {
    this.lo = { ...lo }; this.stats = rifleStats(lo); const m = this.m;
    m.irons.visible = lo.optic === 'iron'; m.ironsFolded.visible = lo.optic !== 'iron';
    for (const k of ['dot', 'holo', 'lpvo']) m[k].visible = lo.optic === k;
    this.dotLens.visible = this.dotRet.visible = lo.optic === 'dot';
    this.holoLens.visible = this.holoRet.visible = lo.optic === 'holo';
    this.ocular.visible = this.objLens.visible = lo.optic === 'lpvo';
    for (const k of ['hider', 'comp', 'supp']) m[k].visible = lo.muzzle === k;
    m.vfg.visible = lo.under === 'vfg'; m.afg.visible = lo.under === 'afg';
    m.laser.visible = lo.side === 'laser'; m.light.visible = lo.side === 'light';
    if (lo.side === 'none') this.lightOn = false;
    this.points.support.set(0, lo.under === 'vfg' ? 0.015 : 0.065, lo.under === 'vfg' ? -0.36 : -0.33);
    this.muzzleZ = MUZ_Z[lo.muzzle]; this.flash.position.set(0, 0.096, this.muzzleZ);
    const s = this.stats.flash; this.flash.scale.set(s, s, s * (lo.muzzle === 'comp' ? 0.6 : 1));
    // launch direction zeroed at 100 m for this sight height (v=880 m/s)
    const Z0 = 100, drop = 0.5 * 9.81 * (Z0 / 880) ** 2;
    this.launch = new THREE.Vector3(0, this.stats.sightH + drop - 0.096, -(Z0 + this.muzzleZ)).normalize();
    this.refreshSide();
  }
  refreshSide() {
    const lo = this.lo; this.beam.visible = lo.side === 'laser' && this.lightOn; this.laserDot.visible = this.beam.visible;
    this.spot.intensity = lo.side === 'light' && this.lightOn ? 30 : 0;
  }
  toggleSide() { if (this.lo.side === 'none') return false; this.lightOn = !this.lightOn; this.refreshSide(); return true; }
  cycleMag() { if (this.lo.optic !== 'lpvo') return false; this.magIdx = (this.magIdx + 1) % 3; return true; }
}

export class Pistol {
  constructor() {
    const P = buildPistolParts(); const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.group = new THREE.Group(); this.recoilNode = new THREE.Group(); this.group.add(this.recoilNode);
    this.recoilNode.add(new THREE.Mesh(P.frame, mat)); this.slide = new THREE.Mesh(P.slide, mat); this.recoilNode.add(this.slide);
    this.magMesh = new THREE.Mesh(P.mag, mat); this.magMesh.position.set(0, -0.0, 0.016); this.magMesh.rotation.x = -0.3; this.recoilNode.add(this.magMesh);
    this.magGeo = P.mag; this.mat = mat;
    const fm = new THREE.MeshBasicMaterial({ map: null, color: 0xffc890, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), fm); this.flash.position.set(0, 0.072, -0.165); this.flash.visible = false; this.recoilNode.add(this.flash);
    this.cap = 17; this.magIn = true; this.rounds = 16; this.chambered = true; this.boltLocked = false; this.cool = 0; this.auto = false;
    this.points = { magwell: V(0, -0.075, 0.03), ch: V(0, 0.08, 0.03) };
    const Z0 = 25, drop = 0.5 * 9.81 * (Z0 / 360) ** 2; this.sightH = 0.097; this.muzzleZ = -0.16;
    this.launch = new THREE.Vector3(0, this.sightH + drop - 0.072, -(Z0 - 0.16)).normalize();
    this.stats = { vr: 1, hr: 1, flash: 0.5, loud: 1 };
  }
}

// Plate carrier, helmet brim, slung rifle visuals live in main. Grenade physics here.
export class Grenades {
  constructor(scene, world) {
    this.scene = scene; this.world = world; this.live = [];
    this.geo = merge([part(new THREE.SphereGeometry(0.034, 10, 8), 0x4a5236, 0, 0, 0, 0, 0, 0, 1, 1.15, 1), part(new THREE.CylinderGeometry(0.012, 0.014, 0.03, 8), 0x50524a, 0, 0.045, 0), part(new THREE.BoxGeometry(0.012, 0.07, 0.006), 0x6a6c60, 0.025, 0.02, 0, 0, 0, -0.1)]);
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  }
  mesh() { return new THREE.Mesh(this.geo, this.mat); }
  throw(pos, vel, fuse, byEnemy = false) {
    const m = this.mesh(); m.position.copy(pos); this.scene.add(m);
    this.live.push({ m, p: pos.clone(), v: vel.clone(), fuse, w: new THREE.Vector3(Math.random() * 10, Math.random() * 10, 0), byEnemy, rest: false });
  }
  update(dt, onExplode, onBounce) {
    const W = this.world;
    for (let i = this.live.length - 1; i >= 0; i--) {
      const g = this.live[i]; g.fuse -= dt;
      if (g.fuse <= 0) { this.scene.remove(g.m); this.live.splice(i, 1); onExplode(g.p, g); continue; }
      if (g.rest) continue;
      const sub = 3, h = dt / sub;
      for (let k = 0; k < sub; k++) {
        g.v.y -= 9.81 * h; const nx = g.p.x + g.v.x * h, ny = g.p.y + g.v.y * h, nz = g.p.z + g.v.z * h;
        const gy = W.Hn(nx, nz) + 0.03;
        const roof = W.blockedAt(nx, ny, nz) && ny > W.ROOF - 0.1;
        if (roof) { g.v.y = -Math.abs(g.v.y) * 0.3; g.v.x *= 0.6; g.v.z *= 0.6; continue; }
        if (ny < gy) {
          if (gy - g.p.y > 0.12) { // wall: bounce horizontally
            const hx = W.Hn(nx, g.p.z) + 0.03 > g.p.y, hz = W.Hn(g.p.x, nz) + 0.03 > g.p.y;
            if (hx || !hz) g.v.x *= -0.35; if (hz || !hx) g.v.z *= -0.35; g.v.y *= 0.8;
            if (Math.abs(g.v.y) + Math.abs(g.v.x) + Math.abs(g.v.z) > 1.5) onBounce?.(g.p);
          } else {
            g.p.set(nx, gy, nz); const sp = Math.abs(g.v.y);
            g.v.y = sp * 0.28; g.v.x *= 0.55; g.v.z *= 0.55; // muddy ground
            if (sp > 1.5) onBounce?.(g.p);
            if (g.v.lengthSq() < 0.15) { g.rest = true; g.v.set(0, 0, 0); }
          }
        } else g.p.set(nx, ny, nz);
      }
      g.m.position.copy(g.p); g.m.rotation.x += g.w.x * dt * (g.rest ? 0 : 1); g.m.rotation.z += g.w.y * dt * (g.rest ? 0 : 1);
    }
  }
}
