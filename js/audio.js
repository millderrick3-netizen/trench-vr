// Procedural WebAudio sound engine. All sounds are synthesized at startup (no sample files => no licensing issues).
export class SoundEngine {
  constructor() { this.ctx = null; this.buf = {}; this.enabled = false; this.voices = 0; }
  init() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.9;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.25;
    this.master.connect(comp); comp.connect(c.destination);
    this.sr = c.sampleRate;
    this.gen();
    this.enabled = true;
  }
  mk(dur, fn, norm = 0.9) {
    const n = Math.floor(dur * this.sr), b = this.ctx.createBuffer(1, n, this.sr), d = b.getChannelData(0);
    fn(d, this.sr, n);
    let m = 0; for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(d[i]));
    if (m > 0) for (let i = 0; i < n; i++) d[i] *= norm / m;
    return b;
  }
  gen() {
    const R = Math.random, TAU = Math.PI * 2;
    const lpA = (fc, sr) => 1 - Math.exp(-TAU * fc / sr);
    const B = this.buf;
    const shot = (crackF, bodyF, thump, tail, tailLen) => (d, sr, n) => {
      let l1 = 0, l2 = 0, l3 = 0; const a1 = lpA(bodyF, sr), a2 = lpA(tailF(tailLen), sr), a3 = lpA(crackF, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, w = R() * 2 - 1;
        l1 += a1 * (w - l1); l2 += a2 * (w - l2); l3 += a3 * (w - l3);
        const crack = (w - l3) * Math.exp(-t * 160) * 1.2;
        const body = l1 * Math.exp(-t * 28) * 2.2;
        const th = Math.sin(TAU * (55 + 90 * Math.exp(-t * 35)) * t) * Math.exp(-t * 16) * thump;
        const tl = l2 * Math.exp(-t * 4.5) * tail * Math.min(1, t * 30);
        d[i] = crack + body + th + tl;
      }
    };
    const tailF = (x) => x;
    B.rifle = this.mk(0.9, shot(1500, 2200, 0.9, 1.2, 700));
    B.pistol = this.mk(0.7, shot(2200, 2800, 0.5, 0.9, 900));
    B.rifleSup = this.mk(0.45, (d, sr, n) => {
      let l = 0, l2 = 0; const a = lpA(900, sr), a2 = lpA(3000, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, w = R() * 2 - 1; l += a * (w - l); l2 += a2 * (w - l2);
        const clk = (t > 0.018 && t < 0.03) ? (w - l2) * 0.5 * Math.exp(-(t - 0.018) * 300) : 0;
        d[i] = l * Math.exp(-t * 35) * 2 + Math.sin(TAU * 90 * t) * Math.exp(-t * 30) * 0.3 + clk + l * Math.exp(-t * 8) * 0.2;
      }
    }, 0.7);
    B.far = this.mk(1.6, (d, sr, n) => {
      let l = 0, l2 = 0; const a = lpA(800, sr), a2 = lpA(350, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, w = R() * 2 - 1; l += a * (w - l); l2 += a2 * (w - l2);
        d[i] = l * Math.exp(-t * 16) * 2 + l2 * Math.exp(-t * 2.6) * 1.4 * Math.min(1, t * 20) + Math.sin(TAU * 70 * t) * Math.exp(-t * 14) * 0.25;
      }
    });
    B.crack = this.mk(0.07, (d, sr, n) => {
      let l = 0; const a = lpA(2500, sr);
      for (let i = 0; i < n; i++) { const t = i / sr, w = R() * 2 - 1; l += a * (w - l); d[i] = (w - l) * Math.exp(-t * 110); }
    });
    B.boom = this.mk(3.2, (d, sr, n) => {
      let l1 = 0, l2 = 0, l3 = 0; const a1 = lpA(2600, sr), a2 = lpA(500, sr), a3 = lpA(140, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, w = R() * 2 - 1; l1 += a1 * (w - l1); l2 += a2 * (w - l2); l3 += a3 * (w - l3);
        d[i] = l1 * Math.exp(-t * 14) * 1.6 + l2 * Math.exp(-t * 2.2) * 2.4 + Math.sin(TAU * (28 + 60 * Math.exp(-t * 5)) * t) * Math.exp(-t * 2.8) * 0.9 + l3 * Math.exp(-t * 0.9) * 3;
      }
    });
    B.boomFar = this.mk(3.8, (d, sr, n) => {
      let l2 = 0, l3 = 0; const a2 = lpA(350, sr), a3 = lpA(110, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, w = R() * 2 - 1; l2 += a2 * (w - l2); l3 += a3 * (w - l3);
        d[i] = l2 * Math.exp(-t * 2.6) * 2 * Math.min(1, t * 40) + l3 * Math.exp(-t * 0.8) * 3 + Math.sin(TAU * (30 + 30 * Math.exp(-t * 4)) * t) * Math.exp(-t * 2.5) * 0.6;
      }
    });
    const click = (f1, f2, dec) => (d, sr, n) => { for (let i = 0; i < n; i++) { const t = i / sr; d[i] = (Math.sin(TAU * f1 * t) + 0.6 * Math.sin(TAU * f2 * t) + (R() - 0.5) * 1.2) * Math.exp(-t * dec); } };
    B.click = this.mk(0.05, click(3100, 4700, 250), 0.5);
    B.dry = this.mk(0.04, click(2400, 3900, 320), 0.35);
    B.magOut = this.mk(0.25, (d, sr, n) => { for (let i = 0; i < n; i++) { const t = i / sr; d[i] = (Math.sin(TAU * 2600 * t) + (R() - .5)) * Math.exp(-t * 200) + (R() - .5) * 0.3 * Math.exp(-Math.abs(t - 0.08) * 60); } }, 0.6);
    B.magIn = this.mk(0.16, (d, sr, n) => { for (let i = 0; i < n; i++) { const t = i / sr; const a = Math.exp(-t * 220), b = t > 0.07 ? Math.exp(-(t - 0.07) * 260) : 0; d[i] = (Math.sin(TAU * 2900 * t) + (R() - .5) * 1.5) * (a + b * 1.3); } }, 0.7);
    B.rack = this.mk(0.35, (d, sr, n) => {
      let l = 0; const a = lpA(3500, sr);
      for (let i = 0; i < n; i++) { const t = i / sr, w = R() - .5; l += a * (w - l); const slide = t < 0.13 ? l * 2 * Math.sin(Math.PI * t / 0.13) : 0; const clack = t > 0.2 ? (Math.sin(TAU * 2200 * t) + w * 2) * Math.exp(-(t - 0.2) * 150) : 0; d[i] = slide + clack; }
    }, 0.7);
    B.pin = this.mk(0.5, (d, sr, n) => { for (let i = 0; i < n; i++) { const t = i / sr; d[i] = (Math.sin(TAU * 2600 * t) + 0.7 * Math.sin(TAU * 3950 * t)) * Math.exp(-t * 11) * 0.6 + (R() - .5) * Math.exp(-t * 300); } }, 0.5);
    B.thud = this.mk(0.3, (d, sr, n) => { let l = 0; const a = lpA(260, sr); for (let i = 0; i < n; i++) { const t = i / sr, w = R() * 2 - 1; l += a * (w - l); d[i] = l * 4 * Math.exp(-t * 18) + Math.sin(TAU * 85 * t) * Math.exp(-t * 22); } });
    B.hit = this.mk(0.1, (d, sr, n) => { let l = 0; const a = lpA(900, sr); for (let i = 0; i < n; i++) { const t = i / sr, w = R() * 2 - 1; l += a * (w - l); d[i] = l * Math.exp(-t * 60); } }, 0.6);
    B.impact = this.mk(0.12, (d, sr, n) => { let l = 0; const a = lpA(1400, sr); for (let i = 0; i < n; i++) { const t = i / sr, w = R() * 2 - 1; l += a * (w - l); d[i] = l * Math.exp(-t * 45); } }, 0.5);
    B.draw = this.mk(0.25, (d, sr, n) => { let l = 0; const a = lpA(1800, sr); for (let i = 0; i < n; i++) { const t = i / sr, w = R() * 2 - 1; l += a * (w - l); d[i] = l * Math.sin(Math.PI * Math.min(1, t / 0.2)) + (t > 0.2 ? (R() - .5) * Math.exp(-(t - .2) * 300) : 0); } }, 0.5);
    B.ring = this.mk(2.6, (d, sr, n) => { for (let i = 0; i < n; i++) { const t = i / sr; d[i] = Math.sin(TAU * 3800 * t) * Math.exp(-t * 1.3) * Math.min(1, t * 10); } }, 0.12);
    B.buzz = this.mk(1.0, (d, sr, n) => { // integer Hz over 1 s => seamless loop
      const saw = (f, t) => 2 * ((f * t) % 1) - 1; let l = 0; const a = lpA(2500, sr);
      for (let i = 0; i < n; i++) { const t = i / sr; const v = (saw(172, t) + 0.7 * saw(175, t) + 0.35 * saw(344, t) + 0.2 * saw(521, t)) * (0.8 + 0.2 * Math.sin(TAU * 23 * t)); l += a * (v - l); d[i] = l; }
    }, 0.6);
    B.rain = this.mk(3.0, (d, sr, n) => {
      let l = 0, l2 = 0; const a = lpA(4200, sr), a2 = lpA(400, sr); const tmp = new Float32Array(n);
      for (let i = 0; i < n; i++) { const w = R() * 2 - 1; l += a * (w - l); l2 += a2 * (w - l2); tmp[i] = (l - l2) * (1 + (R() < 0.002 ? 3 : 0)); }
      const X = Math.floor(0.5 * sr); // crossfade loop
      for (let i = 0; i < n; i++) d[i] = tmp[i];
      for (let i = 0; i < X; i++) { const k = i / X; d[i] = tmp[i] * k + tmp[n - X + i] * (1 - k); }
    }, 0.4);
  }
  updateListener(p, f, u) {
    if (!this.ctx) return; const L = this.ctx.listener;
    if (L.positionX) {
      const t = this.ctx.currentTime;
      L.positionX.setTargetAtTime(p.x, t, 0.01); L.positionY.setTargetAtTime(p.y, t, 0.01); L.positionZ.setTargetAtTime(p.z, t, 0.01);
      L.forwardX.setTargetAtTime(f.x, t, 0.01); L.forwardY.setTargetAtTime(f.y, t, 0.01); L.forwardZ.setTargetAtTime(f.z, t, 0.01);
      L.upX.setTargetAtTime(u.x, t, 0.01); L.upY.setTargetAtTime(u.y, t, 0.01); L.upZ.setTargetAtTime(u.z, t, 0.01);
    } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }
    this.lp = p;
  }
  // pos: {x,y,z} or null (head-relative / non-positional)
  play(name, pos = null, { gain = 1, rate = 1, delay = true, lowpass = 0, ref = 3 } = {}) {
    if (!this.enabled || !this.buf[name]) return null;
    if (this.voices > 40) return null;
    const c = this.ctx; const src = c.createBufferSource(); src.buffer = this.buf[name]; src.playbackRate.value = rate;
    const g = c.createGain(); g.gain.value = gain; let node = src;
    if (lowpass) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lowpass; node.connect(f); node = f; }
    node.connect(g);
    let start = c.currentTime;
    if (pos) {
      const p = c.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = 1; p.maxDistance = 10000;
      if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
      g.connect(p); p.connect(this.master);
      if (delay && this.lp) { const dx = pos.x - this.lp.x, dy = pos.y - this.lp.y, dz = pos.z - this.lp.z; start += Math.sqrt(dx * dx + dy * dy + dz * dz) / 343; }
    } else g.connect(this.master);
    this.voices++; src.onended = () => { this.voices--; };
    src.start(start);
    return src;
  }
  loop(name, pos, gain = 1, ref = 6) {
    if (!this.enabled) return null;
    const c = this.ctx; const src = c.createBufferSource(); src.buffer = this.buf[name]; src.loop = true;
    const g = c.createGain(); g.gain.value = gain; src.connect(g);
    let p = null;
    if (pos) { p = c.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = 1.1; g.connect(p); p.connect(this.master); }
    else g.connect(this.master);
    src.start();
    return {
      src, g, p,
      setPos(v) { if (!p) return; if (p.positionX) { p.positionX.value = v.x; p.positionY.value = v.y; p.positionZ.value = v.z; } else p.setPosition(v.x, v.y, v.z); },
      setRate(r) { src.playbackRate.value = r; }, setGain(v) { g.gain.value = v; },
      stop() { try { src.stop(); } catch (e) { } g.disconnect(); },
    };
  }
}
