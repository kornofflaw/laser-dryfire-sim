// star.js — a Texas Star steel spinner with real rigid-body physics.
// ---------------------------------------------------------------------------
// Five 8" plates on arms 72 degrees apart around a free-spinning hub. With all
// five plates on, gravity's torque cancels out and the star sits still. Each
// plate shot off leaves the wheel unbalanced, so the heavy side swings down:
// the star rocks, spins, and the remaining plates get harder to hit.
//
// Physics (SI units, then scaled to pixels for drawing):
//   angle  = rotation of arm 0, radians, clockwise from straight up (screen)
//   torque = sum over plates still on: m * g * r * sin(angle_i)
//   inertia = hub + sum over plates still on: m * r^2
//   angularAccel = torque / inertia - damping * angularVelocity
// A plate knocked off keeps the velocity it had on the arm, then falls.

import { CONFIG } from './config.js';

const N = 5;
const STEP = 1 / 240; // physics substep (seconds)

export class TexasStar {
  constructor() {
    this.cx = 0.5;   // hub position, normalized screen coords
    this.cy = 0.44;
    this.reset();
  }

  reset() {
    this.angle = 0;
    this.omega = 0;
    this.plates = Array.from({ length: N }, () => ({ on: true }));
    this.falling = [];
    this.sparks = [];
    this.clearedAt = null;
  }

  get platesLeft() { return this.plates.filter(p => p.on).length; }

  // Pixels per metre, from the star's on-screen size.
  scale(H) {
    const S = CONFIG.star;
    return (S.heightFrac * H) / (2 * (S.armLength + S.plateRadius));
  }

  update(dt, W, H, nowSec) {
    const S = CONFIG.star;
    let t = dt;
    while (t > 1e-9) {
      const h = Math.min(STEP, t);
      t -= h;
      let torque = 0;
      let inertia = S.hubInertia;
      this.plates.forEach((p, i) => {
        if (!p.on) return;
        const a = this.angle + (i * 2 * Math.PI) / N;
        torque += S.plateMass * S.gravity * S.armLength * Math.sin(a);
        inertia += S.plateMass * S.armLength * S.armLength;
      });
      const alpha = torque / inertia - S.damping * this.omega;
      this.omega += alpha * h;
      this.angle += this.omega * h;
    }
    this.angle %= Math.PI * 2;

    // Falling plates: simple projectile motion in pixels.
    const g = S.gravity * this.scale(H);
    for (const f of this.falling) {
      f.vy += g * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot += f.vrot * dt;
    }
    this.falling = this.falling.filter(f => f.y < H + 100);
    this.sparks = this.sparks.filter(s => nowSec - s.born < 0.25);
  }

  platePos(i, W, H) {
    const k = this.scale(H) * CONFIG.star.armLength;
    const a = this.angle + (i * 2 * Math.PI) / N;
    return { x: this.cx * W + k * Math.sin(a), y: this.cy * H - k * Math.cos(a), a };
  }

  // Returns { plate: i } for a plate hit, { frame: true } for the hub/arms/post,
  // or null for a clean miss.
  hitTest(px, py, W, H) {
    const s = this.scale(H);
    const pr = CONFIG.star.plateRadius * s;
    for (let i = 0; i < N; i++) {
      if (!this.plates[i].on) continue;
      const p = this.platePos(i, W, H);
      if (Math.hypot(px - p.x, py - p.y) <= pr) return { plate: i };
    }
    const hx = this.cx * W, hy = this.cy * H;
    const armHalf = 0.018 * s * 2;
    if (Math.hypot(px - hx, py - hy) <= 0.07 * s) return { frame: true };
    for (let i = 0; i < N; i++) {
      const p = this.platePos(i, W, H);
      if (distToSegment(px, py, hx, hy, p.x, p.y) <= armHalf) return { frame: true };
    }
    if (Math.abs(px - hx) <= 0.03 * s && py > hy && py < H * 0.86) return { frame: true };
    return null;
  }

  // A plate was hit: it comes off the arm with the arm's velocity at that point.
  knockOff(i, px, py, W, H, nowSec) {
    const plate = this.plates[i];
    if (!plate.on) return;
    plate.on = false;
    const p = this.platePos(i, W, H);
    const r = this.scale(H) * CONFIG.star.armLength;
    // Tangential velocity of a point on a clockwise-rotating arm (screen coords).
    const vx = r * this.omega * Math.cos(p.a);
    const vy = r * this.omega * Math.sin(p.a);
    this.falling.push({
      x: p.x, y: p.y, vx: vx + (Math.random() - 0.5) * 40, vy: vy - 30,
      rot: 0, vrot: (Math.random() - 0.5) * 8,
      mark: { dx: px - p.x, dy: py - p.y },
    });
    if (this.platesLeft === 0) this.clearedAt = nowSec;
  }

  spark(px, py, nowSec) { this.sparks.push({ x: px, y: py, born: nowSec }); }

  draw(g, W, H, nowSec) {
    const s = this.scale(H);
    const hx = this.cx * W, hy = this.cy * H;
    const floor = H * 0.86;
    const pr = CONFIG.star.plateRadius * s;

    // Post and base.
    g.save();
    const postW = 0.06 * s;
    const postGrad = g.createLinearGradient(hx - postW / 2, 0, hx + postW / 2, 0);
    postGrad.addColorStop(0, '#2a2d31');
    postGrad.addColorStop(0.5, '#565b62');
    postGrad.addColorStop(1, '#25282c');
    g.fillStyle = postGrad;
    g.fillRect(hx - postW / 2, hy, postW, floor - hy);
    g.fillStyle = '#2f3237';
    g.beginPath();
    g.moveTo(hx - 0.32 * s, floor + 4);
    g.lineTo(hx + 0.32 * s, floor + 4);
    g.lineTo(hx + 0.12 * s, floor - 0.05 * s);
    g.lineTo(hx - 0.12 * s, floor - 0.05 * s);
    g.closePath();
    g.fill();

    // Arms (drawn even where the plate is gone; the empty hanger stays).
    g.lineCap = 'round';
    for (let i = 0; i < N; i++) {
      const p = this.platePos(i, W, H);
      g.strokeStyle = '#1f2226';
      g.lineWidth = 0.05 * s;
      line(g, hx, hy, p.x, p.y);
      g.strokeStyle = '#4b5057';
      g.lineWidth = 0.028 * s;
      line(g, hx, hy, p.x, p.y);
      if (!this.plates[i].on) {
        // Empty hanger bracket at the arm tip.
        g.fillStyle = '#3a3e44';
        g.beginPath();
        g.arc(p.x, p.y, 0.03 * s, 0, Math.PI * 2);
        g.fill();
      }
    }

    // Hub.
    const hubGrad = g.createRadialGradient(hx - 0.02 * s, hy - 0.02 * s, 0, hx, hy, 0.08 * s);
    hubGrad.addColorStop(0, '#7a8089');
    hubGrad.addColorStop(1, '#2b2e33');
    g.fillStyle = hubGrad;
    g.beginPath();
    g.arc(hx, hy, 0.08 * s, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#16181b';
    g.beginPath();
    g.arc(hx, hy, 0.02 * s, 0, Math.PI * 2);
    g.fill();
    // Bolt heads around the hub, turning with the star.
    g.fillStyle = '#8b9199';
    for (let i = 0; i < N; i++) {
      const a = this.angle + (i * 2 * Math.PI) / N + Math.PI / N;
      g.beginPath();
      g.arc(hx + Math.sin(a) * 0.05 * s, hy - Math.cos(a) * 0.05 * s, 0.009 * s, 0, Math.PI * 2);
      g.fill();
    }

    // Plates still on the arms.
    for (let i = 0; i < N; i++) {
      if (!this.plates[i].on) continue;
      const p = this.platePos(i, W, H);
      drawPlate(g, p.x, p.y, pr, p.a, null);
    }
    g.restore();

    // Plates in the air.
    for (const f of this.falling) drawPlate(g, f.x, f.y, pr, f.rot, f.mark);

    // Sparks where a round struck the frame.
    for (const sp of this.sparks) {
      const k = 1 - (nowSec - sp.born) / 0.25;
      g.strokeStyle = `rgba(255,210,120,${k})`;
      g.lineWidth = 2;
      for (let j = 0; j < 6; j++) {
        const a = (j / 6) * Math.PI * 2 + sp.born;
        const r1 = 3, r2 = 3 + 14 * (1 - k * 0.5);
        line(g, sp.x + Math.cos(a) * r1, sp.y + Math.sin(a) * r1, sp.x + Math.cos(a) * r2, sp.y + Math.sin(a) * r2);
      }
    }
  }
}

// A painted steel plate: off-white paint, darker bevelled rim, a hanger tab
// toward the hub, and (once hit) a grey lead splash where the round struck.
function drawPlate(g, x, y, r, angle, mark) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.fillStyle = '#2b2e33';
  g.fillRect(-r * 0.18, r * 0.55, r * 0.36, r * 0.7); // hanger tab (points to hub)
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fillStyle = '#8d8f8a';
  g.fill();
  const grad = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r * 0.95);
  grad.addColorStop(0, '#fbfaf5');
  grad.addColorStop(1, '#d9d6cc');
  g.beginPath();
  g.arc(0, 0, r * 0.9, 0, Math.PI * 2);
  g.fillStyle = grad;
  g.fill();
  // Bolt through the hanger, and faint grey marks from old hits under the paint.
  g.fillStyle = '#6d7075';
  g.beginPath();
  g.arc(0, r * 0.62, r * 0.09, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(120,120,115,0.18)';
  for (const [mx, my, mr] of [[-0.35, -0.2, 0.12], [0.25, 0.1, 0.09], [-0.05, 0.35, 0.07], [0.4, -0.35, 0.06]]) {
    g.beginPath();
    g.arc(mx * r, my * r, mr * r, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  if (mark) {
    g.save();
    g.translate(x, y);
    g.rotate(angle);
    const mx = mark.dx, my = mark.dy;
    g.fillStyle = 'rgba(95,98,102,0.9)';
    g.beginPath();
    for (let j = 0; j < 10; j++) {
      const a = (j / 10) * Math.PI * 2;
      const rr = (j % 2 ? 0.12 : 0.28) * r;
      g.lineTo(mx + Math.cos(a) * rr, my + Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
    g.restore();
  }
}

function line(g, x1, y1, x2, y2) {
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
