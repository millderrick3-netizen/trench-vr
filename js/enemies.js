// Enemy infantry (instanced, procedural poses) and FPV kamikaze drones.
import * as THREE from 'three';
import { part, merge, HW } from './world.js';

const MAX = 24;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _e = new THREE.Euler(), _up = new THREE.Vector3(0, 1, 0), _x = new THREE.Vector3(1, 0, 0);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function segSegDist2(p1, q1, p2, q2, out) { // returns squared dist, out.s param on seg1
  const d1x = q1.x - p1.x, d1y = q1.y - p1.y, d1z = q1.z - p1.z, d2x = q2.x - p2.x, d2y = q2.y - p2.y, d2z = q2.z - p2.z;
  const rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz;
  let s, t; const c = d1x * rx + d1y * ry + d1z * rz, b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b;
  s = den > 1e-9 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
  t = (b * s + f) / e;
  if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
  const dx = p1.x + d1x * s - (p2.x + d2x * t), dy = p1.y + d1y * s - (p2.y + d2y * t), dz = p1.z + d1z * s - (p2.z + d2z * t);
  out.s = s; return dx * dx + dy * dy + dz * dz;
}

export class Enemies {
  constructor(scene, world, T) {
    this.scene = scene; this.world = world; this.list = [];
    const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    const uni = 0x5d5c48, vest = 0x4a4b3a, skin = 0x9a7d66, gear = 0x3d3e33, blk = 0x242424;
    const torso = merge([part(B(0.36, 0.5, 0.22), uni, 0, 0.25, 0), part(B(0.38, 0.36, 0.27), vest, 0, 0.3, 0.01), part(B(0.3, 0.1, 0.06), gear, 0, 0.2, 0.15), part(B(0.25, 0.32, 0.12), gear, 0, 0.3, -0.18)]);
    const head = merge([part(new THREE.SphereGeometry(0.1, 8, 6), skin, 0, 0.11, 0), part(new THREE.SphereGeometry(0.13, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), 0x535541, 0, 0.13, -0.005), part(B(0.16, 0.035, 0.03), blk, 0, 0.12, 0.09)]);
    const arms = merge([ // shoulder-origin; rifle aimed along +Z
      part(B(0.09, 0.09, 0.32), uni, 0.2, -0.08, 0.14, 0.35, -0.2), part(B(0.09, 0.09, 0.34), uni, -0.14, -0.1, 0.25, 0.25, 0.35),
      part(B(0.04, 0.07, 0.75), blk, 0.03, -0.12, 0.33), part(B(0.03, 0.12, 0.05), blk, 0.03, -0.2, 0.33, 0.2), part(B(0.04, 0.08, 0.22), blk, 0.03, -0.1, 0.02),
    ]);
    const thigh = merge([part(B(0.15, 0.46, 0.16), uni, 0, -0.23, 0)]);
    const shin = merge([part(B(0.13, 0.42, 0.14), uni, 0, -0.21, 0), part(B(0.13, 0.08, 0.26), 0x2e2a24, 0, -0.43, 0.05)]);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const im = (g, n) => { const m = new THREE.InstancedMesh(g, mat, n); m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; scene.add(m); for (let i = 0; i < n; i++) m.setMatrixAt(i, ZERO); return m; };
    this.im = { torso: im(torso, MAX), head: im(head, MAX), arms: im(arms, MAX), thigh: im(thigh, MAX * 2), shin: im(shin, MAX * 2) };
    // drones
    this.drones = [];
    this.droneGeo = merge([
      part(B(0.09, 0.04, 0.16), 0x2a2b2d, 0, 0, 0), part(B(0.05, 0.03, 0.12), 0x5a4a30, 0, -0.035, 0.0), part(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8), 0x3e4433, 0, -0.03, 0.12, Math.PI / 2),
      part(B(0.3, 0.012, 0.018), 0x1b1b1b, 0, 0, 0, 0, Math.PI / 4), part(B(0.3, 0.012, 0.018), 0x1b1b1b, 0, 0, 0, 0, -Math.PI / 4),
      ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => part(new THREE.CylinderGeometry(0.06, 0.06, 0.004, 12), 0x555555, a * 0.106, 0.015, b * 0.106)),
    ]);
    this.droneMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.tmpH = new THREE.Vector3(); this.tmpA = new THREE.Vector3(); this.tmpB = new THREE.Vector3(); this._o = {};
    this.kills = 0; this.droneKills = 0;
  }
  get alive() { return this.list.filter(e => !e.dead).length; }
  aliveDrones() { return this.drones.filter(d => !d.dead).length; }
  clear() {
    this.list.length = 0; for (const k in this.im) { const m = this.im[k]; for (let i = 0; i < m.count; i++) m.setMatrixAt(i, ZERO); m.instanceMatrix.needsUpdate = true; }
    for (const d of this.drones) { this.scene.remove(d.m); d.buzz?.stop(); } this.drones.length = 0;
  }
  add(o) {
    if (this.list.length >= MAX) { const i = this.list.findIndex(e => e.dead); if (i < 0) return null; this.list.splice(i, 1); }
    const e = Object.assign({
      x: 0, y: 0, z: 0, yaw: 0, crouch: 1, tc: 1, phase: Math.random() * 6, state: 'cover', timer: 1 + Math.random() * 3, hp: 100, dead: false, deadT: 0,
      kind: 'field', path: null, speed: 2.6, supp: 0, aimP: 0, burst: 0, shotT: 0, seen: 0, peekN: 0, moving: 0, fall: 0, fallDir: 1,
    }, o);
    this.list.push(e); return e;
  }
  // ----- per-frame -----
  update(dt, ctx) {
    const W = this.world, P = ctx.playerHead;
    for (const e of this.list) {
      if (e.dead) { e.deadT += dt; e.fall = Math.min(1, e.fall + dt * 2.2); continue; }
      e.timer -= dt; e.supp = Math.max(0, e.supp - dt); e.shotT -= dt;
      const dx = P.x - e.x, dz = P.z - e.z, dist = Math.hypot(dx, dz);
      let wantYaw = Math.atan2(dx, dz);
      if (e.state === 'move') {
        const tgt = e.path[0]; const mx = tgt[0] - e.x, mz = tgt[1] - e.z, md = Math.hypot(mx, mz);
        const sp = e.speed * (e.supp > 0 ? 1.25 : 1) * dt;
        if (md < sp + 0.05) { e.x = tgt[0]; e.z = tgt[1]; e.path.shift(); if (!e.path.length) { e.state = 'cover'; e.timer = 1.5 + Math.random() * 2.5; } }
        else { e.x += mx / md * sp; e.z += mz / md * sp; wantYaw = Math.atan2(mx, mz); }
        e.tc = e.kind === 'trench' ? 0.35 : 0.45; e.phase += dt * 9.5; e.moving = 1;
      } else e.moving = Math.max(0, e.moving - dt * 4);
      e.y = e.kind === 'etrench' ? W.trenches[1].floorY : (e.kind === 'trench' ? 0 : W.Hn(e.x, e.z));
      let dy = wantYaw - e.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); e.yaw += dy * Math.min(1, dt * 6);
      if (e.state === 'cover') {
        e.tc = e.kind === 'field' ? 0 : 1;
        if (e.timer <= 0) {
          if (e.supp > 0.5 && Math.random() < 0.7) e.timer = 1 + Math.random();
          else if (ctx.advance(e)) { /* set to move by advance */ }
          else { e.state = 'peek'; e.timer = 1.8 + Math.random() * 2.2; e.burst = 0; e.react = 0.5 + Math.random() * 0.6; e.peekN++; }
        }
      } else if (e.state === 'peek') {
        e.tc = e.kind === 'field' ? 0.55 : 0;
        // line of sight player head <- enemy eye
        const eye = this.eye(e, this.tmpA);
        const vis = (e._losT = (e._losT || 0) - dt) <= 0 ? (e._losT = 0.25, e._vis = W.los(eye, P, 0.5, 0.25)) : e._vis;
        if (vis) {
          e.react -= dt; e.aimP = Math.atan2(P.y - eye.y, dist);
          if (e.react <= 0 && e.shotT <= 0 && dist < 260) {
            ctx.enemyShoot(e, eye, dist); e.burst++;
            e.shotT = e.burst % 3 === 0 ? 0.6 + Math.random() * 0.9 : 0.13 + Math.random() * 0.08;
          }
        }
        if (e.timer <= 0 || e.supp > 1.2) { e.state = 'cover'; e.timer = (e.supp > 0 ? 2.5 : 1.5) + Math.random() * 3; }
      }
      e.crouch += (e.tc - e.crouch) * Math.min(1, dt * 5);
      if (e.kind === 'field') { const tp = e.state === 'cover' ? 1 : 0; e.prone = (e.prone || 0) + (tp - (e.prone || 0)) * Math.min(1, dt * 3); }
    }
    this.updateDrones(dt, ctx);
    this.writeInstances();
  }
  eye(e, out) { if (e.cap) return out.copy(e.cap.head).y += 0.02, out; const hip = 0.92 - 0.42 * e.crouch; return out.set(e.x, e.y + hip + 0.6, e.z); }
  // pose -> instance matrices; also caches hit capsules
  writeInstances() {
    const im = this.im; let i = 0;
    for (const e of this.list) {
      const hipH = 0.92 - 0.42 * e.crouch * (1 - (e.prone || 0));
      const lean = (0.1 + 0.35 * e.crouch + 0.2 * e.moving) * (1 - (e.prone || 0));
      // root: feet position, yaw, death fall around x axis at feet
      _q.setFromAxisAngle(_up, e.yaw);
      const pr = e.prone || 0;
      if (e.dead) { _q2.setFromAxisAngle(_x, pr > 0.5 ? 1.45 : -e.fallDir * e.fall * Math.PI * 0.48); _q.multiply(_q2); }
      else if (pr > 0.001) { _q2.setFromAxisAngle(_x, pr * 1.45); _q.multiply(_q2); }
      const root = _m.compose(_v.set(e.x, e.y, e.z), _q, _s);
      const rootM = root.clone();
      const L = (local, rot, mesh, idx) => { const lm = new THREE.Matrix4().compose(local, rot, _s); mesh.setMatrixAt(idx, lm.premultiply(rootM)); };
      const hip = new THREE.Vector3(0, hipH, -0.05 * e.crouch);
      const tq = new THREE.Quaternion().setFromAxisAngle(_x, lean);
      L(hip, tq, im.torso, i);
      const neck = new THREE.Vector3(0, 0.52, 0).applyQuaternion(tq).add(hip);
      const hq = new THREE.Quaternion().setFromAxisAngle(_x, -e.aimP * 0.6 - lean * 0.6 - (e.prone || 0) * 1.1).premultiply(tq);
      L(neck, hq, im.head, i);
      const sh = new THREE.Vector3(0, 0.46, 0).applyQuaternion(tq).add(hip);
      const aq = new THREE.Quaternion().setFromAxisAngle(_x, -e.aimP + (e.state === 'peek' ? 0 : 0.5) - (e.prone || 0) * 1.45);
      if (e.state === 'move') aq.setFromAxisAngle(_x, 0.6);
      L(sh, aq, im.arms, i);
      // legs: 2-bone with knee bend for crouch, swing for walking
      const bend = Math.acos(Math.min(1, hipH / 0.9));
      for (let s = 0; s < 2; s++) {
        const sw = Math.sin(e.phase + s * Math.PI) * 0.55 * e.moving;
        const th = -(bend + sw);
        const hpos = new THREE.Vector3((s ? 1 : -1) * 0.09, hipH, 0);
        const thq = new THREE.Quaternion().setFromAxisAngle(_x, th);
        L(hpos, thq, im.thigh, i * 2 + s);
        const knee = new THREE.Vector3(0, -0.45, 0).applyQuaternion(thq).add(hpos);
        const shq = new THREE.Quaternion().setFromAxisAngle(_x, bend + Math.max(0, -sw) * 0.9 + (e.moving ? 0.15 : 0));
        L(knee, shq, im.shin, i * 2 + s);
      }
      // hit capsules in world space
      const tw = new THREE.Vector3().copy(hip).applyMatrix4(rootM), nw = new THREE.Vector3().copy(neck).applyMatrix4(rootM);
      const hw = new THREE.Vector3(0, 0.11, 0).applyQuaternion(hq).add(neck).applyMatrix4(rootM);
      e.cap = { hip: tw, neck: nw, head: hw, feet: new THREE.Vector3(e.x, e.y + 0.1, e.z) };
      if (e.dead && e.deadT > 40) for (const k in im) { im[k].setMatrixAt(i, ZERO); if (k === 'thigh' || k === 'shin') { im[k].setMatrixAt(i * 2, ZERO); im[k].setMatrixAt(i * 2 + 1, ZERO); } }
      i++;
    }
    for (; i < MAX; i++) { for (const k of ['torso', 'head', 'arms']) im[k].setMatrixAt(i, ZERO); for (const k of ['thigh', 'shin']) { im[k].setMatrixAt(i * 2, ZERO); im[k].setMatrixAt(i * 2 + 1, ZERO); } }
    for (const k in im) im[k].instanceMatrix.needsUpdate = true;
  }
  // segment a->b vs enemies. returns {e, part, s} for nearest along segment
  segHit(a, b) {
    let best = null; const o = {};
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, half = Math.hypot(b.x - a.x, b.z - a.z) / 2 + 2;
    for (const e of this.list) {
      if (e.dead || !e.cap) continue;
      if (Math.abs(e.x - mx) > half || Math.abs(e.z - mz) > half) continue;
      const c = e.cap;
      let d2 = segSegDist2(a, b, c.head, c.head, o); if (d2 < 0.13 * 0.13 && (!best || o.s < best.s)) best = { e, part: 'head', s: o.s };
      d2 = segSegDist2(a, b, c.hip, c.neck, o); if (d2 < 0.2 * 0.2 && (!best || o.s < best.s - 0.0001)) best = { e, part: 'body', s: o.s };
      d2 = segSegDist2(a, b, c.feet, c.hip, o); if (d2 < 0.14 * 0.14 && (!best || o.s < best.s - 0.0001)) best = { e, part: 'legs', s: o.s };
    }
    for (const d of this.drones) {
      if (d.dead) continue; const d2 = segSegDist2(a, b, d.p, d.p, o);
      if (d2 < 0.35 * 0.35 && (!best || o.s < best.s)) best = { drone: d, part: 'drone', s: o.s };
    }
    return best;
  }
  // bullets passing near enemies suppress them
  suppress(a, b) {
    const o = {};
    for (const e of this.list) { if (e.dead || !e.cap) continue; const d2 = segSegDist2(a, b, e.cap.neck, e.cap.neck, o); if (d2 < 4) e.supp = Math.min(4, e.supp + (d2 < 1 ? 0.9 : 0.45)); }
  }
  damage(e, dmg, dir) {
    if (e.dead) return false; e.hp -= dmg; e.supp = Math.min(4, e.supp + 1.5);
    if (e.state === 'peek' && Math.random() < 0.5) { e.state = 'cover'; e.timer = 2 + Math.random() * 2; }
    if (e.hp <= 0) {
      e.dead = true; e.fall = 0; this.kills++;
      const fwdX = Math.sin(e.yaw), fwdZ = Math.cos(e.yaw); e.fallDir = (dir && dir.x * fwdX + dir.z * fwdZ > 0) ? -1 : 1;
      return true;
    }
    return false;
  }
  // ---------------- drones ----------------
  spawnDrone(from, buzz) {
    const m = new THREE.Mesh(this.droneGeo, this.droneMat); m.position.copy(from); this.scene.add(m);
    const d = { m, p: from.clone(), v: new THREE.Vector3(), state: 'cruise', dead: false, t: 0, buzz, alt: 14 + Math.random() * 8, wob: Math.random() * 10 };
    this.drones.push(d); return d;
  }
  updateDrones(dt, ctx) {
    const P = ctx.playerHead, W = this.world;
    for (let i = this.drones.length - 1; i >= 0; i--) {
      const d = this.drones[i]; d.t += dt;
      if (d.dead) {
        d.v.y -= 9.81 * dt; d.p.addScaledVector(d.v, dt); d.m.rotation.x += dt * 6;
        if (d.p.y < W.Hn(d.p.x, d.p.z) + 0.05 || W.blockedAt(d.p.x, d.p.y, d.p.z)) { ctx.droneExplode(d, d.p.clone(), 0.5); this.scene.remove(d.m); this.drones.splice(i, 1); }
        else d.m.position.copy(d.p);
        continue;
      }
      const hx = P.x - d.p.x, hz = P.z - d.p.z, hd = Math.hypot(hx, hz);
      let tx, ty, tz, sp;
      if (d.state === 'cruise') {
        tx = P.x; tz = P.z; ty = W.Hn(d.p.x, d.p.z) + d.alt; sp = 17;
        if (hd < 32) { d.state = 'dive'; ctx.droneWarn(d); }
      } else { tx = P.x + (ctx.playerVel?.x || 0) * 0.3; tz = P.z + (ctx.playerVel?.z || 0) * 0.3; ty = P.y - 0.2; sp = 21; }
      _v.set(tx - d.p.x, ty - d.p.y, tz - d.p.z); const L = _v.length();
      const wob = d.state === 'cruise' ? 1.5 : 0.6;
      _v.multiplyScalar(sp / Math.max(L, 0.001)).add(this.tmpH.set(Math.sin(d.t * 2.3 + d.wob) * wob, Math.sin(d.t * 3.1) * 0.6 * wob, Math.cos(d.t * 1.7 + d.wob) * wob));
      d.v.lerp(_v, Math.min(1, dt * (d.state === 'dive' ? 3.2 : 1.5)));
      d.p.addScaledVector(d.v, dt);
      // orientation: nose along velocity, tilted
      d.m.position.copy(d.p);
      const yaw = Math.atan2(d.v.x, d.v.z), pitch = Math.atan2(-d.v.y, Math.hypot(d.v.x, d.v.z));
      d.m.rotation.set(pitch * 0.8 + 0.25, yaw, Math.sin(d.t * 5) * 0.08, 'YXZ');
      d.buzz?.setPos(d.p); d.buzz?.setRate(d.state === 'dive' ? 1.25 : 1);
      const dist3 = d.p.distanceTo(P);
      if (dist3 < 1.3 || d.p.y < W.Hn(d.p.x, d.p.z) + 0.1 || W.blockedAt(d.p.x, d.p.y, d.p.z) || d.t > 60) {
        ctx.droneExplode(d, d.p.clone(), 1); this.scene.remove(d.m); d.buzz?.stop(); this.drones.splice(i, 1);
      }
    }
  }
  killDrone(d) { d.dead = true; this.droneKills++; d.v.multiplyScalar(0.3); d.buzz?.stop(); }
}
