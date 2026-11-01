// TRENCH LINE VR — main: renderer, player, input, locomotion, combat, waves.
import * as THREE from 'three';
// colour grade (desaturate, slight warm/olive, contrast) applied at the end of every built-in material
THREE.ShaderChunk.dithering_fragment = `
#ifndef NO_GRADE
{ vec3 gc = gl_FragColor.rgb; float gl = dot(gc, vec3(0.299,0.587,0.114)); gc = mix(vec3(gl), gc, 0.78); gc *= vec3(1.03,1.0,0.93); gc = (gc-0.5)*1.06+0.5; gl_FragColor.rgb = clamp(gc,0.0,1.0); }
#endif
` + THREE.ShaderChunk.dithering_fragment;
import { makeTextures } from './textures.js';
import { World, HW, part, merge } from './world.js';
import { FX } from './fx.js';
import { SoundEngine } from './audio.js';
import { Rifle, Pistol, Grenades } from './weapons.js';
import { Enemies } from './enemies.js';
import { Panel } from './ui.js';

const V3 = THREE.Vector3, Q = THREE.Quaternion;
const $ = (id) => document.getElementById(id);
const setStatus = (t) => { const s = $('status'); if (s) s.textContent = t; };
const R = Math.random;

// ---------------- renderer / scene ----------------
const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local-floor');
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const FOGC = new THREE.Color(0x878b82);
scene.fog = new THREE.FogExp2(FOGC, 0.017);
scene.background = FOGC.clone();
scene.add(new THREE.HemisphereLight(0xc8ccc2, 0x5c4e3e, 3.3));
const sun = new THREE.DirectionalLight(0xfff0dc, 1.7); sun.position.set(-30, 60, 25); scene.add(sun);

const rig = new THREE.Group(); scene.add(rig);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.03, 700);
camera.layers.enable(3); rig.add(camera);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

const T = makeTextures();
const world = new World(scene, T);
const fx = new FX(scene, camera, T);
for (const m of [fx.vig, fx.dmg, fx.fade]) m.layers.set(3);
const sfx = new SoundEngine();
const enemies = new Enemies(scene, world, T);
const grenades = new Grenades(scene, world);
const rifle = new Rifle(T), pistol = new Pistol();
scene.add(rifle.group, pistol.group, rifle.laserDot);
const panel = new Panel(); scene.add(panel.mesh);

// ---------------- state ----------------
const settings = { loco: 'smooth', turn: 30, seated: false, rain: false, angle: 0, easy: true };
const loadout = { optic: 'dot', muzzle: 'hider', under: 'vfg', side: 'light' };
rifle.setLoadout(loadout);
const inv = { rifle: [], pistol: [], nades: 4 };
const player = { hp: 100, regenT: 0, dead: false, deadT: 0, invuln: 0, eyeH: 1.62, crouch: false, weapon: 'rifle', heightOffset: 0, deaths: 0, vel: new V3(), yaw: Math.PI / 2, pitch: 0 };
const stats = { shots: 0, hits: 0, heads: 0, nades: 0, t0: 0 };
const game = { state: 'menu', wave: 0, waveT: 0, waveActive: false, q: [], timers: [], artT: 6, nearArtT: 30, ambT: 2, endT: 0 };
const SPAWN = { x: -3.35, z: 0, yaw: Math.PI / 2 };
let pendingPlace = null;
const head = new V3(), headDir = new V3();
const cur = () => (player.weapon === 'rifle' ? rifle : pistol);
function resetKit() {
  inv.rifle = [30, 30, 30, 30, 30, 30]; inv.pistol = [17, 17, 17]; inv.nades = 4;
  Object.assign(rifle, { magIn: true, rounds: 29, chambered: true, boltLocked: false });
  Object.assign(pistol, { magIn: true, rounds: 16, chambered: true, boltLocked: false });
  rifle.magMesh.visible = pistol.magMesh.visible = true;
}
resetKit();

// ---------------- messages / wrist / desktop HUD ----------------
const msgCv = document.createElement('canvas'); msgCv.width = 1024; msgCv.height = 128;
const msgTex = new THREE.CanvasTexture(msgCv); msgTex.colorSpace = THREE.SRGBColorSpace;
const msgMat = new THREE.MeshBasicMaterial({ map: msgTex, transparent: true, depthTest: false, depthWrite: false, fog: false }); msgMat.defines = { NO_GRADE: '' };
const msgMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.125), msgMat); msgMesh.position.set(0, -0.2, -1.1); msgMesh.renderOrder = 99; msgMesh.layers.set(3); camera.add(msgMesh);
let msgT = 0;
function msg(t, dur = 4) {
  const c = msgCv.getContext('2d'); c.clearRect(0, 0, 1024, 128); let fs = 40; do { c.font = `bold ${fs}px system-ui, sans-serif`; fs -= 2; } while (c.measureText(t).width > 990 && fs > 16); c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = 7; c.strokeStyle = 'rgba(0,0,0,0.75)'; c.strokeText(t, 512, 64); c.fillStyle = '#e4e8d2'; c.fillText(t, 512, 64);
  msgTex.needsUpdate = true; msgT = dur; msgMesh.visible = true;
}
const wristCv = document.createElement('canvas'); wristCv.width = 256; wristCv.height = 128;
const wristTex = new THREE.CanvasTexture(wristCv); wristTex.colorSpace = THREE.SRGBColorSpace;
const wristMat = new THREE.MeshBasicMaterial({ map: wristTex, fog: false }); wristMat.defines = { NO_GRADE: '' };
let wristStr = '', wristT = 0;
function hudText() {
  const w = cur(); const sp = player.weapon === 'rifle' ? inv.rifle : inv.pistol;
  const left = enemies.alive + enemies.aliveDrones() + game.q.length;
  return { a: `${player.weapon === 'rifle' ? 'AR' : 'PST'} ${w.magIn ? w.rounds : '--'}${w.chambered ? '+1' : ''}${w.boltLocked ? ' LOCK' : ''} ${player.weapon === 'rifle' ? (rifle.auto ? 'AUTO' : 'SEMI') : ''}`, b: `MAGS ${sp.length}  NADES ${inv.nades}`, c: `HP ${Math.ceil(player.hp)}  W${game.wave} ${game.state === 'play' ? left + ' left' : ''}` };
}
function updateWrist(dt) {
  wristT -= dt; if (wristT > 0) return; wristT = 0.2;
  const h = hudText(); const s = h.a + '|' + h.b + '|' + h.c; if (s === wristStr) return; wristStr = s;
  const c = wristCv.getContext('2d'); c.fillStyle = '#0c0f0b'; c.fillRect(0, 0, 256, 128); c.fillStyle = '#b8d08a'; c.font = 'bold 30px monospace'; c.fillText(h.a, 10, 36); c.font = '24px monospace'; c.fillText(h.b, 10, 74); c.fillText(h.c, 10, 110);
  wristTex.needsUpdate = true;
  const hud = $('hud'); if (hud) hud.textContent = `${h.a}   ·   ${h.b}   ·   ${h.c}`;
}

// ---------------- hands / controllers ----------------
const gloveGeo = merge([part(new THREE.BoxGeometry(0.085, 0.035, 0.09), 0x2f3128, 0, -0.005, 0.01), part(new THREE.BoxGeometry(0.08, 0.03, 0.06), 0x2a2c24, 0, -0.012, -0.055, 0.4), part(new THREE.BoxGeometry(0.025, 0.025, 0.06), 0x2a2c24, -0.045, 0.0, -0.02, 0, 0.5)]);
const gloveMat = new THREE.MeshLambertMaterial({ vertexColors: true });
function mkHand(h) {
  const glove = new THREE.Mesh(gloveGeo, gloveMat); glove.visible = false; scene.add(glove);
  if (h === 'left') glove.scale.x = -1;
  return { h, ray: null, grip: null, src: null, active: false, pos: new V3(), q: new Q(), gq: new Q(), rayPos: new V3(), b: {}, pb: {}, ax: [0, 0], hist: [], glove, holding: null, magRounds: 0, heldMesh: null, grabStart: new V3(), cycled: false, pin: false };
}
const hands = { left: mkHand('left'), right: mkHand('right') };
const wrist = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.04), wristMat); wrist.position.set(0, 0.03, 0.06); wrist.rotation.set(-1.1, 0, 0); hands.left.glove.add(wrist); wrist.scale.x = -1;
for (let i = 0; i < 2; i++) {
  const ray = renderer.xr.getController(i), grip = renderer.xr.getControllerGrip(i); rig.add(ray, grip);
  ray.addEventListener('connected', (e) => { const h = hands[e.data.handedness]; if (!h) return; h.ray = ray; h.grip = grip; h.src = e.data; });
  ray.addEventListener('disconnected', () => { for (const k in hands) if (hands[k].ray === ray) { hands[k].src = null; hands[k].active = false; } });
}
const pressed = (h, k) => h.b[k] && !h.pb[k];
const released = (h, k) => !h.b[k] && h.pb[k];
function readHands(t, posesOnly) {
  for (const k in hands) {
    const h = hands[k]; if (!posesOnly) h.pb = { ...h.b };
    h.active = !!(h.src && h.src.gamepad && renderer.xr.isPresenting);
    if (!h.active) { h.b = {}; h.ax = [0, 0]; continue; }
    const gp = h.src.gamepad, bt = gp.buttons;
    if (!posesOnly) h.b = { trig: (bt[0]?.value || 0) > 0.55, grip: !!bt[1]?.pressed, stick: !!bt[3]?.pressed, a: !!bt[4]?.pressed, bb: !!bt[5]?.pressed };
    h.trigV = bt[0]?.value || 0;
    h.ax = [gp.axes[2] || 0, gp.axes[3] || 0];
    h.grip.getWorldPosition(h.pos); h.grip.getWorldQuaternion(h.gq);
    h.ray.getWorldPosition(h.rayPos); h.ray.getWorldQuaternion(h.q);
    if (posesOnly) h.hist.push({ p: h.pos.clone(), t }); while (h.hist.length > 2 && t - h.hist[0].t > 0.1) h.hist.shift();
  }
}
function handVel(h, out) { const a = h.hist[0], b = h.hist[h.hist.length - 1]; if (!a || b.t - a.t < 0.01) return out.set(0, 0, 0); return out.copy(b.p).sub(a.p).divideScalar(b.t - a.t); }
function haptic(h, v, ms) { try { h?.src?.gamepad?.hapticActuators?.[0]?.pulse(v, ms); } catch (e) { } }
const hapticBoth = (v, ms) => { haptic(hands.left, v, ms); haptic(hands.right, v, ms); };

// ---------------- desktop input ----------------
const keys = {}; const kp = {}; let mouseL = false, mouseR = false, mouseLP = false, locked = false, desktop = false;
const mouseNDC = new THREE.Vector2(0, 0);
addEventListener('keydown', (e) => { if (!keys[e.code]) kp[e.code] = true; keys[e.code] = true; if (['Space', 'Tab'].includes(e.code)) e.preventDefault(); });
addEventListener('keyup', (e) => { keys[e.code] = false; });
renderer.domElement.addEventListener('mousedown', (e) => {
  if (renderer.xr.isPresenting) return; sfx.init();
  if (e.button === 0) { mouseL = true; mouseLP = true; } if (e.button === 2) mouseR = true;
  if (game.state === 'play' && !locked) renderer.domElement.requestPointerLock?.();
});
addEventListener('mouseup', (e) => { if (e.button === 0) mouseL = false; if (e.button === 2) mouseR = false; });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === renderer.domElement; });
addEventListener('mousemove', (e) => {
  mouseNDC.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  if (locked) { player.yaw -= e.movementX * 0.0022; player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - e.movementY * 0.0022)); }
});

// ---------------- player placement / head ----------------
function placePlayer(x, z, yaw) { pendingPlace = { x, z, yaw }; }
function applyPlace() {
  const p = pendingPlace; pendingPlace = null;
  if (!renderer.xr.isPresenting) { rig.position.set(p.x, 0, p.z); player.yaw = p.yaw; player.pitch = 0; return; }
  rig.updateMatrixWorld(true); camera.getWorldPosition(head); camera.getWorldDirection(headDir);
  const hy = Math.atan2(-headDir.x, -headDir.z); rotateRigAroundHead(p.yaw - hy);
  rig.updateMatrixWorld(true); camera.getWorldPosition(head); rig.position.x += p.x - head.x; rig.position.z += p.z - head.z;
}
function rotateRigAroundHead(a) {
  rig.updateMatrixWorld(true); const b = camera.getWorldPosition(new V3());
  rig.rotation.y += a; rig.updateMatrixWorld(true); const c = camera.getWorldPosition(new V3());
  rig.position.x += b.x - c.x; rig.position.z += b.z - c.z;
}
function updateHead() {
  rig.updateMatrixWorld(true);
  if (renderer.xr.isPresenting) { renderer.xr.updateCamera(camera); }
  else { camera.position.set(0, player.eyeH, 0); camera.rotation.set(player.pitch + fx.shake * (R() - 0.5) * 0.05, fx.shake * (R() - 0.5) * 0.05, 0); rig.rotation.y = player.yaw; rig.updateMatrixWorld(true); }
  camera.updateMatrixWorld(true); camera.getWorldPosition(head); camera.getWorldDirection(headDir);
}

// ---------------- torso / vest / slung rifle ----------------
let torsoYaw = 0; const torso = new THREE.Group(); scene.add(torso);
const vestGeo = merge([
  part(new THREE.BoxGeometry(0.32, 0.36, 0.06), 0x55573f, 0, -0.47, -0.15), part(new THREE.BoxGeometry(0.33, 0.06, 0.07), 0x4a4c36, 0, -0.62, -0.15),
  ...[-0.09, 0, 0.09].map((x) => part(new THREE.BoxGeometry(0.075, 0.12, 0.05), 0x4c4e37, x, -0.42, -0.2)),
  part(new THREE.BoxGeometry(0.08, 0.09, 0.08), 0x4c4e37, -0.2, -0.6, -0.08), part(new THREE.BoxGeometry(0.05, 0.16, 0.09), 0x2a2b28, 0.22, -0.75, -0.02),
  part(new THREE.BoxGeometry(0.05, 0.02, 0.36), 0x3e3f30, 0.16, -0.36, 0.0), part(new THREE.BoxGeometry(0.05, 0.02, 0.36), 0x3e3f30, -0.16, -0.36, 0.0),
]);
const vest = new THREE.Mesh(vestGeo, new THREE.MeshLambertMaterial({ vertexColors: true })); torso.add(vest);
const POUCH = { mag: new V3(0, -0.40, -0.19), nade: new V3(-0.2, -0.6, -0.1), holster: new V3(0.22, -0.72, -0.02) };
function pouch(name, out) { return out.copy(POUCH[name]).applyAxisAngle(new V3(0, 1, 0), torsoYaw).add(head); }
function updateTorso() {
  const hy = Math.atan2(-headDir.x, -headDir.z); let d = hy - torsoYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
  if (Math.abs(d) > 0.6) torsoYaw += d - Math.sign(d) * 0.6;
  torso.position.copy(head); torso.rotation.set(0, torsoYaw, 0);
  vest.visible = renderer.xr.isPresenting; // desktop camera would clip it
}

// ---------------- weapon handling ----------------
const springs = { rifle: { p: 0, y: 0, z: 0, vp: 0, vy: 0, vz: 0 }, pistol: { p: 0, y: 0, z: 0, vp: 0, vy: 0, vz: 0 } };
let twoHand = false, adsT = 0, laserHit = new V3();
const tmpM = new THREE.Matrix4(), tmpM2 = new THREE.Matrix4(), qa = new Q(), qb = new Q(), O = new V3(), Y = new V3(0, 1, 0), tv = new V3(), tv2 = new V3(), tv3 = new V3();
function springStep(s, dt) {
  const k = 190, c = 2 * Math.sqrt(k) * 0.8;
  for (const [x, v] of [['p', 'vp'], ['y', 'vy'], ['z', 'vz']]) { s[v] += (-k * s[x] - c * s[v]) * dt; s[x] += s[v] * dt; }
}
function poseWeapons(dt) {
  springStep(springs.rifle, dt); springStep(springs.pistol, dt);
  for (const [w, s] of [[rifle, springs.rifle], [pistol, springs.pistol]]) { w.recoilNode.rotation.set(s.p, s.y, 0); w.recoilNode.position.set(0, s.p * 0.02, s.z); }
  const w = cur(), other = w === rifle ? pistol : rifle;
  const vr = renderer.xr.isPresenting, Rh = hands.right, Lh = hands.left;
  if (vr && Rh.active) {
    const aimQ = Rh.q.clone().multiply(qb.setFromAxisAngle(new V3(1, 0, 0), THREE.MathUtils.degToRad(-settings.angle)));
    let q = aimQ;
    if (twoHand && w === rifle && Lh.active) {
      const dir = tv.copy(Lh.pos).sub(Rh.pos); if (dir.lengthSq() > 0.01) {
        dir.normalize(); const up = tv2.copy(Y).applyQuaternion(aimQ);
        const g = tv3.copy(rifle.points.support).normalize();
        tmpM.lookAt(O, dir, up); qa.setFromRotationMatrix(tmpM); tmpM2.lookAt(O, g, Y); const qg = new Q().setFromRotationMatrix(tmpM2).invert();
        q = qa.multiply(qg);
      }
    }
    w.group.position.copy(Rh.pos); w.group.quaternion.copy(q); w.group.visible = true;
  } else if (!vr) {
    adsT += ((mouseR && game.state === 'play' ? 1 : 0) - adsT) * Math.min(1, dt * 12);
    const sh = w === rifle ? rifle.stats.sightH : pistol.sightH;
    const hip = w === rifle ? new V3(0.13, -0.2, -0.36) : new V3(0.13, -0.17, -0.42);
    const ads = w === rifle ? new V3(0, -sh, -0.14) : new V3(0, -0.097, -0.42);
    const off = hip.lerp(ads, adsT);
    const cq = camera.getWorldQuaternion(new Q());
    w.group.position.copy(head).add(off.applyQuaternion(cq));
    w.group.quaternion.copy(cq).multiply(qb.setFromEuler(new THREE.Euler(0, 0.06 * (1 - adsT), 0)));
    w.group.visible = game.state === 'play';
    camera.fov = 72 - adsT * (w === rifle && rifle.lo.optic === 'lpvo' ? 0 : 14); camera.updateProjectionMatrix();
  }
  // slung / holstered weapon
  if (other === rifle) {
    rifle.group.position.copy(tv.set(0.08, -0.55, -0.22).applyAxisAngle(Y, torsoYaw).add(head));
    rifle.group.quaternion.setFromEuler(new THREE.Euler(-1.25, torsoYaw + 0.3, 0.9, 'YXZ'));
    rifle.group.visible = vr;
  } else {
    pistol.group.position.copy(tv.copy(POUCH.holster).add(new V3(0, 0.05, 0)).applyAxisAngle(Y, torsoYaw).add(head));
    pistol.group.quaternion.setFromEuler(new THREE.Euler(-Math.PI / 2, torsoYaw, 0, 'YXZ')); pistol.group.visible = vr;
  }
  w.cool -= dt;
  for (const x of [rifle, pistol]) { if (x.flashT > 0) { x.flashT -= dt; x.flash.visible = x.flashT > 0; } else x.flash.visible = false; }
  rifle.ch.position.z = 0.07 + (hands.left.holding === 'ch' && w === rifle ? hands.left.pull || 0 : 0);
  pistol.slide.position.z = (pistol.boltLocked ? 0.035 : 0) + (hands.left.holding === 'ch' && w === pistol ? hands.left.pull || 0 : 0);
  // laser
  if (rifle.beam.visible && w === rifle) {
    rifle.group.updateMatrixWorld(true);
    const o = rifle.beam.getWorldPosition(new V3()), d = new V3(0, 0, -1).applyQuaternion(rifle.recoilNode.getWorldQuaternion(new Q()));
    let L = 0.3; for (; L < 120; L += 0.4) { tv.copy(o).addScaledVector(d, L); if (world.blockedAt(tv.x, tv.y, tv.z)) break; }
    rifle.beam.scale.set(1, 1, L); rifle.laserDot.position.copy(o).addScaledVector(d, L - 0.05); rifle.laserDot.visible = L < 120;
  } else rifle.laserDot.visible = false;
  // gloves
  const Rg = hands.right.glove, Lg = hands.left.glove;
  Rg.visible = Lg.visible = vr;
  if (vr) {
    Rg.position.copy(Rh.pos); Rg.quaternion.copy(Rh.gq);
    if (twoHand && w === rifle) { rifle.group.updateMatrixWorld(true); Lg.position.copy(rifle.recoilNode.localToWorld(tv.copy(rifle.points.support))); Lg.quaternion.copy(rifle.group.quaternion).multiply(qb.setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2))); }
    else { Lg.position.copy(Lh.pos); Lg.quaternion.copy(Lh.gq); }
  }
}
function muzzleWorld(w, outP, outD) {
  w.group.updateMatrixWorld(true);
  outP.copy(w === rifle ? new V3(0, 0.096, w.muzzleZ) : new V3(0, 0.072, -0.165)); w.recoilNode.localToWorld(outP);
  outD.copy(w.launch).applyQuaternion(w.recoilNode.getWorldQuaternion(new Q())).normalize();
}
let shotCount = 0;
function fire(w, pressedNow, held) {
  if (w.cool > 0) return;
  const want = pressedNow || (held && w === rifle && rifle.auto);
  if (!want) return;
  if (!w.chambered) { if (pressedNow) { sfx.play('dry', null, { gain: 0.6 }); haptic(hands.right, 0.2, 20); } return; }
  w.chambered = false;
  if (w.magIn && w.rounds > 0) { w.rounds--; w.chambered = true; } else w.boltLocked = true;
  w.cool = w === rifle ? 60 / rifle.rpm : 0.11;
  const p = new V3(), d = new V3(); muzzleWorld(w, p, d);
  const spread = w === rifle ? 0.00035 : 0.0012; d.x += (R() - 0.5) * spread * 2; d.y += (R() - 0.5) * spread * 2; d.z += (R() - 0.5) * spread * 2; d.normalize();
  const speed = w === rifle ? 880 : 360;
  const res = trace(p, d, speed, w === rifle ? 600 : 200, true);
  stats.shots++; shotCount++;
  const st = w.stats, sup = w === rifle && rifle.lo.muzzle === 'supp';
  sfx.play(w === rifle ? (sup ? 'rifleSup' : 'rifle') : 'pistol', p, { gain: sup ? 0.7 : 1.0, delay: false, ref: 1.5, rate: 0.96 + R() * 0.08 });
  w.flashT = 0.03; if (st.flash > 0.2) fx.flash(p);
  fx.muzzleSmoke(p, d, sup);
  if (w === rifle && shotCount % 4 === 0 && res) fx.tracer(p, res.point, 800);
  // recoil
  const s = springs[w === rifle ? 'rifle' : 'pistol'];
  const two = renderer.xr.isPresenting ? (twoHand ? 0.42 : 1) : (adsT > 0.5 ? 0.55 : 0.8);
  const vr = w === rifle ? 1.15 * st.vr : 1.9, hr = w === rifle ? 0.9 * st.hr : 1.0;
  s.vp += vr * two * (0.85 + R() * 0.3); s.vy += (R() - 0.5) * hr * two; s.vz += (w === rifle ? 0.55 : 0.4) * two;
  if (!renderer.xr.isPresenting) { player.pitch += 0.0045 * vr * two; player.yaw += (R() - 0.5) * 0.003 * hr; }
  haptic(hands.right, w === rifle ? 0.8 : 0.6, 35); if (twoHand) haptic(hands.left, 0.5, 30);
  if (res && res.type === 'enemy') {
    const dmg = res.part === 'head' ? 250 : res.part === 'body' ? (w === rifle ? 55 : 34) : (w === rifle ? 35 : 24);
    stats.hits++; if (res.part === 'head') stats.heads++;
    const killed = enemies.damage(res.e, dmg, d); fx.impact(res.point, Y, 'body');
    sfx.play('hit', null, { gain: killed ? 0.5 : 0.3, rate: killed ? 0.7 : 1 }); haptic(hands.right, 0.3, 15);
  } else if (res && res.type === 'drone') { stats.hits++; enemies.killDrone(res.drone); fx.impact(res.point, Y, 'spark'); sfx.play('hit', null, { gain: 0.5, rate: 1.4 }); msg('Drone down', 2); }
  else if (res) { fx.impact(res.point, Y, 'dirt'); if (res.point.distanceTo(head) < 80) sfx.play('impact', res.point, { gain: 0.6 }); }
}
// hitscan with gravity: march parabola in 8 m chunks, test terrain each 0.5 m, enemies per chunk
function trace(origin, dir, speed, maxD, byPlayer) {
  const p = origin.clone(), v = dir.clone().multiplyScalar(speed), a = new V3(), prev = new V3();
  const dt = 0.5 / speed; let dist = 0;
  while (dist < maxD) {
    a.copy(p); let hitGround = false;
    for (let i = 0; i < 16; i++) {
      prev.copy(p); v.y -= 9.81 * dt; p.addScaledVector(v, dt);
      if (world.blockedAt(p.x, p.y, p.z)) { // refine
        let lo = 0, hi = 1; for (let k = 0; k < 5; k++) { const m = (lo + hi) / 2; tv.lerpVectors(prev, p, m); if (world.blockedAt(tv.x, tv.y, tv.z)) hi = m; else lo = m; }
        p.lerpVectors(prev, p, lo); hitGround = true; break;
      }
    }
    const eh = enemies.segHit(a, p);
    if (eh) return { type: eh.drone ? 'drone' : 'enemy', e: eh.e, drone: eh.drone, part: eh.part, point: a.clone().lerp(p, eh.s) };
    if (byPlayer) enemies.suppress(a, p);
    if (hitGround) return { type: 'ground', point: p.clone() };
    dist += 8; if (p.y < -3) break;
  }
  return { type: 'none', point: p.clone() };
}
function ejectMag(w) {
  if (!w.magIn) return; w.magIn = false; if (w.rounds > 0) w === rifle ? inv.rifle.push(w.rounds) : inv.pistol.push(w.rounds);
  w.rounds = 0; w.magMesh.visible = false; sfx.play('magOut', null, { gain: 0.8 });
  const m = new THREE.Mesh(w === rifle ? rifle.P.mag : pistol.magGeo, rifle.mat); w.recoilNode.updateMatrixWorld(true);
  w.magMesh.getWorldPosition(m.position); w.magMesh.getWorldQuaternion(m.quaternion); scene.add(m); dropped.push({ m, v: new V3(0, -1, 0), t: 0 });
  haptic(hands.right, 0.3, 30);
}
const dropped = [];
function insertMag(w, rounds) { w.magIn = true; w.rounds = rounds; w.magMesh.visible = true; sfx.play('magIn', null, { gain: 0.9 }); hapticBoth(0.5, 40); if (w === pistol && !w.chambered && w.rounds > 0) { w.rounds--; w.chambered = true; w.boltLocked = false; sfx.play('rack', null, { gain: 0.6, rate: 1.3 }); } }
function rack(w) {
  sfx.play('rack', null, { gain: 0.9, rate: w === pistol ? 1.3 : 1 }); hapticBoth(0.4, 40);
  w.chambered = false; if (w.magIn && w.rounds > 0) { w.rounds--; w.chambered = true; } w.boltLocked = false;
}
function takeBestMag(w) { const a = w === rifle ? inv.rifle : inv.pistol; if (!a.length) return -1; let bi = 0; a.forEach((r, i) => { if (r > a[bi]) bi = i; }); return a.splice(bi, 1)[0]; }
function boltRelease(w) { if (w.boltLocked && w.magIn && w.rounds > 0) { w.rounds--; w.chambered = true; w.boltLocked = false; sfx.play('rack', null, { gain: 0.7, rate: 1.2 }); return true; } return false; }
function swapWeapon() { player.weapon = player.weapon === 'rifle' ? 'pistol' : 'rifle'; twoHand = false; sfx.play('draw', null, { gain: 0.6 }); haptic(hands.right, 0.4, 40); }
function resupply() {
  if (game.resupT > 0) return false; game.resupT = 2;
  inv.rifle = [30, 30, 30, 30, 30, 30]; inv.pistol = [17, 17, 17]; inv.nades = 4; sfx.play('magIn', null, { rate: 0.8 }); sfx.play('draw', null, { gain: 0.7 }); msg('Resupplied: 6 rifle mags, 3 pistol mags, 4 grenades', 3); hapticBoth(0.5, 60); return true;
}
function nearCrate(p, r) { return world.crates.some((c) => tv.copy(c.position).setY(c.position.y + 0.3).distanceTo(p) < r); }
function desktopReload() {
  const w = cur(); if (game.reloading) return; const rounds = (w === rifle ? inv.rifle : inv.pistol).length; if (!rounds && w.magIn) return msg('No spare magazines — find a resupply crate', 2.5);
  game.reloading = true; const T0 = 0;
  if (w.magIn) ejectMag(w);
  game.timers.push({ t: 0.9, fn: () => { const r = takeBestMag(w); if (r >= 0) insertMag(w, r); } });
  game.timers.push({ t: 1.45, fn: () => { if (!w.chambered && w.magIn && w.rounds > 0) (w.boltLocked ? boltRelease(w) : rack(w)); game.reloading = false; } });
}

// ---------------- VR hand interactions ----------------
function handInteract(dt, t) {
  const Rh = hands.right, Lh = hands.left, w = cur();
  if (!Rh.active && !Lh.active) return;
  w.group.updateMatrixWorld(true);
  const inMenu = game.state !== 'play';
  if (Rh.active && !inMenu) {
    if (pressed(Rh, 'trig') || Rh.b.trig) fire(w, pressed(Rh, 'trig'), Rh.b.trig);
    if (pressed(Rh, 'a')) ejectMag(w);
    if (pressed(Rh, 'bb')) { if (!boltRelease(w) && w === rifle) { rifle.auto = !rifle.auto; sfx.play('click'); msg(rifle.auto ? 'Full auto' : 'Semi auto', 1.2); } }
    if (pressed(Rh, 'stick') && rifle.cycleMag()) { sfx.play('click'); msg(`LPVO ${rifle.mags[rifle.magIdx]}x`, 1); }
    if (pressed(Rh, 'grip') && Rh.pos.distanceTo(pouch('holster', tv)) < 0.22) swapWeapon();
  }
  if (Lh.active && !inMenu) {
    if (pressed(Lh, 'a')) { if (rifle.toggleSide()) sfx.play('click'); }
    if (pressed(Lh, 'grip')) {
      const chP = w === rifle ? rifle.recoilNode.localToWorld(tv.copy(rifle.points.ch)) : pistol.recoilNode.localToWorld(tv.copy(pistol.points.ch));
      if (Lh.pos.distanceTo(chP) < 0.09) { Lh.holding = 'ch'; Lh.grabStart.copy(Lh.pos); Lh.cycled = false; Lh.pull = 0; haptic(Lh, 0.3, 20); }
      else if (Lh.pos.distanceTo(pouch('mag', tv2)) < 0.18) {
        const r = takeBestMag(w); if (r < 0) { msg('Mag pouches empty — resupply crate', 2); haptic(Lh, 0.2, 80); }
        else { Lh.holding = 'mag'; Lh.magRounds = r; const m = new THREE.Mesh(w === rifle ? rifle.P.mag : pistol.magGeo, rifle.mat); m.position.set(0, 0.07, -0.02); m.rotation.x = -0.25; Lh.grip.add(m); Lh.heldMesh = m; Lh.magFor = w; haptic(Lh, 0.4, 30); sfx.play('draw', null, { gain: 0.3, rate: 1.5 }); }
      } else if (Lh.pos.distanceTo(pouch('nade', tv2)) < 0.17 && inv.nades > 0) {
        Lh.holding = 'nade'; Lh.pin = false; const m = grenades.mesh(); m.position.set(0, 0.02, -0.03); Lh.grip.add(m); Lh.heldMesh = m; haptic(Lh, 0.4, 30);
      } else if (w === rifle && Lh.pos.distanceTo(rifle.recoilNode.localToWorld(tv2.copy(rifle.points.support))) < 0.17) { twoHand = true; Lh.holding = 'gun'; haptic(Lh, 0.3, 25); }
      else if (w === pistol && Lh.pos.distanceTo(Rh.pos) < 0.14) { twoHand = true; Lh.holding = 'gun'; }
      else if (nearCrate(Lh.pos, 0.7)) resupply();
    }
    if (Lh.b.grip) {
      if (Lh.holding === 'mag' && Lh.heldMesh) {
        const top = Lh.heldMesh.getWorldPosition(tv2), well = Lh.magFor.recoilNode.localToWorld(tv3.copy(Lh.magFor.points.magwell));
        if (top.distanceTo(well) < 0.075 && !Lh.magFor.magIn && Lh.magFor === cur()) { insertMag(Lh.magFor, Lh.magRounds); Lh.grip.remove(Lh.heldMesh); Lh.heldMesh = null; Lh.holding = null; }
      } else if (Lh.holding === 'ch') {
        const back = tv2.set(0, 0, 1).applyQuaternion(w.recoilNode.getWorldQuaternion(new Q()));
        const max = w === rifle ? 0.075 : 0.05; Lh.pull = Math.max(0, Math.min(max, tv3.copy(Lh.pos).sub(Lh.grabStart).dot(back)));
        if (!Lh.cycled && Lh.pull > max * 0.85) { Lh.cycled = true; rack(w); }
      } else if (Lh.holding === 'nade' && pressed(Lh, 'trig') && !Lh.pin) { Lh.pin = true; sfx.play('pin', null, { gain: 0.6 }); haptic(Lh, 0.5, 40); msg('Pin pulled — release grip to throw', 1.5); }
    }
    if (released(Lh, 'grip')) {
      if (Lh.holding === 'mag') { (Lh.magFor === rifle ? inv.rifle : inv.pistol).push(Lh.magRounds); if (Lh.heldMesh) Lh.grip.remove(Lh.heldMesh); }
      if (Lh.holding === 'nade') {
        if (Lh.heldMesh) Lh.grip.remove(Lh.heldMesh);
        if (Lh.pin) { const v = handVel(Lh, new V3()).multiplyScalar(1.2); inv.nades--; stats.nades++; grenades.throw(Lh.pos.clone(), v, 3.6); sfx.play('draw', null, { gain: 0.3, rate: 2 }); }
      }
      if (Lh.holding === 'gun') twoHand = false;
      Lh.holding = null; Lh.heldMesh = null; Lh.pull = 0;
    }
    if (pressed(Lh, 'bb')) togglePause();
  }
  if (twoHand && !Lh.b.grip) twoHand = false;
}

// ---------------- locomotion ----------------
const tpLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(new Array(40).fill(0).map(() => new V3())), new THREE.LineBasicMaterial({ color: 0x9fd07a, fog: false }));
tpLine.frustumCulled = false; tpLine.visible = false; scene.add(tpLine);
const tpRing = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.24, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9fd07a, fog: false })); tpRing.visible = false; scene.add(tpRing);
let tpAim = false, tpValid = false; const tpTarget = new V3(); let snapReady = true;
function moveHead(dx, dz) {
  const p = { x: head.x + dx, z: head.z + dz }; world.constrainPlayer(p);
  rig.position.x += p.x - head.x; rig.position.z += p.z - head.z;
}
function locomotion(dt) {
  if (player.dead) return;
  const vr = renderer.xr.isPresenting; let mx = 0, mz = 0, sprint = false;
  const hy = Math.atan2(-headDir.x, -headDir.z);
  if (vr) {
    const L = hands.left, Rr = hands.right;
    if (settings.loco === 'smooth' || !L.active) { mx = L.ax[0]; mz = L.ax[1]; sprint = L.b.stick; if (Math.hypot(mx, mz) < 0.15) mx = mz = 0; }
    else teleport(L);
    const rx = Rr.ax[0];
    {
      if (settings.turn === 'smooth') { if (Math.abs(rx) > 0.2) rotateRigAroundHead(-rx * 2.0 * dt); }
      else { if (Math.abs(rx) > 0.7 && snapReady) { rotateRigAroundHead(-Math.sign(rx) * THREE.MathUtils.degToRad(settings.turn)); snapReady = false; } if (Math.abs(rx) < 0.3) snapReady = true; }
    }
  } else {
    mx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0); mz = (keys.KeyS ? 1 : 0) - (keys.KeyW ? 1 : 0); sprint = keys.ShiftLeft || keys.ShiftRight;
    player.eyeH += ((player.crouch ? 1.05 : 1.62) - player.eyeH) * Math.min(1, dt * 8);
  }
  const sp = (sprint ? 2.8 : 1.5) * (player.crouch && !vr ? 0.6 : 1);
  const sx = Math.sin(hy), cz = Math.cos(hy);
  // forward = (-sin, -cos); right = (cos, -sin)
  const dx = (mx * cz - mz * sx) * sp * dt, dz = (-mx * sx - mz * cz) * sp * dt;
  player.vel.set(dx / Math.max(dt, 1e-4), 0, dz / Math.max(dt, 1e-4));
  rig.updateMatrixWorld(true); camera.getWorldPosition(head);
  moveHead(dx, dz);
}
function teleport(L) {
  const y = L.ax[1];
  if (y < -0.7) tpAim = true;
  if (tpAim) {
    const pts = tpLine.geometry.attributes.position; const p = L.rayPos.clone(), v = new V3(0, 0, -1).applyQuaternion(L.q).multiplyScalar(7);
    tpValid = false; let n = 0;
    for (; n < 40; n++) { pts.setXYZ(n, p.x, p.y, p.z); if (n > 0 && p.y < world.H(p.x, p.z)) { tpValid = world.inTrench(p.x, p.z, 0.15) && world.H(p.x, p.z) < 0.3; tpTarget.set(p.x, world.H(p.x, p.z), p.z); break; } v.y -= 9.8 * 0.04; p.addScaledVector(v, 0.04); }
    for (let k = n + 1; k < 40; k++) pts.setXYZ(k, p.x, p.y, p.z);
    pts.needsUpdate = true; tpLine.visible = true; tpRing.visible = tpValid; tpRing.position.copy(tpTarget).y += 0.02;
    tpLine.material.color.set(tpValid ? 0x9fd07a : 0xd06a5a);
    if (y > -0.3) { tpAim = false; tpLine.visible = tpRing.visible = false; if (tpValid) { rig.position.x += tpTarget.x - head.x; rig.position.z += tpTarget.z - head.z; } }
  }
}

// ---------------- combat callbacks ----------------
function damagePlayer(dmg, from) {
  if (player.dead || player.invuln > 0) return;
  player.hp -= dmg; player.regenT = 5; fx.damage(dmg); sfx.play('thud', null, { gain: 0.8 }); hapticBoth(0.9, 80);
  if (player.hp <= 0) {
    player.hp = 0; player.dead = true; player.deadT = 0; player.deaths++; fx.fadeTarget = 1; msg('You are down. Medic! Respawning in the dugout…', 3.5);
  }
}
function explosion(p, power, owner) {
  const d = p.distanceTo(head);
  fx.explosion(p, power, d < 120);
  sfx.play(d > 70 ? 'boomFar' : 'boom', p, { gain: Math.min(1.6, power) });
  if (!renderer.xr.isPresenting) fx.shake += Math.max(0, 1.6 - d / 25) * power;
  hapticBoth(Math.min(1, power * 12 / (d + 1)), 160);
  const R1 = 8 * Math.sqrt(power), up = new V3(p.x, p.y + 0.4, p.z);
  for (const e of enemies.list) {
    if (e.dead || !e.cap) continue; const de = up.distanceTo(e.cap.neck);
    if (de < R1 && world.los(up, e.cap.neck, 0.05, 0.05)) enemies.damage(e, 230 * Math.pow(1 - de / R1, 1.3), tv.copy(e.cap.neck).sub(up).normalize());
  }
  const RP = 7 * Math.sqrt(power);
  if (d < RP) {
    const chest = new V3(head.x, head.y - 0.35, head.z);
    const vis = world.los(up, head, 0.05, 0.05) || world.los(up, chest, 0.05, 0.05);
    if (vis) { damagePlayer(150 * Math.pow(1 - d / RP, 1.5) * (settings.easy ? 0.7 : 1), p); sfx.play('ring', null, { gain: 0.5 }); }
    else if (d < RP * 0.5) { damagePlayer(10, p); }
  }
  for (const dr of enemies.drones) if (!dr.dead && dr.p.distanceTo(p) < 4) enemies.killDrone(dr);
}
const ctx = {
  playerHead: head, playerVel: player.vel,
  enemyShoot(e, eye, dist) {
    const pos = eye.clone().add(new V3(Math.sin(e.yaw) * 0.7, -0.05, Math.cos(e.yaw) * 0.7));
    sfx.play(dist > 45 ? 'far' : 'rifle', pos, { gain: dist > 45 ? 0.9 : 0.55, rate: 0.9 + R() * 0.1, ref: 4 });
    fx.glow.spawn({ p: pos.clone(), v: new V3(), life: 0.05, s0: 0.5, s1: 0.4, c: [1, 0.75, 0.4], a0: 1.5, a1: 0 });
    let p = (0.42 * Math.exp(-dist / 45) + 0.05) * (settings.easy ? 0.5 : 1) * (e.supp > 0 ? 0.45 : 1) * (e.burst < 1 ? 0.5 : 1) * (player.vel.lengthSq() > 0.5 ? 0.8 : 1);
    if (player.dead || player.invuln > 0) p = 0;
    if (R() < p) damagePlayer(11 + R() * 8, eye);
    else {
      const miss = head.clone().add(new V3((R() - 0.5) * 2.4, (R() - 0.3) * 1.2, (R() - 0.5) * 2.4));
      if (dist > 15) sfx.play('crack', miss, { gain: 0.5, delay: false, ref: 2 });
      if (R() < 0.3) fx.tracer(pos, miss.clone().sub(pos).multiplyScalar(1.6).add(pos), 650);
      const t2 = trace(pos, miss.clone().sub(pos).normalize(), 800, dist + 40, false);
      if (t2 && t2.type === 'ground' && t2.point.distanceTo(head) < 12) { fx.impact(t2.point, Y, 'dirt'); sfx.play('impact', t2.point, { gain: 0.5 }); }
    }
  },
  advance(e) { return advance(e); },
  droneWarn(d) { msg('FPV DRONE INBOUND — shoot it down!', 3); hapticBoth(0.4, 120); },
  droneExplode(d, p, power) { explosion(p, 0.55 * power, 'drone'); },
};
function advance(e) {
  const W = world;
  if (e.kind === 'field') {
    if ((e.adv || 0) >= 4 || R() > 0.55) return false;
    const c = W.craters.filter((c) => c.z > e.z + 5 && c.z < e.z + 24 && c.z < -18 && Math.abs(c.x - e.x) < 16);
    if (!c.length) return false; const t = c[Math.floor(R() * c.length)];
    e.path = [[t.x + (R() - 0.5) * t.r * 0.6, t.z + (R() - 0.5) * t.r * 0.6]]; e.state = 'move'; e.adv = (e.adv || 0) + 1; return true;
  }
  if (e.kind === 'trench') {
    if (R() > 0.6) return false; const o = W.main.closest(head.x, head.z, {}); const P = W.main;
    if (Math.hypot(head.x - e.x, head.z - e.z) < 7 || e.si < 1) return false;
    if (P.cum[e.si] < o.s + 2) return false;
    e.path = [[P.pts[e.si][0], P.pts[e.si][1]]]; e.si--; e.state = 'move'; return true;
  }
  if (e.kind === 'etrench') {
    if (R() > 0.25) return false; const o = {}; W.enemyT.closest(e.x, e.z, o); const tgt = W.enemyT.pointAt(o.s + (R() - 0.5) * 16, {});
    e.path = [[tgt.x, tgt.z]]; e.state = 'move'; return true;
  }
  return false;
}

// ---------------- waves ----------------
function spawnDrone() {
  const p = new V3(10 + R() * 60, 28, -150 - R() * 20);
  const buzz = sfx.loop('buzz', p, 1.5, 7); enemies.spawnDrone(p, buzz);
}
function startWave(n) {
  game.wave = n; game.waveActive = true; const W = world;
  if (n === 1) {
    msg('Wave 1: enemy riflemen in the treeline trench, ~85 m north. Engage!', 5);
    for (let k = 0; k < 5; k++) { const o = W.enemyT.closest(4 + k * 15 + R() * 6, -84, {}); enemies.add({ kind: 'etrench', x: o.px, z: o.pz, timer: 2 + k * 1.5 + R() * 2 }); }
  } else if (n === 2) {
    msg('Wave 2: infantry advancing through the craters. Watch the sky.', 5);
    for (let k = 0; k < 6; k++) {
      const x = -5 + k * 15 + R() * 6, z = -97 - R() * 3; const e = enemies.add({ kind: 'field', x, z, state: 'move', timer: 0, speed: 2.4 + R() * 0.6 });
      const c = W.craters.filter((c) => c.z > -82 && c.z < -60 && Math.abs(c.x - x) < 18); const t = c.length ? c[Math.floor(R() * c.length)] : { x, z: -70 };
      e.path = [[x + (R() - 0.5) * 4, -88], [t.x, t.z]];
    }
    game.q.push({ t: 14, fn: spawnDrone });
  } else if (n === 3) {
    msg('Wave 3: assault team in OUR trench from the east — and more drones!', 5);
    const P = W.main;
    for (let k = 0; k < 5; k++) { const s = P.L - 1 - k * 3; const o = P.pointAt(s, {}); enemies.add({ kind: 'trench', x: o.x, z: o.z, si: o.i, timer: 3 + k * 2, speed: 2.3 }); }
    for (let k = 0; k < 2; k++) { const x = 20 + k * 30, e = enemies.add({ kind: 'field', x, z: -96, state: 'move', timer: 0 }); e.path = [[x, -88], [x + (R() - 0.5) * 10, -66]]; }
    game.q.push({ t: 8, fn: spawnDrone }, { t: 28, fn: spawnDrone });
  }
}
function startMission() {
  enemies.clear(); for (const g of grenades.live) scene.remove(g.m); grenades.live.length = 0;
  for (const d of dropped) scene.remove(d.m); dropped.length = 0;
  resetKit(); Object.assign(stats, { shots: 0, hits: 0, heads: 0, nades: 0, t0: performance.now() });
  enemies.kills = 0; enemies.droneKills = 0; player.hp = 100; player.dead = false; player.deaths = 0; fx.fadeTarget = 0; player.weapon = 'rifle';
  game.state = 'play'; game.wave = 0; game.waveActive = false; game.waveT = 5; game.q.length = 0; game.nearArtT = 25 + R() * 15;
  panel.mesh.visible = false; placePlayer(SPAWN.x + 3.5, SPAWN.z, -Math.PI / 2 + 0.6);
  msg('Move out of the dugout to the firing step. Enemy is NORTH (left).', 5);
  if (!renderer.xr.isPresenting) renderer.domElement.requestPointerLock?.();
}
function endMission() {
  game.state = 'end'; const secs = Math.round((performance.now() - stats.t0) / 1000);
  showPanel('end', { result: { time: `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, kills: enemies.kills, drones: enemies.droneKills, shots: stats.shots, hits: stats.hits, acc: stats.shots ? Math.round(stats.hits / stats.shots * 100) : 0, heads: stats.heads, nades: stats.nades, deaths: player.deaths } });
  msg('OBJECTIVE COMPLETE — trench section cleared', 6);
  if (locked) document.exitPointerLock?.();
}
function updateGame(dt) {
  game.resupT = (game.resupT || 0) - dt;
  for (let i = game.timers.length - 1; i >= 0; i--) { const t = game.timers[i]; t.t -= dt; if (t.t <= 0) { game.timers.splice(i, 1); t.fn(); } }
  // ambience: distant firefights and artillery (all states)
  game.ambT -= dt; if (game.ambT <= 0) {
    game.ambT = 2 + R() * 5; const a = -Math.PI / 2 + (R() - 0.5) * 2.6, dist = 180 + R() * 300; const p = new V3(head.x + Math.cos(a) * dist, 2, head.z + Math.sin(a) * dist);
    const n = 2 + Math.floor(R() * 7); for (let k = 0; k < n; k++) game.timers.push({ t: k * (0.09 + R() * 0.12), fn: () => sfx.play('far', p, { gain: 0.35, rate: 0.85 + R() * 0.1 }) });
  }
  game.artT -= dt; if (game.artT <= 0) { game.artT = 4 + R() * 9; const a = R() * 6.28, dist = 250 + R() * 600; sfx.play('boomFar', new V3(head.x + Math.cos(a) * dist, 0, head.z + Math.sin(a) * dist), { gain: 1.2 }); }
  if (game.state !== 'play') return;
  game.nearArtT -= dt; if (game.nearArtT <= 0) {
    game.nearArtT = 22 + R() * 30; const x = head.x + (R() - 0.5) * 50, z = head.z - 12 - R() * 35; const p = new V3(x, world.H(x, z), z);
    explosion(p, 1.6, 'art'); msg('Incoming artillery!', 2);
  }
  // waves
  if (!game.waveActive) { game.waveT -= dt; if (game.waveT <= 0) startWave(game.wave + 1); }
  else {
    for (let i = game.q.length - 1; i >= 0; i--) { const q = game.q[i]; q.t -= dt; if (q.t <= 0) { game.q.splice(i, 1); q.fn(); } }
    if (enemies.alive === 0 && enemies.aliveDrones() === 0 && !game.q.length) {
      game.waveActive = false;
      if (game.wave >= 3) endMission(); else { game.waveT = 8; msg(`Wave ${game.wave} cleared. Reload and regroup — next wave in 8 s`, 5); }
    }
  }
  // player health
  if (player.dead) {
    player.deadT += dt; if (player.deadT > 3) {
      player.dead = false; player.hp = 100; player.invuln = 4; fx.fadeTarget = 0; placePlayer(SPAWN.x + 1, SPAWN.z, -Math.PI / 2);
      resetKitPartial();
    }
  } else { player.invuln -= dt; player.regenT -= dt; if (player.regenT <= 0) player.hp = Math.min(100, player.hp + 7 * dt); }
}
function resetKitPartial() { if (inv.rifle.length < 3) inv.rifle.push(30, 30); if (inv.nades < 2) inv.nades = 2; }

// ---------------- panel / menus ----------------
const raycaster = new THREE.Raycaster();
const ptrLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new V3(), new V3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xd8e0b0, fog: false }));
ptrLine.visible = false; scene.add(ptrLine);
function showPanel(page, extra = {}) {
  panel.set(page, { loadout, settings, ...extra }); panel.mesh.visible = true;
  if (page === 'armory') { panel.mesh.position.set(-4.68, 1.42, 0); panel.mesh.rotation.set(0, Math.PI / 2, 0); }
  else { const f = new V3(headDir.x, 0, headDir.z).normalize(); panel.mesh.position.copy(head).addScaledVector(f, 1.1).y -= 0.1; panel.mesh.lookAt(head.x, panel.mesh.position.y, head.z); }
}
function togglePause() {
  if (game.state === 'play') { game.state = 'pause'; showPanel('pause'); if (locked) document.exitPointerLock?.(); }
  else if (game.state === 'pause') { game.state = 'play'; panel.mesh.visible = false; if (!renderer.xr.isPresenting) renderer.domElement.requestPointerLock?.(); }
}
function clickPanel(id) {
  sfx.play('click', null, { gain: 0.6 }); haptic(hands.right, 0.3, 20);
  const [k, a, b] = id.split(':');
  if (k === 'att') { loadout[a] = b; rifle.setLoadout(loadout); if (b === 'laser' || b === 'light') { rifle.lightOn = true; rifle.refreshSide(); } }
  else if (id === 'set:loco') settings.loco = settings.loco === 'smooth' ? 'teleport' : 'smooth';
  else if (id === 'set:turn') settings.turn = settings.turn === 30 ? 45 : settings.turn === 45 ? 'smooth' : 30;
  else if (id === 'set:seated') settings.seated = !settings.seated;
  else if (id === 'set:calib') { if (renderer.xr.isPresenting) { player.heightOffset = 1.65 - camera.position.y; msg('Height calibrated', 2); } else msg('Height calibration is for VR', 2); }
  else if (id === 'set:rain') setRain(!settings.rain);
  else if (id === 'set:angle') settings.angle = { 0: 10, 10: 20, 20: -10, '-10': 0 }[settings.angle];
  else if (id === 'set:aimhelp') settings.easy = !settings.easy;
  else if (id === 'go:deploy' || id === 'go:restart') { startMission(); return; }
  else if (id === 'go:resume') { togglePause(); return; }
  panel.dirty = true;
}
let rainLoop = null;
function setRain(on) {
  settings.rain = on; fx.rain.visible = on; scene.fog.density = on ? 0.021 : 0.017;
  if (on && !rainLoop && sfx.enabled) rainLoop = sfx.loop('rain', null, 0.35); if (!on && rainLoop) { rainLoop.stop(); rainLoop = null; }
}
function panelInteract() {
  if (!panel.mesh.visible) { ptrLine.visible = false; return; }
  let hit = null;
  if (renderer.xr.isPresenting) {
    const Rh = hands.right; if (!Rh.active) return;
    const d = new V3(0, 0, -1).applyQuaternion(Rh.q); raycaster.set(Rh.rayPos, d);
    hit = raycaster.intersectObject(panel.mesh)[0];
    ptrLine.visible = true; ptrLine.position.copy(Rh.rayPos); ptrLine.quaternion.copy(Rh.q); ptrLine.scale.set(1, 1, hit ? hit.distance : 3);
    const b = panel.hover(hit ? hit.uv : null);
    if (b && pressed(Rh, 'trig')) clickPanel(b.id);
  } else {
    raycaster.setFromCamera(locked ? new THREE.Vector2(0, 0) : mouseNDC, camera); hit = raycaster.intersectObject(panel.mesh)[0];
    const b = panel.hover(hit ? hit.uv : null); renderer.domElement.style.cursor = b ? 'pointer' : 'default';
    if (b && mouseLP) clickPanel(b.id);
  }
  if (panel.dirty) panel.draw();
}

// ---------------- desktop keys ----------------
function desktopInput(dt) {
  if (renderer.xr.isPresenting) return;
  if (kp.KeyM || kp.Escape) togglePause();
  if (kp.KeyN) setRain(!settings.rain);
  if (game.state !== 'play') return;
  const w = cur();
  if (locked && !player.dead) fire(w, mouseLP, mouseL);
  if (kp.KeyR) desktopReload();
  if (kp.Digit1 && player.weapon !== 'rifle') swapWeapon(); if (kp.Digit2 && player.weapon !== 'pistol') swapWeapon();
  if (kp.KeyF && rifle.toggleSide()) sfx.play('click');
  if (kp.KeyB && !boltRelease(w) && w === rifle) { rifle.auto = !rifle.auto; sfx.play('click'); msg(rifle.auto ? 'Full auto' : 'Semi auto', 1.2); }
  if (kp.KeyV && rifle.cycleMag()) { sfx.play('click'); msg(`LPVO ${rifle.mags[rifle.magIdx]}x`, 1); }
  if (kp.KeyC) player.crouch = !player.crouch;
  if (kp.KeyE) { if (nearCrate(head.clone().setY(0.6), 1.8)) resupply(); else msg('No crate in reach', 1); }
  if (kp.KeyG && inv.nades > 0) { inv.nades--; stats.nades++; sfx.play('pin', null, { gain: 0.5 }); const f = headDir.clone(); grenades.throw(head.clone().addScaledVector(f, 0.4).add(new V3(0, -0.1, 0)), f.multiplyScalar(13).add(new V3(0, 3.5, 0)), 3.6); }
}

// ---------------- scope (LPVO) render ----------------
const eyeL = new V3();
function renderScope() {
  const w = cur();
  if (w !== rifle || rifle.lo.optic !== 'lpvo' || !rifle.group.visible || (player.weapon !== 'rifle')) { rifle.ocMat.uniforms.on.value = 0; return; }
  rifle.group.updateMatrixWorld(true);
  let eye = head;
  if (renderer.xr.isPresenting) { const xc = renderer.xr.getCamera(); if (xc.cameras && xc.cameras[1]) eye = eyeL.setFromMatrixPosition(xc.cameras[1].matrixWorld); }
  const e = rifle.recoilNode.worldToLocal(tv.copy(eye));
  const ez = e.z - 0.0555, dy = e.y - 0.172;
  if (Math.abs(e.x) > 0.05 || Math.abs(dy) > 0.05 || ez < 0.01 || ez > 0.35) { rifle.ocMat.uniforms.on.value = 0; return; }
  const mag = rifle.mags[rifle.magIdx];
  const app = THREE.MathUtils.radToDeg(2 * Math.atan(0.0175 / Math.max(0.03, ez)));
  rifle.scopeCam.fov = Math.min(60, app / mag); rifle.scopeCam.updateProjectionMatrix();
  const k = 1 / 0.0175 * (0.35 + 0.15 * mag) * (0.085 / Math.max(0.04, ez)) * 0.5;
  rifle.ocMat.uniforms.eye.value.set(e.x * k, dy * k); rifle.ocMat.uniforms.on.value = 1; rifle.ocMat.uniforms.mag.value = mag;
  const vis = [rifle.recoilNode.visible, hands.left.glove.visible, hands.right.glove.visible, vest.visible];
  rifle.recoilNode.visible = false; hands.left.glove.visible = hands.right.glove.visible = vest.visible = false;
  const xrOn = renderer.xr.enabled, rt0 = renderer.getRenderTarget();
  renderer.xr.enabled = false; renderer.setRenderTarget(rifle.scopeRT); renderer.render(scene, rifle.scopeCam);
  renderer.setRenderTarget(rt0); renderer.xr.enabled = xrOn;
  [rifle.recoilNode.visible, hands.left.glove.visible, hands.right.glove.visible, vest.visible] = vis;
}

// ---------------- main loop ----------------
const clock = new THREE.Clock(); let elapsed = 0, frames = 0, fpsT0 = performance.now();
window.__game = { placePlayer, startWave, explosion, fireTest: () => fire(cur(), true, true), desktopReload, camera, scene, renderer, world, enemies, game, player, rifle, pistol, startMission, stats, inv, hands, settings, loadout };
function frame(t) {
  const dt = Math.min(0.05, clock.getDelta()); elapsed += dt;
  frames++; { const n = performance.now(); if (n - fpsT0 > 1000) { window.__fps = frames * 1000 / (n - fpsT0); frames = 0; fpsT0 = n; } }
  const vr = renderer.xr.isPresenting;
  rig.position.y = vr ? player.heightOffset + (settings.seated ? 0.45 : 0) : 0;
  updateHead();
  if (pendingPlace) { applyPlace(); updateHead(); }
  readHands(elapsed);
  const sim = game.state === 'play' || game.state === 'menu' || game.state === 'end';
  if (sim) locomotion(dt);
  updateHead();
  readHands(elapsed, true); // re-read world poses after locomotion moved the rig (edge state preserved below)
  updateTorso();
  if (game.state === 'play') { if (vr) handInteract(dt, elapsed); }
  else if (vr) { // menu: allow pause toggle & still let hands release things
    if (pressed(hands.left, 'bb')) togglePause();
  }
  desktopInput(dt);
  panelInteract();
  if (game.state !== 'pause') {
    updateGame(dt);
    enemies.update(game.state === 'play' ? dt : 0, ctx);
    grenades.update(dt, (p) => explosion(p, 1, 'player'), (p) => sfx.play('thud', p, { gain: 0.35, rate: 1.8 }));
    for (let i = dropped.length - 1; i >= 0; i--) { const d = dropped[i]; d.t += dt; if (d.t > 10) { scene.remove(d.m); dropped.splice(i, 1); continue; } const gy = world.Hn(d.m.position.x, d.m.position.z) + 0.03; if (d.m.position.y > gy) { d.v.y -= 9.8 * dt; d.m.position.addScaledVector(d.v, dt); if (d.m.position.y <= gy) { d.m.position.y = gy; if (!d.hit) { d.hit = true; sfx.play('thud', d.m.position, { gain: 0.2, rate: 2.2 }); } } } }
  }
  poseWeapons(dt);
  world.sky.position.copy(head);
  fx.update(dt, head, elapsed);
  if (msgT > 0) { msgT -= dt; msgMesh.material.opacity = Math.min(1, msgT * 2); if (msgT <= 0) msgMesh.visible = false; }
  updateWrist(dt);
  sfx.updateListener(head, headDir, tv.set(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(new Q())));
  const cross = $('cross'); if (cross) cross.style.display = !vr && locked && adsT < 0.3 && game.state === 'play' ? 'block' : 'none';
  renderScope();
  renderer.render(scene, camera);
  for (const k in kp) delete kp[k]; mouseLP = false;
}
renderer.setAnimationLoop(frame);

// ---------------- boot / UI buttons ----------------
showPanel('armory'); panel.draw();
placePlayer(SPAWN.x, SPAWN.z, SPAWN.yaw);
setStatus('Ready.');
$('desktopBtn')?.addEventListener('click', () => { sfx.init(); desktop = true; $('overlay').style.display = 'none'; $('hud').style.display = 'block'; if (settings.rain) setRain(true); });
async function setupVR() {
  const btn = $('vrBtn'); if (!btn) return;
  if (!navigator.xr) { btn.textContent = 'VR not available (no WebXR)'; btn.disabled = true; return; }
  let ok = false; try { ok = await navigator.xr.isSessionSupported('immersive-vr'); } catch (e) { }
  if (!ok) { btn.textContent = 'VR not supported on this device'; btn.disabled = true; return; }
  btn.disabled = false; btn.textContent = 'ENTER VR';
  btn.addEventListener('click', async () => {
    sfx.init();
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] });
      renderer.xr.setFoveation(1); await renderer.xr.setSession(session);
      $('overlay').style.display = 'none'; $('hud').style.display = 'none';
      if (game.state === 'menu') placePlayer(SPAWN.x, SPAWN.z, SPAWN.yaw);
      session.addEventListener('end', () => { $('overlay').style.display = 'flex'; camera.position.set(0, player.eyeH, 0); });
    } catch (e) { setStatus('Could not start VR: ' + e.message); }
  });
}
setupVR();
