// Particles, tracers, explosions, rain, screen overlays (vignette / damage / fade).
import * as THREE from 'three';

const fogChunk = `
  #ifdef USE_FOG
    float fd = length(vView);
    float ff = 1.0 - exp(-fogDensity*fogDensity*fd*fd);
  #else
    float ff = 0.0;
  #endif`;

class Particles {
  constructor(scene, tex, max, additive, fog) {
    this.max = max; this.n = 0; this.items = [];
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.pa = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); // xyz size
    this.ca = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4); // rgb a
    this.ra = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    this.pa.setUsage(THREE.DynamicDrawUsage); this.ca.setUsage(THREE.DynamicDrawUsage); this.ra.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('ip', this.pa); g.setAttribute('ic', this.ca); g.setAttribute('ir', this.ra);
    g.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, fogColor: { value: fog.color }, fogDensity: { value: fog.density } },
      vertexShader: `attribute vec4 ip; attribute vec4 ic; attribute float ir; varying vec2 vUv; varying vec4 vC; varying vec3 vView;
        void main(){ vUv = uv; vC = ic; vec4 mv = viewMatrix * vec4(ip.xyz,1.0); float c = cos(ir), s = sin(ir);
          vec2 p = mat2(c,s,-s,c) * position.xy * ip.w; mv.xy += p; vView = mv.xyz; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 fogColor; uniform float fogDensity; varying vec2 vUv; varying vec4 vC; varying vec3 vView;
        void main(){ vec4 t = texture2D(map, vUv); ${fogChunk}
          ${additive ? 'gl_FragColor = vec4(vC.rgb * t.rgb * t.a * vC.a * (1.0-ff), 1.0);' : 'gl_FragColor = vec4(mix(vC.rgb*t.rgb, fogColor, ff), t.a*vC.a);'} }`,
      transparent: true, depthWrite: false, fog: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mat.defines = { USE_FOG: '' };
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 31 : 30;
    scene.add(this.mesh); this.g = g;
  }
  spawn(o) { // {p, v, life, s0, s1, c:[r,g,b], a0, a1, grav, drag, rot}
    if (this.items.length >= this.max) this.items.shift();
    o.t = 0; o.r = o.rot ?? Math.random() * 6.28; o.vr = (Math.random() - 0.5) * (o.spin ?? 1); this.items.push(o); return o;
  }
  update(dt) {
    const it = this.items; let w = 0;
    for (let i = 0; i < it.length; i++) {
      const o = it[i]; o.t += dt; if (o.t >= o.life) continue;
      const k = o.t / o.life;
      o.v.y -= (o.grav || 0) * dt; const dr = Math.exp(-(o.drag || 0) * dt); o.v.multiplyScalar(dr);
      o.p.addScaledVector(o.v, dt); if (o.floor !== undefined && o.p.y < o.floor) { o.p.y = o.floor; o.v.set(0, 0, 0); }
      o.r += o.vr * dt;
      const s = o.s0 + (o.s1 - o.s0) * Math.sqrt(k);
      const a = (o.a0 + (o.a1 - o.a0) * k) * Math.min(1, o.t / (o.fadeIn || 0.0001));
      const j = w * 4; this.pa.array[j] = o.p.x; this.pa.array[j + 1] = o.p.y; this.pa.array[j + 2] = o.p.z; this.pa.array[j + 3] = s;
      this.ca.array[j] = o.c[0]; this.ca.array[j + 1] = o.c[1]; this.ca.array[j + 2] = o.c[2]; this.ca.array[j + 3] = a;
      this.ra.array[w] = o.r; it[w++] = o;
    }
    it.length = w; this.g.instanceCount = w;
    this.pa.needsUpdate = this.ca.needsUpdate = this.ra.needsUpdate = true;
    this.pa.addUpdateRange?.(0, w * 4); this.ca.addUpdateRange?.(0, w * 4);
  }
}

export class FX {
  constructor(scene, camera, T) {
    this.scene = scene; this.camera = camera; this.T = T;
    this.smoke = new Particles(scene, T.puff, 700, false, scene.fog);
    this.glow = new Particles(scene, T.glow, 300, true, scene.fog);
    // tracers
    this.tracers = []; const tg = new THREE.BoxGeometry(0.025, 0.025, 1).translate(0, 0, -0.5);
    this.trMesh = new THREE.InstancedMesh(tg, new THREE.MeshBasicMaterial({ color: 0xffc070, fog: false, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }), 40);
    this.trMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.trMesh.count = 0; this.trMesh.frustumCulled = false; scene.add(this.trMesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._z = new THREE.Vector3(0, 0, -1);
    // flashes (point light pool of 1 for big explosions to keep cost down)
    this.flashLight = new THREE.PointLight(0xffa860, 0, 30, 1.6); scene.add(this.flashLight); this.flashT = 0;
    this.shake = 0;
    this.buildOverlay();
    this.buildRain();
  }
  buildOverlay() {
    // rings in front of the camera: vignette (helmet brim darker at top), red damage, black fade.
    const ring = (inner, outer, topBoost) => {
      const seg = 48, pos = [], col = [], idx = [];
      for (let i = 0; i <= seg; i++) {
        const a = i / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        const top = Math.max(0, s); const ri = inner * (1 - topBoost * top * top);
        pos.push(c * ri, s * ri * 0.85, 0, c * outer, s * outer, 0);
        col.push(1, 1, 1, 0, 1, 1, 1, 1);
      }
      for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4)); g.setIndex(idx); return g;
    };
    const mk = (g, color, op) => { const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, vertexColors: true, transparent: true, opacity: op, depthTest: false, depthWrite: false, fog: false })); m.renderOrder = 100; m.frustumCulled = false; m.position.z = -0.25; this.camera.add(m); return m; };
    this.vig = mk(ring(0.19, 0.5, 0.28), 0x000000, 0.55);
    this.dmg = mk(ring(0.1, 0.5, 0), 0x6a0000, 0); this.dmg.material.color.setRGB(0.5, 0.02, 0.0);
    const fg = new THREE.PlaneGeometry(2, 2);
    this.fade = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false }));
    this.fade.renderOrder = 101; this.fade.position.z = -0.2; this.fade.frustumCulled = false; this.camera.add(this.fade);
    this.dmgA = 0; this.fadeA = 0; this.fadeTarget = 0;
  }
  buildRain() {
    const N = 2200, pos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) { const x = Math.random() * 30 - 15, y = Math.random() * 16, z = Math.random() * 30 - 15; pos.set([x, y, z, x + 0.03, y + 0.45, z + 0.01], i * 6); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainMat = new THREE.ShaderMaterial({
      uniforms: { t: { value: 0 }, cam: { value: new THREE.Vector3() }, op: { value: 0.3 } },
      vertexShader: `uniform float t; uniform vec3 cam; varying float vA;
        void main(){ vec3 p = position; p.y -= t*11.0; p.x += t*1.2;
          vec3 o = p - cam; o.x = mod(o.x + 15.0, 30.0) - 15.0; o.z = mod(o.z + 15.0, 30.0) - 15.0; o.y = mod(o.y + 4.0 - cam.y + 8.0, 16.0) - 6.0;
          vA = 1.0 - smoothstep(6.0, 15.0, length(o.xz)); gl_Position = projectionMatrix * viewMatrix * vec4(cam + o, 1.0); }`,
      fragmentShader: `uniform float op; varying float vA; void main(){ gl_FragColor = vec4(0.75,0.78,0.8, op*vA); }`,
      transparent: true, depthWrite: false,
    });
    this.rain = new THREE.LineSegments(g, this.rainMat); this.rain.frustumCulled = false; this.rain.visible = false; this.rain.renderOrder = 32; this.scene.add(this.rain);
  }
  tracer(from, to, speed = 700) {
    const d = this._v.copy(to).sub(from); const L = d.length(); if (L < 2) return;
    this.tracers.push({ a: from.clone(), dir: d.clone().normalize(), L, t: 0, speed });
  }
  muzzleSmoke(p, dir, suppressed) {
    for (let i = 0; i < (suppressed ? 1 : 2); i++) this.smoke.spawn({ p: p.clone().addScaledVector(dir, 0.05), v: dir.clone().multiplyScalar(0.6 + Math.random()).add(new THREE.Vector3(0, 0.3, 0)), life: 0.9, s0: 0.05, s1: 0.4, c: [0.75, 0.74, 0.72], a0: suppressed ? 0.12 : 0.22, a1: 0, drag: 2 });
  }
  impact(p, n, kind = 'dirt') {
    if (kind === 'dirt') {
      for (let i = 0; i < 3; i++) this.smoke.spawn({ p: p.clone(), v: new THREE.Vector3((Math.random() - .5) * 1.5, 1.5 + Math.random() * 2, (Math.random() - .5) * 1.5).addScaledVector(n, 1), life: 0.7 + Math.random() * 0.4, s0: 0.08, s1: 0.45, c: [0.42, 0.35, 0.27], a0: 0.8, a1: 0, grav: 4, drag: 1.5 });
      for (let i = 0; i < 4; i++) this.smoke.spawn({ p: p.clone(), v: new THREE.Vector3((Math.random() - .5) * 3, 2 + Math.random() * 3, (Math.random() - .5) * 3), life: 0.6, s0: 0.03, s1: 0.03, c: [0.25, 0.2, 0.15], a0: 1, a1: 1, grav: 12, spin: 4 });
    } else if (kind === 'spark') {
      for (let i = 0; i < 4; i++) this.glow.spawn({ p: p.clone(), v: new THREE.Vector3((Math.random() - .5) * 4, Math.random() * 3, (Math.random() - .5) * 4), life: 0.25, s0: 0.05, s1: 0.02, c: [1, 0.7, 0.3], a0: 1, a1: 0, grav: 9 });
    } else if (kind === 'body') {
      for (let i = 0; i < 2; i++) this.smoke.spawn({ p: p.clone(), v: new THREE.Vector3((Math.random() - .5), Math.random(), (Math.random() - .5)), life: 0.5, s0: 0.1, s1: 0.4, c: [0.45, 0.43, 0.38], a0: 0.5, a1: 0, drag: 2 }); // dust off clothing, no gore
    }
  }
  explosion(p, big = 1, near = true) {
    const R = Math.random;
    this.glow.spawn({ p: p.clone().add(new THREE.Vector3(0, 0.4 * big, 0)), v: new THREE.Vector3(), life: 0.18, s0: 3 * big, s1: 5 * big, c: [1, 0.75, 0.45], a0: 1.6, a1: 0 });
    for (let i = 0; i < 4; i++) this.glow.spawn({ p: p.clone().add(new THREE.Vector3((R() - .5) * big, R() * big, (R() - .5) * big)), v: new THREE.Vector3((R() - .5) * 4, 2 + R() * 4, (R() - .5) * 4), life: 0.35, s0: 1.2 * big, s1: 0.4, c: [1, 0.55, 0.2], a0: 1.2, a1: 0 });
    for (let i = 0; i < 12 * big; i++) this.smoke.spawn({ p: p.clone().add(new THREE.Vector3((R() - .5) * big, R() * 0.5, (R() - .5) * big)), v: new THREE.Vector3((R() - .5) * 5, 3 + R() * 9, (R() - .5) * 5).multiplyScalar(big), life: 2.5 + R() * 3, s0: 0.8 * big, s1: 4.5 * big, c: [0.33, 0.29, 0.24], a0: 0.85, a1: 0, grav: 2.5, drag: 1.4, fadeIn: 0.05 });
    for (let i = 0; i < 18 * big; i++) this.smoke.spawn({ p: p.clone(), v: new THREE.Vector3((R() - .5) * 10, 5 + R() * 12, (R() - .5) * 10).multiplyScalar(Math.sqrt(big)), life: 1.6, s0: 0.12, s1: 0.18, c: [0.22, 0.18, 0.13], a0: 1, a1: 1, grav: 14, floor: p.y - 0.2, spin: 6 });
    for (let i = 0; i < 4; i++) this.smoke.spawn({ p: p.clone().add(new THREE.Vector3((R() - .5) * 3 * big, 0.3, (R() - .5) * 3 * big)), v: new THREE.Vector3((R() - .5), 0.3, (R() - .5)), life: 7, s0: 2 * big, s1: 6 * big, c: [0.42, 0.4, 0.37], a0: 0.35, a1: 0, drag: 0.3, fadeIn: 0.6 });
    if (near) { this.flashLight.position.copy(p).y += 1; this.flashLight.intensity = 40 * big; this.flashT = 0.12; }
  }
  flash(p) { this.flashLight.position.copy(p); this.flashLight.intensity = 6; this.flashT = Math.max(this.flashT, 0.04); }
  damage(amount) { this.dmgA = Math.min(0.85, this.dmgA + amount * 0.02); }
  update(dt, camPos, t) {
    this.smoke.update(dt); this.glow.update(dt);
    // tracers
    let w = 0; const M = this._m;
    for (const tr of this.tracers) {
      tr.t += dt; const head = tr.t * tr.speed; if (head - 12 > tr.L) continue;
      const h = Math.min(head, tr.L), tl = Math.max(0, head - 12); if (h <= tl) continue;
      this._v.copy(tr.a).addScaledVector(tr.dir, h); this._q.setFromUnitVectors(this._z, tr.dir);
      this._s.set(1, 1, h - tl); M.compose(this._v, this._q, this._s); this.trMesh.setMatrixAt(w++, M); this.tracers[w - 1] = tr;
      if (w >= 40) break;
    }
    this.tracers.length = w; this.trMesh.count = w; this.trMesh.instanceMatrix.needsUpdate = true;
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flashLight.intensity = 0; else this.flashLight.intensity *= Math.exp(-dt * 25); }
    this.dmgA *= Math.exp(-dt * 1.2); this.dmg.material.opacity = this.dmgA;
    this.fadeA += (this.fadeTarget - this.fadeA) * Math.min(1, dt * 2.5); this.fade.material.opacity = this.fadeA; this.fade.visible = this.fadeA > 0.005;
    if (this.rain.visible) { this.rainMat.uniforms.t.value = t; this.rainMat.uniforms.cam.value.copy(camPos); }
    this.shake *= Math.exp(-dt * 4);
  }
}
