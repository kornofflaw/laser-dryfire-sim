// popups.js — hinged pop-up targets behind a dirt mound.
// ---------------------------------------------------------------------------
// Each lane has a cardboard USPSA target on a hinge hidden behind the mound.
// raise() flips it up; it stays up for its exposure time, then drops. A hit
// knocks it down early. While it is rotating, the visible height is
// sin(angle) of the full height (it's tipping toward you), and hit testing
// uses exactly that squashed shape. Rounds that hit the mound are misses.
//
// Each raise() creates an exposure record the runner can read:
//   { lane, raisedAt, hitAt, expired, reaction }  (times in seconds)

import { CONFIG } from './config.js';
import { drawUspsa, classifyUspsa, USPSA_ASPECT } from './uspsa.js';
import { pattern } from './scenery.js';
import { clack } from './audio.js';

const C = () => CONFIG.popup;
const HALF_PI = Math.PI / 2;

export class PopupBank {
  constructor() {
    this.auto = false; // free practice: raise targets at random
    this.reset();
  }

  reset() {
    this.lanes = C().lanes.map((x, i) => ({ i, x, state: 'down', a: 0, t0: 0, until: 0, exposure: null, holes: [] }));
    this.exposures = [];
    this.nextAuto = 0.6;
  }

  size(H) {
    const h = C().heightFrac * H;
    return { h, w: h * USPSA_ASPECT };
  }

  raise(laneIndex, exposureSec, nowSec) {
    const L = this.lanes[laneIndex];
    if (!L || L.state !== 'down') return null;
    const rec = { lane: laneIndex, raisedAt: nowSec, hitAt: null, expired: false, reaction: null };
    L.state = 'rising';
    L.t0 = nowSec;
    L.until = nowSec + C().riseTime + exposureSec;
    L.exposure = rec;
    L.holes = [];
    this.exposures.push(rec);
    clack();
    return rec;
  }

  get anyUp() { return this.lanes.some(L => L.state !== 'down'); }
  downLanes() { return this.lanes.filter(L => L.state === 'down').map(L => L.i); }

  drop(L, nowSec) {
    if (L.state === 'falling' || L.state === 'down') return;
    L.state = 'falling';
    L.t0 = nowSec;
    L.fromA = L.a;
  }

  update(dt, nowSec) {
    const P = C();
    for (const L of this.lanes) {
      if (L.state === 'rising') {
        L.a = Math.min(1, (nowSec - L.t0) / P.riseTime);
        if (L.a >= 1) L.state = 'up';
      }
      if ((L.state === 'up' || L.state === 'rising') && nowSec >= L.until) {
        if (L.exposure && L.exposure.hitAt == null) L.exposure.expired = true;
        this.drop(L, nowSec);
      }
      if (L.state === 'falling') {
        L.a = Math.max(0, L.fromA - (nowSec - L.t0) / P.fallTime);
        if (L.a <= 0) { L.state = 'down'; L.exposure = null; }
      }
    }
    // Free practice: keep a few targets popping at random.
    if (this.auto && nowSec >= this.nextAuto) {
      const up = this.lanes.filter(L => L.state !== 'down').length;
      const free = this.downLanes();
      if (up < P.freeMaxUp && free.length) {
        const lane = free[Math.floor(Math.random() * free.length)];
        this.raise(lane, rand(...P.freeExposure), nowSec);
      }
      this.nextAuto = nowSec + rand(...P.freeGap);
    }
  }

  // Returns { lane, zone } for a hit, { mound: true } for the mound, or null.
  hitTest(px, py, W, H) {
    const P = C();
    const moundTop = P.moundY * H;
    if (py >= moundTop) return py <= 0.86 * H ? { mound: true } : null;
    const { h } = this.size(H);
    const hinge = P.hingeY * H;
    const k = CONFIG.uspsa.height / h; // cm per px
    for (const L of this.lanes) {
      if (L.state === 'down' || L.state === 'falling') continue;
      const s = Math.sin(L.a * HALF_PI);
      if (s < P.hittableAbove) continue;
      const x = (px - L.x * W) * k;
      const y = ((hinge - py) / s) * k - CONFIG.uspsa.height / 2; // target bottom sits on the hinge
      const zone = classifyUspsa(x, y);
      if (zone) return { lane: L.i, zone };
    }
    return null;
  }

  hit(laneIndex, px, py, W, H, nowSec, tMs) {
    const L = this.lanes[laneIndex];
    if (L.exposure && L.exposure.hitAt == null) {
      L.exposure.hitAt = nowSec;
      L.exposure.reaction = tMs / 1000 - L.exposure.raisedAt;
    }
    // Store the hole in the target's unsquashed frame.
    const sc = Math.max(0.05, Math.sin(L.a * HALF_PI));
    L.holes.push({ dx: px - L.x * W, dy: (py - C().hingeY * H) / sc });
    this.drop(L, nowSec);
  }

  draw(g, W, H) {
    const P = C();
    const { h } = this.size(H);
    const hinge = P.hingeY * H;
    for (const L of this.lanes) {
      if (L.a <= 0.001) continue;
      const s = Math.sin(L.a * HALF_PI);
      g.save();
      g.translate(L.x * W, hinge);
      g.scale(1, s);
      drawUspsa(g, 0, -h / 2, h, {});
      // Holes ride on the target face (squashed with it as it falls).
      for (const hole of L.holes) {
        g.fillStyle = 'rgba(230,205,160,0.9)';
        g.beginPath();
        g.arc(hole.dx, hole.dy, Math.max(3, H * 0.0075), 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#0d0b09';
        g.beginPath();
        g.arc(hole.dx, hole.dy, Math.max(2.2, H * 0.0055), 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }
    drawMound(g, W, H, P.moundY * H, 0.86 * H);
  }
}

// Low dirt mound across the range with a timber edge, hiding the lifters.
function drawMound(g, W, H, top, floor) {
  g.save();
  g.beginPath();
  g.moveTo(0, floor);
  g.lineTo(0, top + 6);
  for (let x = 0; x <= W; x += W / 40) g.lineTo(x, top + Math.sin(x * 0.05) * 2);
  g.lineTo(W, floor);
  g.closePath();
  g.fillStyle = pattern(g, 'dirt');
  g.fill();
  const sh = g.createLinearGradient(0, top, 0, floor);
  sh.addColorStop(0, 'rgba(255,235,205,0.18)');
  sh.addColorStop(1, 'rgba(0,0,0,0.3)');
  g.fillStyle = sh;
  g.fill();
  g.fillStyle = pattern(g, 'wood');
  g.fillRect(0, top - 4, W, 8);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(0, top + 4, W, 3);
  g.restore();
}

const rand = (a, b) => a + Math.random() * (b - a);
