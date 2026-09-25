// range.js — everything on the range: layouts, movement, drawing, hit testing.
// ---------------------------------------------------------------------------
// Target kinds:
//   uspsa  cardboard USPSA-style target, A/C/D + head zones
//   dot    Dot Torture dot (numbered circle on a paper sheet)
//   actor  scenario person (see actors.js); scenario.js drives their poses
// plus the Texas Star (star.js) in the 'star' layout.
//
// scoreShot() is PURE classification: it never adds points. Points are added
// only by Game.registerScoredShot() (the single scoring path). onShot() is the
// REACTION (bullet hole, pop-up dropping, plate falling) and never scores.

import { CONFIG } from './config.js';
import { TexasStar } from './star.js';
import { PopupBank } from './popups.js';
import { FlipBoard } from './fliptiles.js';
import { actorZone, drawActor } from './actors.js';
import { drawUspsa, classifyUspsa, toCm, USPSA_ASPECT } from './uspsa.js';
import { drawBackdrop, pattern, FLOOR } from './scenery.js';

// Layouts the user can pick for free practice (L key / Setup).
export const LAYOUTS = {
  bay: 'Bay: 3 static targets',
  single: 'Single target',
  popup: 'Pop-ups: flip up, drop when hit',
  movers: 'Movers: moving targets',
  star: 'Texas Star (steel spinner)',
  grid: 'Flip grid (spinning plates)',
};
// Layouts only used by specific courses.
const COURSE_LAYOUTS = ['dots', 'scene', 'lot', 'lot3d'];

const PATTERNS = ['PingPong', 'Crossing', 'SineWave'];

// Dot Torture sheet: dot centres as fractions of the paper (x across, y down).
// Letter-size sheet with 10 numbered dots.
const DOT_POSITIONS = {
  1: [0.3, 0.09], 2: [0.72, 0.09],
  3: [0.3, 0.25], 4: [0.72, 0.25],
  5: [0.51, 0.41],
  6: [0.3, 0.57], 7: [0.72, 0.57],
  8: [0.51, 0.73],
  9: [0.3, 0.88], 10: [0.72, 0.88],
};
const PAPER = { heightFrac: 0.66, aspect: 8.5 / 11, cy: 0.45 };

let nextId = 1;

export class Range {
  constructor() {
    this.layout = 'bay';
    this.targets = [];
    this.holes = [];
    this.spawnTimer = 0;
    this.star = new TexasStar();
    this.popups = new PopupBank();
    this.autoPopups = true;     // free practice: pop-ups raise themselves
    this.flip = new FlipBoard();
    this.view3d = null;         // 3D view (knife3d.js) for the 'lot3d' layout, loaded on demand
    this.autoFlip = true;       // free practice: plates flip to targets themselves
    this.highlightDot = null;   // dot number to highlight (Dot Torture)
    this.autoResetStar = true;  // free practice: rebuild the star after it's cleared
    this.width = 1;
    this.height = 1;
  }

  static isLayout(name) { return !!LAYOUTS[name] || COURSE_LAYOUTS.includes(name); }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  setLayout(layout) {
    this.layout = Range.isLayout(layout) ? layout : 'bay';
    this.reset();
  }

  // Clear holes and rebuild the targets for the current layout.
  reset() {
    this.targets = [];
    this.holes = [];
    this.highlightDot = null;
    this.spawnTimer = CONFIG.targets.spawnInterval; // spawn the first one immediately
    this.star.reset();
    this.popups.reset();
    this.flip.reset();
    if (this.layout === 'bay') {
      [0.25, 0.5, 0.75].forEach((cx, slot) => this.targets.push(makeUspsa(cx, 0.52, slot)));
    } else if (this.layout === 'single') {
      this.targets.push(makeUspsa(0.5, 0.52, 0));
    } else if (this.layout === 'dots') {
      for (const num of Object.keys(DOT_POSITIONS)) {
        this.targets.push({ id: nextId++, kind: 'dot', num: Number(num), alive: true });
      }
    }
  }

  // USPSA target size in px. On narrow (portrait) screens the width cap wins
  // so the 3 bay targets don't overlap.
  targetSizePx() {
    const T = CONFIG.targets;
    const h = Math.min(T.heightFrac * this.height, (T.maxWidthFrac * this.width) / USPSA_ASPECT);
    return { w: h * USPSA_ASPECT, h };
  }

  paperRect() {
    const h = Math.min(PAPER.heightFrac * this.height, (0.9 * this.width) / PAPER.aspect);
    const w = h * PAPER.aspect;
    return { x: this.width / 2 - w / 2, y: PAPER.cy * this.height - h / 2, w, h };
  }

  dotCentre(num) {
    const p = this.paperRect();
    const [fx, fy] = DOT_POSITIONS[num];
    return { x: p.x + fx * p.w, y: p.y + fy * p.h, r: CONFIG.dots.radiusFrac * p.h };
  }

  actorHeightPx() {
    return CONFIG.scenario.actorHeightFrac * this.height;
  }

  // ---- Scenario actors (scenario.js adds and poses them) -------------------------
  addActor(spec) {
    const a = {
      id: nextId++, kind: 'actor', alive: true,
      cx: spec.x, cy: spec.y ?? (0.86 - CONFIG.scenario.actorHeightFrac / 2),
      pose: spec.pose, vx: spec.vx || 0,
      shirt: spec.shirt, jacket: spec.jacket || null, skin: spec.skin, hair: spec.hair, pants: spec.pants || '#2e3440',
      downAt: null, alpha: 1, drop: 0, hits: 0,
    };
    this.targets.push(a);
    return a;
  }

  update(dt, nowSec) {
    const T = CONFIG.targets;
    const W = this.width, H = this.height;

    // Movers.
    const area = T.spawnArea;
    const left = area.x, right = area.x + area.w;
    const top = area.y, bottom = area.y + area.h;
    for (const t of this.targets) {
      const m = t.mover;
      if (!m) continue;
      if (m.pattern === 'PingPong') {
        t.cx += m.vx * dt;
        t.cy += m.vy * dt;
        if (t.cx < left) { t.cx = left; m.vx = Math.abs(m.vx); }
        else if (t.cx > right) { t.cx = right; m.vx = -Math.abs(m.vx); }
        if (t.cy < top) { t.cy = top; m.vy = Math.abs(m.vy); }
        else if (t.cy > bottom) { t.cy = bottom; m.vy = -Math.abs(m.vy); }
      } else if (m.pattern === 'Crossing') {
        t.cx += m.vx * dt;
        if (t.cx < left - 0.15 || t.cx > right + 0.15) t.alive = false;
      } else if (m.pattern === 'SineWave') {
        t.cx += m.vx * dt;
        m.phase += T.sineFrequency * dt;
        t.cy = clamp(m.baseY + Math.sin(m.phase) * T.sineAmplitude, top, bottom);
        if (t.cx < left) { t.cx = left; m.vx = Math.abs(m.vx); }
        else if (t.cx > right) { t.cx = right; m.vx = -Math.abs(m.vx); }
      }
    }

    // Actors walk, and downed actors drop out of view.
    for (const a of this.targets) {
      if (a.kind !== 'actor') continue;
      if (a.downAt == null) {
        a.cx += a.vx * dt;
        if (a.cx < -0.2 || a.cx > 1.2) a.alive = false;
      } else {
        const k = Math.min(1, (nowSec - a.downAt) / CONFIG.scenario.fallTime);
        a.drop = k;
        a.alpha = 1 - k;
        if (k >= 1) a.alive = false;
      }
    }
    this.targets = this.targets.filter(t => t.alive);

    if (this.layout === 'popup') {
      this.popups.auto = this.autoPopups;
      this.popups.update(dt, nowSec);
    }
    if (this.layout === 'grid') {
      this.flip.auto = this.autoFlip;
      this.flip.update(dt, nowSec);
    }

    // Spawner (movers).
    if (this.layout === 'movers') {
      this.spawnTimer += dt;
      if (this.spawnTimer >= T.spawnInterval && this.targets.length < T.maxAlive) {
        this.spawnTimer = 0;
        this.spawnOne();
      }
    }

    if (this.layout === 'star') {
      this.star.update(dt, W, H, nowSec);
      if (this.autoResetStar && this.star.clearedAt != null &&
          nowSec - this.star.clearedAt > CONFIG.star.resetDelay) {
        this.star.reset();
        this.holes = [];
      }
    }

    // Bullet holes fade out (not on paper: dot torture keeps every hole).
    const keep = this.layout === 'dots' ? Infinity : T.holeLifetime;
    this.holes = this.holes.filter(h => nowSec - h.born < keep && (!h.target || h.target.alive));
  }

  spawnOne() {
    const a = CONFIG.targets.spawnArea;
    const t = makeUspsa(a.x + Math.random() * a.w, a.y + Math.random() * a.h, null);
    if (this.layout === 'movers') {
      const pattern = PATTERNS[Math.floor(Math.random() * PATTERNS.length)];
      const speed = CONFIG.targets.moverSpeed;
      const m = { pattern, vx: 0, vy: 0, baseY: t.cy, phase: Math.random() * Math.PI * 2 };
      if (pattern === 'PingPong') {
        const ang = Math.random() * Math.PI * 2;
        // Speed is in screen widths/sec; scale vy so motion looks even on wide screens.
        m.vx = Math.cos(ang) * speed;
        m.vy = Math.sin(ang) * speed * (this.width / this.height);
      } else {
        const goingRight = Math.random() < 0.5;
        m.vx = goingRight ? speed : -speed;
        if (pattern === 'Crossing') t.cx = goingRight ? a.x - 0.1 : a.x + a.w + 0.1;
      }
      t.mover = m;
    }
    this.targets.push(t);
  }

  // Classify a shot at normalized screen coords. Pure: no side effects.
  // Returns { zone, points, targetId, kind, slot, dot, plate, frame, local }.
  scoreShot(nx, ny) {
    const W = this.width, H = this.height;
    const px = nx * W, py = ny * H;
    const miss = { zone: 'Miss', points: 0, targetId: null, kind: null };

    if (this.layout === 'lot3d') {
      // The 3D view ray-casts; the man is a threat only while charging.
      const man = this.view3d?.runnerMan;
      return this.view3d ? this.view3d.hitTest(nx, ny, man?.pose === 'charge' && !man.stopped) : miss;
    }

    if (this.layout === 'grid') {
      const hit = this.flip.hitTest(px, py, W, H, performance.now() / 1000);
      if (hit?.tile != null) {
        const zone = hit.face === 'blank' ? 'Miss' : 'Tile';
        return { zone, points: CONFIG.points[zone], targetId: `tile-${hit.tile}`, kind: 'tile', ...hit };
      }
      return miss;
    }

    if (this.layout === 'popup') {
      const hit = this.popups.hitTest(px, py, W, H);
      if (hit?.lane != null) {
        return { zone: hit.zone, points: CONFIG.points[hit.zone], targetId: `popup-${hit.lane}`, kind: 'popup', lane: hit.lane };
      }
      return miss;
    }

    if (this.layout === 'star') {
      const hit = this.star.hitTest(px, py, W, H);
      if (hit?.plate != null) {
        return { zone: 'Steel', points: CONFIG.points.Steel, targetId: `plate-${hit.plate}`, kind: 'steel', plate: hit.plate };
      }
      if (hit?.frame) return { ...miss, frame: true };
      return miss;
    }

    const { h } = this.targetSizePx();
    const ah = this.actorHeightPx();
    // Topmost (last drawn) target wins if targets overlap.
    for (let i = this.targets.length - 1; i >= 0; i--) {
      const t = this.targets[i];
      if (t.kind === 'uspsa') {
        const [x, y] = toCm(px, py, t.cx * W, t.cy * H, h);
        const zone = classifyUspsa(x, y);
        if (!zone) continue;
        return { zone, points: CONFIG.points[zone], targetId: t.id, kind: 'uspsa', slot: t.slot, local: { x, y } };
      }
      if (t.kind === 'dot') {
        const d = this.dotCentre(t.num);
        if (Math.hypot(px - d.x, py - d.y) <= d.r) {
          return { zone: 'Dot', points: CONFIG.points.Dot, targetId: t.id, kind: 'dot', dot: t.num };
        }
        continue;
      }
      if (t.kind === 'actor') {
        if (t.downAt != null || t.stopped) continue;
        const th = t.heightPx ?? ah;
        const u = (px - t.cx * W) / th;
        const v = -(py - t.cy * H) / th;
        const body = actorZone(t.pose, u, v);
        if (!body) continue;
        // Only a visible gun, or a knife coming at you, makes someone a
        // threat. Hitting anyone else is a no-shoot penalty.
        const threat = t.pose === 'gun' || t.pose === 'charge';
        const zone = threat ? body : 'NS';
        return { zone, points: CONFIG.points[zone], targetId: t.id, kind: 'actor', bodyZone: body, threat };
      }
    }
    return miss;
  }

  // A target's REACTION to a shot. Never adds score.
  onShot(nx, ny, score, nowSec) {
    const W = this.width, H = this.height;
    const px = nx * W, py = ny * H;

    if (this.layout === 'lot3d') {
      this.view3d?.onShot(score);
      return;
    }

    if (this.layout === 'grid') {
      // Courses handle plate hits themselves; free practice flips targets back.
      if (score.tile != null && this.autoFlip && score.face === 'target') {
        this.flip.mark(score.tile, score.u, score.v, true);
        this.flip.autoHit(score.tile, score.t, nowSec);
      }
      return;
    }

    if (this.layout === 'popup') {
      if (score.lane != null) this.popups.hit(score.lane, px, py, W, H, nowSec, score.t);
      else this.impact(px, py, nowSec);
      return;
    }

    if (this.layout === 'star') {
      if (score.plate != null) this.star.knockOff(score.plate, px, py, W, H, nowSec);
      else if (score.frame) this.star.spark(px, py, nowSec);
      else this.impact(px, py, nowSec);
      return;
    }

    const t = score.targetId != null ? this.targets.find(x => x.id === score.targetId) : null;
    if (t && t.kind === 'actor') {
      // Stored in body units so it stays put as the person moves or grows.
      const th = t.heightPx ?? this.actorHeightPx();
      this.holes.push({ target: t, u: (px - t.cx * W) / th, v: (py - t.cy * H) / th, born: nowSec });
    } else if (t && t.kind !== 'dot') {
      // Hole rides along with a moving target.
      this.holes.push({ target: t, ox: px - t.cx * W, oy: py - t.cy * H, born: nowSec, miss: false });
    } else if (t || this.layout === 'dots' && this.onPaper(px, py)) {
      this.holes.push({ x: px, y: py, born: nowSec, paper: this.layout === 'dots' });
    } else {
      this.impact(px, py, nowSec);
    }
    if (t && t.kind === 'uspsa' && this.layout === 'movers') {
      t.alive = false; // movers drop when hit
      this.targets = this.targets.filter(x => x.alive);
    }
  }

  // A round that hit the backdrop: a dark strike mark plus a puff of dust.
  impact(px, py, nowSec) {
    this.holes.push({ x: px, y: py, born: nowSec, miss: true, seed: Math.random() });
  }

  onPaper(px, py) {
    const p = this.paperRect();
    return px >= p.x && px <= p.x + p.w && py >= p.y && py <= p.y + p.h;
  }

  draw(g, nowSec, showZones) {
    const W = this.width, H = this.height;
    const floorY = FLOOR * H;
    if (this.layout === 'lot3d') {
      g.clearRect(0, 0, W, H); // the 3D canvas underneath shows through
      return;
    }
    const backdrop = { scene: 'room', lot: 'lot' }[this.layout] || 'range';
    drawBackdrop(g, backdrop, W, H);

    if (this.layout === 'star') this.star.draw(g, W, H, nowSec);
    if (this.layout === 'popup') this.popups.draw(g, W, H);
    if (this.layout === 'grid') this.flip.draw(g, W, H, nowSec);
    if (this.layout === 'dots') this.drawPaper(g);

    const { h } = this.targetSizePx();
    const ah = this.actorHeightPx();
    const stakes = this.layout === 'bay' || this.layout === 'single';
    for (const t of this.targets) {
      if (t.kind === 'uspsa') {
        drawUspsa(g, t.cx * W, t.cy * H, h, { showZones, stakes, floorY });
      } else if (t.kind === 'actor') {
        const th = t.heightPx ?? ah;
        drawActor(g, t, t.cx * W, t.cy * H + t.drop * th * 0.35, th);
      }
    }

    const T = CONFIG.targets;
    const r = Math.max(2.2, H * 0.0055); // ~9mm hole at the target's scale
    for (const hole of this.holes) {
      const age = nowSec - hole.born;
      const remaining = T.holeLifetime - age;
      const k = this.layout === 'dots' ? 1 : remaining < T.holeFade ? Math.max(0, remaining / T.holeFade) : 1;
      let x = hole.x, y = hole.y;
      if (hole.target && hole.u != null) {
        const th = hole.target.heightPx ?? ah;
        x = hole.target.cx * W + hole.u * th;
        y = hole.target.cy * H + hole.v * th + (hole.target.drop || 0) * th * 0.35;
      } else if (hole.target) {
        x = hole.target.cx * W + hole.ox;
        y = hole.target.cy * H + hole.oy;
      }
      g.globalAlpha = k * (hole.target?.alpha ?? 1);
      if (hole.miss) drawStrike(g, x, y, r, age, hole.seed);
      else drawHole(g, x, y, r, hole.paper);
      g.globalAlpha = 1;
    }
  }

  // Letter-size sheet stapled to a cardboard backer on two stakes.
  drawPaper(g) {
    const p = this.paperRect();
    const floorY = FLOOR * this.height;
    const bx = p.x - p.w * 0.12, by = p.y - p.h * 0.05, bw = p.w * 1.24, bh = p.h * 1.1;
    for (const sx of [bx + bw * 0.2, bx + bw * 0.8]) {
      g.fillStyle = pattern(g, 'wood');
      g.fillRect(sx - 5, by + bh * 0.4, 10, floorY - by - bh * 0.4);
    }
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.45)';
    g.shadowBlur = 10;
    g.shadowOffsetX = 4;
    g.shadowOffsetY = 4;
    g.fillStyle = pattern(g, 'cardboard');
    g.fillRect(bx, by, bw, bh);
    g.restore();
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.3)';
    g.shadowBlur = 4;
    g.fillStyle = pattern(g, 'paper');
    g.fillRect(p.x, p.y, p.w, p.h);
    g.restore();
    // Staples.
    g.strokeStyle = '#9a9a9a';
    g.lineWidth = 2;
    for (const [sx, sy] of [[p.x + 8, p.y + 8], [p.x + p.w - 22, p.y + 8], [p.x + 8, p.y + p.h - 8], [p.x + p.w - 22, p.y + p.h - 8]]) {
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + 14, sy); g.stroke();
    }
    g.fillStyle = '#555';
    g.font = `600 ${Math.round(p.h * 0.022)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.fillText('DOT TORTURE  ·  3 YARDS', p.x + p.w / 2, p.y + p.h * 0.978);

    for (const t of this.targets) {
      if (t.kind !== 'dot') continue;
      const d = this.dotCentre(t.num);
      if (this.highlightDot === t.num) {
        g.beginPath();
        g.arc(d.x, d.y, d.r * 1.35, 0, Math.PI * 2);
        g.strokeStyle = 'rgba(58,176,255,0.9)';
        g.lineWidth = Math.max(2, d.r * 0.12);
        g.stroke();
      }
      g.beginPath();
      g.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      g.fillStyle = '#151515';
      g.fill();
      g.fillStyle = '#222';
      g.font = `700 ${Math.round(d.r * 0.6)}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(t.num), d.x - d.r * 1.7, d.y);
    }
  }
}

// A bullet hole: dark core, torn lighter fibres around it.
function drawHole(g, x, y, r, paper) {
  g.fillStyle = paper ? 'rgba(235,232,225,0.95)' : 'rgba(230,205,160,0.9)';
  g.beginPath();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const rr = r * (1.35 + 0.25 * Math.sin(i * 7.3 + x));
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
  g.fillStyle = '#0d0b09';
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

// A miss on the berm: dust puff for the first half second, then a dark mark.
function drawStrike(g, x, y, r, age, seed) {
  g.fillStyle = 'rgba(45,32,22,0.75)';
  g.beginPath();
  g.ellipse(x, y, r * 1.3, r, 0, 0, Math.PI * 2);
  g.fill();
  if (age < 0.6) {
    const k = age / 0.6;
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.35 + seed;
      const d = r * (2 + 10 * k) * (0.6 + ((i * 37) % 10) / 20);
      g.fillStyle = `rgba(150,125,95,${0.5 * (1 - k)})`;
      g.beginPath();
      g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (1 + 3 * k), 0, Math.PI * 2);
      g.fill();
    }
  }
}

function makeUspsa(cx, cy, slot) {
  return { id: nextId++, kind: 'uspsa', slot, cx, cy, hasHead: true, alive: true, mover: null };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
