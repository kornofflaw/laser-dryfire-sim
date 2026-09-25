// fliptiles.js — a steel frame holding a grid of square plates that spin.
// ---------------------------------------------------------------------------
// Each plate spins about its vertical axle. One side is bare steel ('blank');
// the other shows a face: an orange 'target', a white 'number' plate, or a
// coloured 'shape' (num is then 'colour:shape', e.g. 'red:star'). While
// spinning, the plate's visible width is |cos(angle)| of its full width, and
// hit testing uses exactly that, so an edge-on plate can't be hit.
//
// The board only draws, animates and hit-tests. What a hit MEANS (right
// number, wrong number, reaction time) is up to the runner (flipdrill.js),
// except in free practice (`auto`), where target faces flip back when hit.
//
// speed (Setup "Flip speed") makes plates spin faster and free practice turn
// them sooner; variable (Setup "Variable timing") varies each time up and gap.

import { CONFIG } from './config.js';
import { pattern } from './scenery.js';

const F = () => CONFIG.flip;
const rand = (a, b) => a + Math.random() * (b - a);

export class FlipBoard {
  constructor() {
    this.auto = false;
    this.speed = 1;
    this.variable = false;
    this.reset();
  }

  reset() {
    const { cols, rows } = F();
    this.tiles = Array.from({ length: cols * rows }, (_, i) => ({
      i, col: i % cols, row: Math.floor(i / cols),
      face: 'blank', num: null,       // what's showing (after any spin)
      anim: null,                     // { fromFace, fromNum, t0 }
      until: null, exposure: null,    // free-practice / flash exposures
      flash: 0, flashGood: true,      // hit flash
      marks: [],                      // lead splashes (x, y as fractions of the plate)
    }));
    this.nextAuto = 0.5;
    this.exposures = [];
  }

  // Seconds for a half turn at the current speed.
  get spinTime() { return F().flipTime / this.speed; }

  // A time (s) with the variable-timing spread applied, if on.
  vary(sec) {
    const k = F().variableSpread;
    return this.variable ? sec * rand(1 - k, 1 + k) : sec;
  }

  // Spin a plate to show `face` (and number). No-op if already showing it.
  flip(i, face, num = null, nowSec) {
    const t = this.tiles[i];
    if (t.face === face && t.num === num && !t.anim) return;
    t.anim = { fromFace: t.face, fromNum: t.num, t0: nowSec };
    t.face = face;
    t.num = num;
    t.marks = [];
  }

  flipAll(faces, nowSec) {
    faces.forEach((f, i) => this.flip(i, f.face, f.num ?? null, nowSec));
  }

  // Flash exposure: show a target face for `upSec`, then spin back.
  expose(i, upSec, nowSec) {
    const t = this.tiles[i];
    if (t.face !== 'blank' || t.anim) return null;
    const rec = { tile: i, raisedAt: nowSec, hitAt: null, expired: false, reaction: null };
    this.flip(i, 'target', null, nowSec);
    t.until = nowSec + this.spinTime + upSec;
    t.exposure = rec;
    this.exposures.push(rec);
    return rec;
  }

  blankTiles() { return this.tiles.filter(t => t.face === 'blank' && !t.anim).map(t => t.i); }
  get anyFaceUp() { return this.tiles.some(t => t.face !== 'blank' || t.anim); }

  // How face-on the plate is right now (0 = edge-on, 1 = flat), and which
  // face is visible.
  view(t, nowSec) {
    if (!t.anim) return { k: 1, face: t.face, num: t.num };
    const p = Math.min(1, (nowSec - t.anim.t0) / this.spinTime);
    const k = Math.abs(Math.cos(p * Math.PI));
    return p < 0.5 ? { k, p, face: t.anim.fromFace, num: t.anim.fromNum } : { k, p, face: t.face, num: t.num };
  }

  update(dt, nowSec) {
    for (const t of this.tiles) {
      if (t.anim && nowSec - t.anim.t0 >= this.spinTime) t.anim = null;
      if (t.until != null && nowSec >= t.until) {
        if (t.exposure && t.exposure.hitAt == null) t.exposure.expired = true;
        t.until = null;
        t.exposure = null;
        this.flip(t.i, 'blank', null, nowSec);
      }
      if (t.flash > 0) t.flash = Math.max(0, t.flash - dt * 4);
    }
    if (this.auto && nowSec >= this.nextAuto) {
      const up = this.tiles.filter(t => t.face !== 'blank').length;
      const free = this.blankTiles();
      if (up < F().freeMaxUp && free.length) {
        this.expose(free[Math.floor(Math.random() * free.length)], this.vary(rand(...F().freeExposure)), nowSec);
      }
      this.nextAuto = nowSec + this.vary(rand(...F().freeGap)) / this.speed;
    }
  }

  // Geometry in px: frame rect, plate size, gap.
  layout(W, H) {
    const { cols, rows, boardWidthFrac, boardHeightFrac, centreY } = F();
    const pad = 0.35, gapK = 0.18; // frame border and gaps, in plate sizes
    const s = Math.min(
      (boardWidthFrac * W) / (cols + (cols - 1) * gapK + 2 * pad),
      (boardHeightFrac * H) / (rows + (rows - 1) * gapK + 2 * pad),
    );
    const fw = s * (cols + (cols - 1) * gapK + 2 * pad);
    const fh = s * (rows + (rows - 1) * gapK + 2 * pad);
    const fx = W / 2 - fw / 2, fy = centreY * H - fh / 2;
    const centre = t => [fx + s * pad + t.col * s * (1 + gapK) + s / 2, fy + s * pad + t.row * s * (1 + gapK) + s / 2];
    return { s, fx, fy, fw, fh, centre };
  }

  // Returns { tile, face, num } for a plate hit, { frame: true } for the frame,
  // or null for a clean miss.
  hitTest(px, py, W, H, nowSec) {
    const L = this.layout(W, H);
    for (const t of this.tiles) {
      const [cx, cy] = L.centre(t);
      const v = this.view(t, nowSec);
      if (v.k < F().hittableAbove) continue;
      if (Math.abs(px - cx) <= (L.s / 2) * v.k && Math.abs(py - cy) <= L.s / 2) {
        return { tile: t.i, face: v.face, num: v.num, u: (px - cx) / L.s, v: (py - cy) / L.s };
      }
    }
    if (px >= L.fx && px <= L.fx + L.fw && py >= L.fy && py <= L.fy + L.fh) return { frame: true };
    return null;
  }

  // Reaction to a hit: a flash and a lead splash on the plate. `good` colours
  // the flash (green = right plate, red = wrong one).
  mark(i, u, v, good) {
    const t = this.tiles[i];
    t.flash = 1;
    t.flashGood = good;
    t.marks.push([u, v]);
  }

  // Free practice: a hit target face records the hit and spins back.
  autoHit(i, tMs, nowSec) {
    const t = this.tiles[i];
    if (t.face !== 'target') return;
    if (t.exposure && t.exposure.hitAt == null) {
      t.exposure.hitAt = nowSec;
      t.exposure.reaction = tMs / 1000 - t.exposure.raisedAt;
    }
    t.until = null;
    t.exposure = null;
    this.flip(i, 'blank', null, nowSec);
  }

  draw(g, W, H, nowSec) {
    const L = this.layout(W, H);
    const floorY = 0.86 * H;

    // Legs and a painted steel frame.
    g.fillStyle = '#2b2f34';
    for (const lx of [L.fx + L.fw * 0.18, L.fx + L.fw * 0.82]) {
      g.fillRect(lx - L.s * 0.08, L.fy + L.fh - 4, L.s * 0.16, floorY - (L.fy + L.fh) + 4);
      g.fillRect(lx - L.s * 0.45, floorY - L.s * 0.08, L.s * 0.9, L.s * 0.1);
    }
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.5)';
    g.shadowBlur = L.s * 0.2;
    g.shadowOffsetY = L.s * 0.06;
    const fr = g.createLinearGradient(0, L.fy, 0, L.fy + L.fh);
    fr.addColorStop(0, '#4a4f56');
    fr.addColorStop(1, '#2c3035');
    g.fillStyle = fr;
    g.fillRect(L.fx, L.fy, L.fw, L.fh);
    g.restore();
    // Recessed openings and axles.
    for (const t of this.tiles) {
      const [cx, cy] = L.centre(t);
      g.fillStyle = '#16181b';
      g.fillRect(cx - L.s * 0.54, cy - L.s * 0.54, L.s * 1.08, L.s * 1.08);
      g.fillStyle = '#5c6168';
      g.fillRect(cx - L.s * 0.025, cy - L.s * 0.56, L.s * 0.05, L.s * 1.12);
    }
    // Frame bolts.
    g.fillStyle = '#7d838b';
    for (const [bx, by] of [[L.fx + 10, L.fy + 10], [L.fx + L.fw - 10, L.fy + 10], [L.fx + 10, L.fy + L.fh - 10], [L.fx + L.fw - 10, L.fy + L.fh - 10]]) {
      g.beginPath(); g.arc(bx, by, Math.max(2.5, L.s * 0.035), 0, Math.PI * 2); g.fill();
    }

    for (const t of this.tiles) {
      const [cx, cy] = L.centre(t);
      const v = this.view(t, nowSec);
      const h = L.s / 2;
      // Plate edge (its thickness) shows while it spins.
      if (t.anim) {
        const th = L.s * 0.06 * Math.sqrt(1 - v.k * v.k);
        const side = v.p < 0.5 ? 1 : -1;
        g.fillStyle = '#2e3237';
        g.fillRect(side > 0 ? cx + h * v.k : cx - h * v.k - th, cy - h, th, L.s);
      }
      if (v.k >= 0.02) {
        g.save();
        g.translate(cx, cy);
        g.scale(v.k, 1);
        drawPlate(g, L.s, v.face, v.num, t.anim ? [] : t.marks);
        // Turned away from the light while it spins.
        if (v.k < 1) { g.fillStyle = `rgba(0,0,0,${0.55 * (1 - v.k)})`; g.fillRect(-h, -h, L.s, L.s); }
        if (t.flash > 0 && !t.anim) {
          g.fillStyle = t.flashGood ? `rgba(90,255,120,${0.45 * t.flash})` : `rgba(255,60,60,${0.5 * t.flash})`;
          g.fillRect(-h, -h, L.s, L.s);
        }
        g.restore();
      }
      // Axle caps above and below the plate.
      g.fillStyle = '#9aa0a7';
      for (const dy of [-1, 1]) {
        g.beginPath(); g.arc(cx, cy + dy * (h + L.s * 0.03), L.s * 0.035, 0, Math.PI * 2); g.fill();
      }
    }
  }
}

// One plate face, centred at (0,0), size s.
function drawPlate(g, s, face, num, marks) {
  const h = s / 2;
  if (face === 'blank') {
    // Bare steel: grey with a sheen and faint brushing.
    const grad = g.createLinearGradient(-h, -h, h, h);
    grad.addColorStop(0, '#a3aab1');
    grad.addColorStop(0.45, '#7d848b');
    grad.addColorStop(1, '#50565c');
    g.fillStyle = grad;
    g.fillRect(-h, -h, s, s);
    g.fillStyle = pattern(g, 'gravel');
    g.globalAlpha = 0.12;
    g.fillRect(-h, -h, s, s);
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(255,255,255,0.06)';
    g.lineWidth = 1;
    for (let j = 1; j < 12; j++) {
      const y = -h + (j / 12) * s;
      g.beginPath(); g.moveTo(-h, y); g.lineTo(h, y + s * 0.01); g.stroke();
    }
  } else if (face === 'target') {
    const grad = g.createRadialGradient(-h * 0.4, -h * 0.4, s * 0.05, 0, 0, s * 0.8);
    grad.addColorStop(0, '#ff9d45');
    grad.addColorStop(1, '#d95d0c');
    g.fillStyle = grad;
    g.fillRect(-h, -h, s, s);
    g.strokeStyle = '#fbfbf7';
    g.lineWidth = s * 0.07;
    g.beginPath(); g.arc(0, 0, s * 0.3, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#fbfbf7';
    g.beginPath(); g.arc(0, 0, s * 0.1, 0, Math.PI * 2); g.fill();
  } else {
    // White painted face: a number or a coloured shape.
    const grad = g.createLinearGradient(-h, -h, h, h);
    grad.addColorStop(0, '#fbfaf5');
    grad.addColorStop(1, '#d9d6cc');
    g.fillStyle = grad;
    g.fillRect(-h, -h, s, s);
    g.strokeStyle = 'rgba(20,20,20,0.55)';
    g.lineWidth = Math.max(1, s * 0.02);
    g.strokeRect(-h * 0.84, -h * 0.84, s * 0.84, s * 0.84);
    if (face === 'number') {
      g.fillStyle = '#111';
      g.font = `800 ${Math.round(s * (String(num).length > 1 ? 0.46 : 0.6))}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(num), 0, s * 0.04);
    } else if (face === 'shape' && num) {
      const [color, shape] = num.split(':');
      shapePath(g, shape, s * 0.3);
      g.fillStyle = F().colors[color] || '#888';
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.lineWidth = Math.max(1.5, s * 0.025);
      g.stroke();
    }
  }
  // Bevel: lit top-left edge, shaded bottom-right edge, dark outline.
  const b = s * 0.035;
  g.fillStyle = 'rgba(255,255,255,0.28)';
  g.fillRect(-h, -h, s, b);
  g.fillRect(-h, -h, b, s);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(-h, h - b, s, b);
  g.fillRect(h - b, -h, b, s);
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.lineWidth = Math.max(1, s * 0.02);
  g.strokeRect(-h, -h, s, s);
  // Lead splashes where it was hit.
  g.fillStyle = 'rgba(110,112,115,0.85)';
  for (const [u, v] of marks) {
    g.beginPath();
    for (let j = 0; j < 10; j++) {
      const a = (j / 10) * Math.PI * 2;
      const r = (j % 2 ? 0.02 : 0.05) * s;
      g.lineTo(u * s + Math.cos(a) * r, v * s + Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  }
}

// Path of a shape of radius r centred at (0,0) (also used for the call-out).
export function shapePath(g, shape, r) {
  g.beginPath();
  if (shape === 'circle') g.arc(0, 0, r, 0, Math.PI * 2);
  else if (shape === 'square') g.rect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7);
  else if (shape === 'triangle') { g.moveTo(0, -r); g.lineTo(r * 0.95, r * 0.75); g.lineTo(-r * 0.95, r * 0.75); }
  else if (shape === 'star') {
    for (let j = 0; j < 10; j++) {
      const a = -Math.PI / 2 + (j / 10) * Math.PI * 2, rr = j % 2 ? r * 0.45 : r * 1.05;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
  }
  g.closePath();
}
