// Canvas-texture panel used for the armory/loadout screen, pause menu and mission debrief.
import * as THREE from 'three';
import { ATT, rifleStats } from './weapons.js';

const W = 1024, H = 640;
export class Panel {
  constructor() {
    this.cv = document.createElement('canvas'); this.cv.width = W; this.cv.height = H; this.ctx = this.cv.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, fog: false, depthWrite: true });
    mat.defines = { NO_GRADE: '' };
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.28, 0.8), mat); this.mesh.renderOrder = 60;
    this.btns = []; this.hoverId = null; this.page = 'armory'; this.dirty = true; this.info = '';
  }
  set(page, state) { this.page = page; this.state = state; this.dirty = true; }
  btn(id, x, y, w, h, label, on = false, sub = '') { this.btns.push({ id, x, y, w, h, label, on, sub }); }
  layout() {
    const s = this.state; this.btns = [];
    if (this.page === 'armory' || this.page === 'pause') {
      const lo = s.loadout; const cats = [['optic', 'OPTIC'], ['muzzle', 'MUZZLE'], ['under', 'UNDERBARREL'], ['side', 'SIDE RAIL']];
      cats.forEach(([k], r) => ATT[k].forEach((a, c) => this.btn(`att:${k}:${a.id}`, 170 + c * 172, 92 + r * 62, 164, 48, a.name, lo[k] === a.id)));
      const y0 = 384;
      this.btn('set:loco', 24, y0, 230, 44, `Move: ${s.settings.loco === 'smooth' ? 'Smooth stick' : 'Teleport'}`);
      this.btn('set:turn', 262, y0, 230, 44, `Turn: ${s.settings.turn === 'smooth' ? 'Smooth' : 'Snap ' + s.settings.turn + '°'}`);
      this.btn('set:seated', 500, y0, 230, 44, s.settings.seated ? 'Seated mode: ON' : 'Seated mode: OFF', s.settings.seated);
      this.btn('set:calib', 738, y0, 260, 44, 'Calibrate height (stand tall)');
      this.btn('set:rain', 24, y0 + 52, 230, 44, s.settings.rain ? 'Rain: ON' : 'Rain: OFF', s.settings.rain);
      this.btn('set:angle', 262, y0 + 52, 230, 44, `Gun angle: ${s.settings.angle > 0 ? '+' : ''}${s.settings.angle}°`);
      this.btn('set:aimhelp', 500, y0 + 52, 230, 44, s.settings.easy ? 'Difficulty: Recruit' : 'Difficulty: Veteran', s.settings.easy);
      if (this.page === 'armory') this.btn('go:deploy', 738, y0 + 52, 260, 96, 'DEPLOY  ▶', true, 'start the mission');
      else { this.btn('go:resume', 738, y0 + 52, 260, 44, 'RESUME', true); this.btn('go:restart', 738, y0 + 104, 260, 44, 'Restart mission'); }
    } else if (this.page === 'end' || this.page === 'dead') {
      this.btn('go:restart', 330, 520, 360, 70, this.page === 'end' ? 'PLAY AGAIN' : 'RESTART', true);
    }
  }
  draw() {
    this.layout(); const c = this.ctx, s = this.state;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(14,17,13,0.88)'; this.rr(c, 4, 4, W - 8, H - 8, 18); c.fill();
    c.strokeStyle = 'rgba(160,170,130,0.5)'; c.lineWidth = 3; c.stroke();
    c.fillStyle = '#c9cfb4'; c.font = 'bold 34px system-ui, sans-serif'; c.textBaseline = 'middle';
    const title = { armory: 'ARMORY — AR loadout', pause: 'PAUSED', end: 'OBJECTIVE COMPLETE', dead: 'K.I.A.' }[this.page];
    c.fillText(title, 26, 46);
    if (this.page === 'armory' || this.page === 'pause') {
      c.font = '20px system-ui, sans-serif'; c.fillStyle = '#8d957a';
      c.fillText(this.page === 'armory' ? 'Point + trigger (or click). Your rifle updates live.' : 'Y / M to resume', 520, 46);
      c.font = 'bold 20px system-ui, sans-serif'; c.fillStyle = '#a6ad92';
      ['OPTIC', 'MUZZLE', 'UNDERBARREL', 'SIDE RAIL'].forEach((t, r) => c.fillText(t, 26, 116 + r * 62));
      // stats bars
      const st = rifleStats(s.loadout);
      const bars = [['Vert. recoil ctrl', 1 - st.vr * 0.75], ['Horiz. recoil ctrl', 1 - st.hr * 0.75], ['Muzzle flash', st.flash / 1.3], ['Noise', st.loud / 1.2], ['Handling', st.handling]];
      c.font = '17px system-ui, sans-serif';
      bars.forEach(([n, v], i) => { const x = 870, y = 92 + i * 50; c.fillStyle = '#a6ad92'; c.fillText(n, x - 14, y + 6); c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(x - 14, y + 20, 140, 9); c.fillStyle = '#c7b66e'; c.fillRect(x - 14, y + 20, 140 * Math.max(0.03, Math.min(1, v)), 9); });
      c.fillStyle = '#d8dcc6'; c.font = '18px system-ui, sans-serif';
      this.wrap(c, this.info || 'Hover an option to read about it.', 26, 350, 960);
    }
    if (this.page === 'end' || this.page === 'dead') {
      const r = s.result || {}; c.font = '26px system-ui, sans-serif'; c.fillStyle = '#d8dcc6';
      const lines = this.page === 'end' ? [
        'Trench section cleared. Hold position — reinforcements inbound.',
        `Mission time: ${r.time}`, `Infantry neutralized: ${r.kills}   ·   Drones downed: ${r.drones}`,
        `Shots fired: ${r.shots}   ·   Hits: ${r.hits}   ·   Accuracy: ${r.acc}%`, `Headshots: ${r.heads}   ·   Grenades thrown: ${r.nades}   ·   Times down: ${r.deaths}`,
      ] : ['You were hit. Respawning in the dugout…'];
      lines.forEach((l, i) => c.fillText(l, 40, 130 + i * 62));
    }
    for (const b of this.btns) {
      const hov = this.hoverId === b.id;
      c.fillStyle = b.on ? (hov ? '#7d8a52' : '#5d683c') : (hov ? '#3e4636' : '#262b22'); this.rr(c, b.x, b.y, b.w, b.h, 9); c.fill();
      c.strokeStyle = b.on ? '#c7d08f' : 'rgba(170,180,140,0.35)'; c.lineWidth = 2; c.stroke();
      c.fillStyle = b.on ? '#f1f4e0' : '#c2c8ae'; c.font = (b.h > 60 ? 'bold 30px' : '17px') + ' system-ui, sans-serif'; c.textAlign = 'center';
      c.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 - (b.sub ? 10 : 0)); if (b.sub) { c.font = '15px system-ui'; c.fillText(b.sub, b.x + b.w / 2, b.y + b.h / 2 + 20); }
      c.textAlign = 'left';
    }
    this.tex.needsUpdate = true; this.dirty = false;
  }
  rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  wrap(c, t, x, y, mw) { const words = t.split(' '); let line = '', yy = y; for (const w of words) { const tl = line + w + ' '; if (c.measureText(tl).width > mw) { c.fillText(line, x, yy); line = w + ' '; yy += 22; } else line = tl; } c.fillText(line, x, yy); }
  pick(uv) { const x = uv.x * W, y = (1 - uv.y) * H; return this.btns.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) || null; }
  hover(uv) {
    const b = uv ? this.pick(uv) : null; const id = b ? b.id : null;
    if (id !== this.hoverId) {
      this.hoverId = id;
      if (b && b.id.startsWith('att:')) { const [, k, a] = b.id.split(':'); const at = ATT[k].find(x => x.id === a); this.info = `${at.name}: ${at.desc}`; }
      this.dirty = true;
    }
    return b;
  }
}
