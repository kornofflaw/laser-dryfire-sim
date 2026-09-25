// range.js — the targets on screen: layout, movement, drawing, and hit testing.
// ---------------------------------------------------------------------------
// Ports ScoringTarget.cs, Target.cs, TargetSpawner.cs, MovingTarget.cs and
// HitMarker.cs from the old Unity project.
//
// scoreShot() is PURE classification: it never adds points. Points are added
// only by Game.registerScoredShot() (the single scoring path). onHit() is the
// target's REACTION (bullet hole, pop-up disappearing) and never scores.

import { CONFIG } from './config.js';

export const LAYOUTS = {
  bay: 'Bay: 3 static targets',
  popup: 'Pop-ups: appear, drop when hit',
  movers: 'Movers: moving targets',
};

const PATTERNS = ['PingPong', 'Crossing', 'SineWave'];

let nextId = 1;

export class Range {
  constructor() {
    this.layout = 'bay';
    this.targets = [];
    this.holes = [];
    this.spawnTimer = 0;
    this.width = 1;   // viewport size in CSS px, set by resize()
    this.height = 1;
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  setLayout(layout) {
    this.layout = LAYOUTS[layout] ? layout : 'bay';
    this.reset();
  }

  // Clear holes and rebuild the targets for the current layout.
  reset() {
    this.targets = [];
    this.holes = [];
    this.spawnTimer = CONFIG.targets.spawnInterval; // spawn the first one immediately
    if (this.layout === 'bay') {
      for (const cx of [0.25, 0.5, 0.75]) this.targets.push(makeTarget(cx, 0.52));
    }
  }

  // Target size in CSS px (depends on viewport height so it scales on any screen).
  // On narrow (portrait) screens the width cap wins so the 3 bay targets don't overlap.
  targetSizePx() {
    const T = CONFIG.targets;
    const h = Math.min(T.heightFrac * this.height, (T.maxWidthFrac * this.width) / T.aspect);
    return { w: h * T.aspect, h };
  }

  update(dt, nowSec) {
    const T = CONFIG.targets;

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
    this.targets = this.targets.filter(t => t.alive);

    // Spawner (pop-ups and movers).
    if (this.layout !== 'bay') {
      this.spawnTimer += dt;
      if (this.spawnTimer >= T.spawnInterval && this.targets.length < T.maxAlive) {
        this.spawnTimer = 0;
        this.spawnOne();
      }
    }

    // Bullet holes fade out.
    this.holes = this.holes.filter(h => nowSec - h.born < CONFIG.targets.holeLifetime);
  }

  spawnOne() {
    const a = CONFIG.targets.spawnArea;
    const t = makeTarget(a.x + Math.random() * a.w, a.y + Math.random() * a.h);
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
  // Returns { zone, points, targetId, local: {x, y} }.
  scoreShot(nx, ny) {
    const { w, h } = this.targetSizePx();
    const px = nx * this.width, py = ny * this.height;
    // Topmost (last drawn) target wins if targets overlap.
    for (let i = this.targets.length - 1; i >= 0; i--) {
      const t = this.targets[i];
      const lx = (px - t.cx * this.width) / (w / 2);
      const ly = -(py - t.cy * this.height) / (h / 2); // positive = up the target
      if (Math.abs(lx) > 1 || Math.abs(ly) > 1) continue;
      const zone = classify(lx, ly, t.hasHead);
      return { zone, points: CONFIG.points[zone], targetId: t.id, local: { x: lx, y: ly } };
    }
    return { zone: 'Miss', points: 0, targetId: null, local: null };
  }

  // A target's REACTION to a hit. Never adds score.
  onShot(nx, ny, score, nowSec) {
    this.holes.push({ nx, ny, born: nowSec, miss: score.zone === 'Miss' });
    if (score.targetId != null && this.layout !== 'bay') {
      const t = this.targets.find(x => x.id === score.targetId);
      if (t) t.alive = false;
      this.targets = this.targets.filter(x => x.alive);
    }
  }

  draw(g, nowSec, showZones) {
    const W = this.width, H = this.height;
    const { w, h } = this.targetSizePx();

    for (const t of this.targets) {
      const x = t.cx * W - w / 2;
      const y = t.cy * H - h / 2;
      drawTarget(g, x, y, w, h, t.hasHead, showZones);
    }

    const T = CONFIG.targets;
    const r = Math.max(3, h * 0.018);
    for (const hole of this.holes) {
      const age = nowSec - hole.born;
      const remaining = T.holeLifetime - age;
      const k = remaining < T.holeFade ? Math.max(0, remaining / T.holeFade) : 1;
      g.globalAlpha = k;
      g.beginPath();
      g.arc(hole.nx * W, hole.ny * H, r, 0, Math.PI * 2);
      g.fillStyle = hole.miss ? 'rgba(255,90,90,0.9)' : '#161310';
      g.fill();
      g.lineWidth = Math.max(1, r * 0.35);
      g.strokeStyle = hole.miss ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.85)';
      g.stroke();
      g.globalAlpha = 1;
    }
  }
}

function makeTarget(cx, cy) {
  return { id: nextId++, cx, cy, hasHead: true, alive: true, mover: null };
}

// Same order and numbers as ScoringTarget.ScoreHit: head is checked first so it
// wins where it overlaps the C rectangle.
function classify(lx, ly, hasHead) {
  const Z = CONFIG.zones;
  if (hasHead && Math.abs(lx) <= Z.headHalfWidth && ly >= Z.headBottom && ly <= Z.headTop) return 'Head';
  if (Math.abs(lx) <= Z.aHalfWidth && Math.abs(ly) <= Z.aHalfHeight) return 'A';
  if (Math.abs(lx) <= Z.cHalfWidth && Math.abs(ly) <= Z.cHalfHeight) return 'C';
  return 'D';
}

// Cardboard-coloured target with perforation-style zone lines.
function drawTarget(g, x, y, w, h, hasHead, showZones) {
  const Z = CONFIG.zones;
  const cx = x + w / 2, cy = y + h / 2;
  const hw = w / 2, hh = h / 2;
  // rect from zone fractions (fy measured upward from centre)
  const zoneRect = (fx, fyTop, fyBottom) => [cx - fx * hw, cy - fyTop * hh, 2 * fx * hw, (fyTop - fyBottom) * hh];

  g.save();
  g.shadowColor = 'rgba(0,0,0,0.45)';
  g.shadowBlur = h * 0.03;
  g.shadowOffsetY = h * 0.01;
  g.fillStyle = '#c9a36b';
  roundRect(g, x, y, w, h, w * 0.06);
  g.fill();
  g.restore();

  g.lineWidth = Math.max(1, h * 0.004);
  g.setLineDash([h * 0.012, h * 0.01]);
  g.strokeStyle = showZones ? 'rgba(60,30,10,0.85)' : 'rgba(60,30,10,0.45)';

  g.strokeRect(...zoneRect(Z.cHalfWidth, Z.cHalfHeight, -Z.cHalfHeight));
  g.strokeRect(...zoneRect(Z.aHalfWidth, Z.aHalfHeight, -Z.aHalfHeight));
  if (hasHead) g.strokeRect(...zoneRect(Z.headHalfWidth, Z.headTop - 0.02, Z.headBottom));
  g.setLineDash([]);

  if (showZones) {
    g.fillStyle = 'rgba(60,30,10,0.75)';
    g.font = `${Math.round(h * 0.05)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('A', cx, cy);
    g.fillText('C', cx, cy + (Z.aHalfHeight + Z.cHalfHeight) / 2 * hh);
    g.fillText('D', cx, cy + (Z.cHalfHeight + 1) / 2 * hh);
    if (hasHead) g.fillText('H', cx, cy - (Z.headBottom + Z.headTop) / 2 * hh);
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
