// actors.js — the people in judgment scenarios.
// ---------------------------------------------------------------------------
// Drawing and hit-testing for one person, from ONE shared set of shapes so a
// hit lands exactly where the body is drawn. Geometry is in units of the
// person's height h, relative to their centre, with v POSITIVE UP:
//   top of head ~ +0.495, soles = -0.5.
//
// Poses:
//   back       turned away: back of the head, hands hidden in front
//   empty      facing, hands empty at the sides
//   gun        facing, pistol held down by the thigh      (a threat)
//   phone      facing, phone held up at chest height, screen lit
//   wallet     facing, wallet held at the waist
//   surrender  facing, both hands up above the head, empty
// Only `gun` is a threat. Everything else is a no-shoot at that moment.

export const POSES = ['back', 'empty', 'gun', 'phone', 'wallet', 'surrender'];

export const SHIRTS = ['#4a6fa5', '#8c3b3b', '#3f7d4f', '#6d5a8c', '#b0813a', '#5b6770', '#2f6f73', '#c8c3b5'];
export const JACKETS = [null, null, '#2d3138', '#5a4632', '#3d4a5c', '#6b6f45'];
export const SKINS = ['#e6b996', '#c68e5f', '#8d5a3b', '#f1c9a5', '#a8714a', '#6e4630'];
export const HAIRS = ['#2b1d14', '#5a3a22', '#b08a4f', '#1a1a1a', '#7a7a7a', '#8a4a24'];

const HEAD = { u: 0, v: 0.43, rx: 0.056, ry: 0.066 };
// Torso outline (shoulders wider than the waist).
const TORSO = [[-0.13, 0.3], [0.13, 0.3], [0.142, 0.27], [0.112, 0.03], [0.1, -0.01], [-0.1, -0.01], [-0.112, 0.03], [-0.142, 0.27]];
const A_BOX = { u0: -0.065, u1: 0.065, v0: 0.08, v1: 0.27 };
const SHOULDERS = [[-0.125, 0.285], [0.125, 0.285]];

// Elbow and hand for each arm (viewer's left arm first) per pose.
function arms(pose) {
  switch (pose) {
    case 'surrender': return [[[-0.21, 0.37], [-0.18, 0.53]], [[0.21, 0.37], [0.18, 0.53]]];
    case 'gun': return [[[-0.17, 0.15], [-0.2, 0.02]], [[0.15, 0.13], [0.145, -0.03]]];
    case 'phone': return [[[-0.16, 0.12], [-0.055, 0.2]], [[0.15, 0.13], [0.145, -0.03]]];
    case 'wallet': return [[[-0.16, 0.12], [-0.07, 0.09]], [[0.15, 0.13], [0.145, -0.03]]];
    case 'back': return [[[-0.155, 0.13], [-0.11, 0.0]], [[0.155, 0.13], [0.11, 0.0]]];
    default: return [[[-0.155, 0.13], [-0.148, -0.03]], [[0.155, 0.13], [0.148, -0.03]]];
  }
}

const ARM_R = 0.024; // half thickness of an arm

// Returns 'Head' | 'A' | 'C' | 'D' | null for a point in person-local units.
export function actorZone(pose, u, v) {
  if (((u - HEAD.u) / HEAD.rx) ** 2 + ((v - HEAD.v) / HEAD.ry) ** 2 <= 1) return 'Head';
  // Arms drawn in front of the body (phone, wallet) take the hit first.
  const armSegs = arms(pose).flatMap((arm, i) => [[SHOULDERS[i], arm[0]], [arm[0], arm[1]]]);
  const onArm = armSegs.some(([a, b]) => segDist(u, v, a[0], a[1], b[0], b[1]) <= ARM_R) ||
    arms(pose).some(([, hnd]) => Math.hypot(u - hnd[0], v - hnd[1]) <= 0.026);
  if (u >= A_BOX.u0 && u <= A_BOX.u1 && v >= A_BOX.v0 && v <= A_BOX.v1) return 'A';
  if (pointInPoly(u, v, TORSO)) return 'C';
  if (Math.abs(u) <= 0.024 && v >= 0.3 && v <= 0.37) return 'C'; // neck
  if (onArm) return 'D';
  // Legs.
  if (v < -0.01 && v >= -0.5) {
    const half = 0.096 - 0.02 * ((-0.01 - v) / 0.49); // trousers taper toward the ankle
    if (Math.abs(u) <= half && !(Math.abs(u) < 0.01 && v < -0.12)) return 'D';
  }
  return null;
}

// Draw one person. x, y = centre in px; h = height in px.
export function drawActor(g, a, x, y, h) {
  const P = (u, v) => [x + u * h, y - v * h];
  const pose = a.pose;
  const back = pose === 'back';
  const [armL, armR] = arms(pose);
  const lightX = x - 0.1 * h;
  g.save();
  g.globalAlpha = a.alpha ?? 1;

  // Floor shadow.
  const sh = g.createRadialGradient(x, y + 0.5 * h, 0, x, y + 0.5 * h, 0.2 * h);
  sh.addColorStop(0, 'rgba(0,0,0,0.4)');
  sh.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = sh;
  g.beginPath();
  g.ellipse(x, y + 0.5 * h, 0.2 * h, 0.03 * h, 0, 0, Math.PI * 2);
  g.fill();

  // Legs (trousers) and shoes.
  for (const side of [-1, 1]) {
    const inner = side * 0.01, outer = side * 0.096;
    g.beginPath();
    g.moveTo(...P(inner, -0.01));
    g.lineTo(...P(outer, -0.01));
    g.lineTo(...P(side * 0.078, -0.47));
    g.lineTo(...P(side * 0.022, -0.47));
    g.closePath();
    g.fillStyle = shade(g, a.pants, x + side * 0.05 * h, h, lightX);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(...P(side > 0 ? 0.055 : -0.06, -0.12), 0.005 * h, 0.3 * h); // crease
    g.fillStyle = '#1a1714';
    g.beginPath();
    g.ellipse(...P(side * 0.05 + (back ? 0 : side * 0.008), -0.485), 0.042 * h, 0.018 * h, 0, 0, Math.PI * 2);
    g.fill();
  }
  // Belt.
  g.fillStyle = '#1f1b17';
  g.fillRect(...P(-0.104, 0.01), 0.208 * h, 0.022 * h);

  // Arms behind the body when hanging down.
  const armsInFront = pose === 'phone' || pose === 'wallet' || back;
  if (!armsInFront) drawArms(g, a, P, [armL, armR], h, back, lightX);

  // Torso.
  g.beginPath();
  TORSO.forEach(([u, v], i) => (i ? g.lineTo(...P(u, v)) : g.moveTo(...P(u, v))));
  g.closePath();
  g.fillStyle = shade(g, a.shirt, x, h, lightX);
  g.fill();
  if (a.jacket) {
    // Open jacket: two front panels over the shirt (full back when turned away).
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(...P(side * 0.13, 0.3));
      g.lineTo(...P(side * 0.142, 0.27));
      g.lineTo(...P(side * 0.112, 0.03));
      g.lineTo(...P(side * 0.1, -0.02));
      g.lineTo(...P(back ? 0 : side * 0.04, -0.02));
      g.lineTo(...P(back ? 0 : side * 0.03, 0.3));
      g.closePath();
      g.fillStyle = shade(g, a.jacket, x + side * 0.08 * h, h, lightX);
      g.fill();
    }
  }
  // Fabric folds.
  g.strokeStyle = 'rgba(0,0,0,0.12)';
  g.lineWidth = Math.max(1, 0.004 * h);
  for (const [u1, v1, u2, v2] of [[-0.06, 0.08, -0.02, 0.16], [0.07, 0.05, 0.03, 0.14], [-0.09, 0.2, -0.05, 0.25]]) {
    g.beginPath(); g.moveTo(...P(u1, v1)); g.lineTo(...P(u2, v2)); g.stroke();
  }
  if (!back && !a.jacket) {
    // Collar.
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.beginPath();
    g.moveTo(...P(-0.045, 0.3)); g.lineTo(...P(0.045, 0.3)); g.lineTo(...P(0, 0.255)); g.closePath();
    g.fill();
  }

  // Neck.
  g.fillStyle = shade(g, a.skin, x, h, lightX);
  g.fillRect(...P(-0.024, 0.375), 0.048 * h, 0.08 * h);
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.fillRect(...P(-0.024, 0.33), 0.048 * h, 0.03 * h);

  drawHead(g, a, P, h, back, lightX);

  if (armsInFront) drawArms(g, a, P, [armL, armR], h, back, lightX);
  g.restore();
}

function drawArms(g, a, P, armPair, h, back, lightX) {
  g.lineCap = 'round';
  g.lineJoin = 'round';
  armPair.forEach(([elbow, hand], i) => {
    const sleeve = a.jacket || a.shirt;
    g.strokeStyle = shade(g, sleeve, P(...elbow)[0], h, lightX);
    g.lineWidth = ARM_R * 2 * h;
    g.beginPath();
    g.moveTo(...P(...SHOULDERS[i]));
    g.lineTo(...P(...elbow));
    g.lineTo(...P(hand[0], hand[1] + 0.015));
    g.stroke();
    if (back) return; // hands hidden in front of the body
    const [hx, hy] = P(...hand);
    g.fillStyle = a.skin;
    g.beginPath();
    g.ellipse(hx, hy, 0.021 * h, 0.026 * h, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.15)';
    g.beginPath();
    g.ellipse(hx + 0.006 * h, hy + 0.006 * h, 0.012 * h, 0.016 * h, 0, 0, Math.PI * 2);
    g.fill();
    if (i === 0) {
      if (a.pose === 'gun') drawPistol(g, hx, hy, h);
      else if (a.pose === 'phone') drawPhone(g, hx, hy, h);
      else if (a.pose === 'wallet') drawWallet(g, hx, hy, h);
    }
  });
}

function drawHead(g, a, P, h, back, lightX) {
  const [hx, hy] = P(HEAD.u, HEAD.v);
  const rx = HEAD.rx * h, ry = HEAD.ry * h;
  // Ears.
  g.fillStyle = a.skin;
  for (const s of [-1, 1]) {
    g.beginPath();
    g.ellipse(hx + s * rx * 0.98, hy + ry * 0.05, rx * 0.2, ry * 0.26, 0, 0, Math.PI * 2);
    g.fill();
  }
  // Face / back of head.
  g.beginPath();
  g.ellipse(hx, hy, rx, ry, 0, 0, Math.PI * 2);
  g.fillStyle = back ? a.hair : shade(g, a.skin, hx, h, lightX);
  g.fill();
  if (back) {
    // Hairline at the nape and a little texture.
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.beginPath();
    g.ellipse(hx - rx * 0.3, hy - ry * 0.35, rx * 0.4, ry * 0.3, -0.4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = a.skin;
    g.beginPath();
    g.ellipse(hx, hy + ry * 0.95, rx * 0.55, ry * 0.12, 0, 0, Math.PI);
    g.fill();
    return;
  }
  // Hair.
  g.fillStyle = a.hair;
  g.beginPath();
  g.ellipse(hx, hy - ry * 0.25, rx * 1.04, ry * 0.8, 0, Math.PI * 0.98, Math.PI * 2.02);
  g.closePath();
  g.fill();
  // Brows, eyes, nose shadow, mouth.
  g.fillStyle = 'rgba(30,20,15,0.8)';
  for (const s of [-1, 1]) {
    g.fillRect(hx + s * rx * 0.42 - rx * 0.2, hy - ry * 0.12, rx * 0.4, ry * 0.07);
    g.beginPath();
    g.ellipse(hx + s * rx * 0.4, hy + ry * 0.06, rx * 0.1, ry * 0.07, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.beginPath();
  g.moveTo(hx, hy + ry * 0.05);
  g.lineTo(hx + rx * 0.14, hy + ry * 0.38);
  g.lineTo(hx - rx * 0.05, hy + ry * 0.4);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(80,35,30,0.7)';
  g.lineWidth = Math.max(1, 0.003 * h);
  g.beginPath();
  g.moveTo(hx - rx * 0.28, hy + ry * 0.58);
  g.lineTo(hx + rx * 0.28, hy + ry * 0.58);
  g.stroke();
}

// Colour with a left-lit shading gradient.
function shade(g, color, cx, h, lightX) {
  const grad = g.createLinearGradient(cx - 0.15 * h, 0, cx + 0.15 * h, 0);
  grad.addColorStop(0, mix(color, '#ffffff', 0.12));
  grad.addColorStop(0.55, color);
  grad.addColorStop(1, mix(color, '#000000', 0.3));
  return grad;
}

function mix(hex, other, t) {
  const p = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
  const [a, b] = [p(hex), p(other)];
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
}

// Semi-auto pistol in profile, muzzle down along the thigh.
function drawPistol(g, x, y, h) {
  g.save();
  g.translate(x, y);
  g.rotate(1.25);
  const s = h;
  g.fillStyle = '#121212';
  g.fillRect(-0.01 * s, -0.018 * s, 0.1 * s, 0.028 * s);      // slide
  g.fillStyle = '#1e1e1e';
  g.beginPath();                                               // grip, angled back
  g.moveTo(-0.012 * s, 0.006 * s);
  g.lineTo(0.02 * s, 0.006 * s);
  g.lineTo(0.008 * s, 0.058 * s);
  g.lineTo(-0.024 * s, 0.054 * s);
  g.closePath();
  g.fill();
  g.strokeStyle = '#121212';                                   // trigger guard
  g.lineWidth = 0.005 * s;
  g.beginPath();
  g.arc(0.03 * s, 0.014 * s, 0.011 * s, 0, Math.PI);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.18)';                      // slide highlight
  g.fillRect(-0.008 * s, -0.016 * s, 0.096 * s, 0.004 * s);
  g.restore();
}

function drawPhone(g, x, y, h) {
  g.save();
  g.translate(x, y - 0.012 * h);
  g.rotate(-0.12);
  g.fillStyle = '#16181b';
  roundRect(g, -0.02 * h, -0.045 * h, 0.04 * h, 0.075 * h, 0.006 * h);
  g.fill();
  const scr = g.createLinearGradient(0, -0.04 * h, 0, 0.025 * h);
  scr.addColorStop(0, '#9fdcff');
  scr.addColorStop(1, '#3d8fd6');
  g.fillStyle = scr;
  g.fillRect(-0.016 * h, -0.04 * h, 0.032 * h, 0.063 * h);
  g.restore();
}

function drawWallet(g, x, y, h) {
  g.save();
  g.translate(x, y - 0.01 * h);
  g.rotate(-0.08);
  g.fillStyle = '#6b4423';
  roundRect(g, -0.034 * h, -0.024 * h, 0.068 * h, 0.046 * h, 0.006 * h);
  g.fill();
  g.strokeStyle = '#4a2e17';
  g.lineWidth = Math.max(1, 0.003 * h);
  g.beginPath();
  g.moveTo(-0.034 * h, 0.0);
  g.lineTo(0.034 * h, 0.0);
  g.stroke();
  g.restore();
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

function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
