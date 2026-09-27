// interior3d.js — building blocks for realistic 3D interiors (office3d.js).
// ---------------------------------------------------------------------------
// Everything is drawn in code: canvas textures generated from tileable
// noise at about 1 mm a pixel (carpet tiles, fissured ceiling tiles, painted
// drywall, woven cubicle fabric, wood, stone and vinyl floor tiles, concrete,
// screens, whiteboard) and small models built from boxes and cylinders with
// physically based materials. Units are metres.
//
//   makeMaterials()                  the shared material set (userData.tile:
//                                    metres per repeat, for worldUV)
//   worldUV(geo, w, h, d, tile)      real-size texture on a box of any size
//   lateralFiles(M, opts)            a row of steel file cabinets (cover)
//   door(M, opts)                    framed door with a swinging leaf
//   workstation(M, opts)             desk, pedestal, monitors, keyboard, chair...
//   taskChair(M), plant(M), whiteboard(M), wallClock(M), exitSign(M),
//   troffer(M), extinguisher(M), copier(M)
//   blinds(M, width, height)         venetian blinds (one InstancedMesh)
//   outsideView(width, height)       city/sky backdrop seen through windows
//   mergeStatic(scene, opts)         merge everything that never moves into a
//                                    few meshes (one per material): far fewer draw calls
//
// Each builder returns a THREE.Group; `group.userData.solids` lists meshes
// that should stop rounds (walls, desks, doors), for the view's hit testing.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---- textures ----------------------------------------------------------------------
function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function texture(c, { repeat = [1, 1], srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 16; // (the GPU's maximum if lower) floors and ceilings stay sharp at a slant
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// ---- procedural noise (tileable) ----------------------------------------------------
// Value noise on a px x py lattice that wraps around, so the textures tile.
function lattice(px, py, seed) {
  const r = rng(seed), v = new Float32Array(px * py);
  for (let i = 0; i < v.length; i++) v[i] = r();
  return (x, y) => {
    const xf = Math.floor(x), yf = Math.floor(y), fx = x - xf, fy = y - yf;
    const x0 = ((xf % px) + px) % px, y0 = ((yf % py) + py) % py;
    const x1 = x0 + 1 === px ? 0 : x0 + 1, y1 = y0 + 1 === py ? 0 : y0 + 1;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = v[y0 * px + x0], b = v[y0 * px + x1], c = v[y1 * px + x0], d = v[y1 * px + x1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

// Fractal noise over a W x H texture (0..1, tiles): `cells` lattice cells
// across at the coarsest octave, doubling each octave, each `gain` as strong.
function fbm(W, H, cells, octaves, seed, gain = 0.5) {
  const out = new Float32Array(W * H);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const cx = cells * 2 ** o, cy = Math.max(1, Math.round(cx * H / W));
    const n = lattice(cx, cy, seed + o * 101), kx = cx / W, ky = cy / H;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[y * W + x] += n(x * kx, y * ky) * amp;
    total += amp;
    amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

// White noise per pixel (integer hash), 0..1.
function hash(x, y, s = 0) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// A canvas filled pixel by pixel: fn(x, y, data, i) writes data[i..i+2].
function paint(W, H, fn) {
  const [c, g] = canvas(W, H);
  const img = g.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    fn(x, y, d, i);
    d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// A normal map from a height field (0..1, wraps at the edges).
function normalMap(W, H, hgt, strength) {
  return paint(W, H, (x, y, d, i) => {
    const xl = x ? x - 1 : W - 1, xr = x + 1 === W ? 0 : x + 1, yu = y ? y - 1 : H - 1, yd = y + 1 === H ? 0 : y + 1;
    const dx = (hgt[y * W + xr] - hgt[y * W + xl]) * strength, dy = (hgt[yd * W + x] - hgt[yu * W + x]) * strength;
    const l = Math.hypot(dx, dy, 1);
    d[i] = (-dx / l * 0.5 + 0.5) * 255;
    d[i + 1] = (dy / l * 0.5 + 0.5) * 255;
    d[i + 2] = (1 / l * 0.5 + 0.5) * 255;
  });
}

// '#rrggbb' -> [r, g, b] 0..255 as written (the canvas is sRGB already).
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// Carpet tiles: 50 cm squares laid quarter-turned, heathered loop pile
// (rows of loops ~3 mm apart), a little soiling. One texture = 1 m (2 x 2
// tiles) at 1 mm a pixel.
function carpetCanvases() {
  const S = 1024, T = S / 2;
  const low = fbm(S, S, 3, 3, 301), mid = fbm(S, S, 48, 2, 302);
  const yarn = [rgb('#4d545d'), rgb('#5d6570'), rgb('#3c4148'), rgb('#7b848f')];
  const h = new Float32Array(S * S);
  const col = paint(S, S, (x, y, d, i) => {
    const k = y * S + x, turned = ((x < T ? 0 : 1) + (y < T ? 0 : 1)) % 2 === 1;
    const u = turned ? y : x, w = turned ? x : y;              // across the rows / along them
    const rib = 0.5 + 0.5 * Math.cos(u * 2.1);
    const loop = 0.5 + 0.5 * Math.cos(w * 2.4 + (u >> 2) * 1.7);
    const seam = x % T < 2 || y % T < 2 ? 0.6 : 1;
    const ht = rib * (0.55 + 0.45 * loop) * (0.75 + 0.25 * hash(x, y, 7)) * (0.8 + 0.4 * mid[k]) * seam;
    h[k] = ht;
    const pick = hash(x >> 1, y >> 1, 11);                     // heathered yarn, 2 mm flecks
    const c = yarn[pick < 0.45 ? 0 : pick < 0.8 ? 1 : pick < 0.97 ? 2 : 3];
    const tone = (0.78 + 0.34 * ht) * (0.9 + 0.2 * low[k]) * (turned ? 0.96 : 1.03) * seam;
    d[i] = c[0] * tone; d[i + 1] = c[1] * tone; d[i + 2] = c[2] * tone;
  });
  return [col, normalMap(S, S, h, 3)];
}

// Acoustic ceiling tile, 60 x 60 cm: fissured mineral fibre with pinholes,
// the white T-grid on two edges and a shadowed tile edge beside it.
function ceilingCanvases() {
  const S = 512, G = 17;
  const tone = fbm(S, S, 4, 3, 401), fis = fbm(S, S, 20, 3, 402), fine = fbm(S, S, 96, 1, 403);
  const h = new Float32Array(S * S);
  const col = paint(S, S, (x, y, d, i) => {
    const k = y * S + x, grid = x < G || y < G, edge = !grid && (x < G + 4 || y < G + 4);
    const r = 1 - Math.abs(2 * fis[k] - 1), crack = r > 0.95 ? (r - 0.95) / 0.05 : 0;
    const pin = !grid && hash(x, y, 5) < 0.006;
    h[k] = grid ? 1 : 0.8 - crack * 0.5 - (pin ? 0.3 : 0) + (fine[k] - 0.5) * 0.08 - (edge ? 0.2 : 0);
    const v = grid ? 247 : (233 + (tone[k] - 0.5) * 14 + (fine[k] - 0.5) * 10) * (1 - crack * 0.28) * (pin ? 0.8 : 1) * (edge ? 0.88 : 1);
    d[i] = v; d[i + 1] = v * 0.995; d[i + 2] = v * 0.975;
  });
  return [col, normalMap(S, S, h, 2.5)];
}

// Painted drywall, 1 m: faint blotches in the paint (a near-white map the
// wall colour multiplies) and a fine roller "orange peel" (normal map).
function drywallCanvases() {
  const S = 512;
  const blot = fbm(S, S, 3, 3, 501), peel = fbm(S, S, 128, 2, 502, 0.6);
  const col = paint(S, S, (x, y, d, i) => {
    const k = y * S + x, v = 247 + (blot[k] - 0.5) * 14 + (peel[k] - 0.5) * 6;
    d[i] = d[i + 1] = d[i + 2] = v;
  });
  return [col, normalMap(S, S, peel, 1.6)];
}

// Cubicle panel fabric, 50 cm: a plain weave of ~1.5 mm heathered threads.
function fabricCanvases(color) {
  const S = 512, base = rgb(color);
  const cloud = fbm(S, S, 6, 3, 601);
  const h = new Float32Array(S * S);
  const col = paint(S, S, (x, y, d, i) => {
    const k = y * S + x, cx = (x / 3) | 0, cy = (y / 3) | 0, over = (cx + cy) % 2 === 0;
    const across = over ? y % 3 : x % 3;                        // position across the thread
    const round = 1 - Math.abs(across - 1) * 0.5;
    const shade = hash(over ? cy : cx, over ? cx >> 2 : cy >> 2, over ? 13 : 17); // each thread's own shade, varying along it
    const fleck = hash(cx, cy, 19) < 0.03 ? 1.18 : 1;
    h[k] = (over ? 0.8 : 0.45) * round;
    const t = (0.88 + 0.18 * shade) * (0.94 + 0.12 * cloud[k]) * (0.87 + 0.18 * round) * fleck;
    d[i] = base[0] * t; d[i + 1] = base[1] * t; d[i + 2] = base[2] * t;
  });
  return [col, normalMap(S, S, h, 1.2)];
}

// Wood: growth lines warped by noise, darker latewood, fine pores along the
// grain. Lines run along x (or y with along: 'y').
function woodCanvas(W, H, light, dark, seed, { along = 'x', lines = 18, warp = 2.5 } = {}) {
  const n = fbm(W, H, 4, 3, seed), pore = fbm(W, H, along === 'x' ? 96 : 12, 2, seed + 7);
  const a = rgb(light), b = rgb(dark);
  return paint(W, H, (x, y, d, i) => {
    const k = y * W + x, across = along === 'x' ? y / H : x / W;
    const g = Math.pow(0.5 + 0.5 * Math.sin((across * lines + n[k] * warp) * Math.PI * 2), 6);
    const c = mix(a, b, Math.max(0, Math.min(1, g * 0.4 + (pore[k] - 0.5) * 0.3 + (n[k] - 0.5) * 0.2 + 0.15)));
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
  });
}

// Wood veneer with long straight grain (doors, desks in private offices).
function veneerCanvas(base, dark) {
  return woodCanvas(256, 1024, base, dark, 23, { along: 'y', lines: 36, warp: 0.7 });
}

// Light maple laminate for work surfaces.
function laminateCanvas() {
  return woodCanvas(1024, 512, '#dac9a9', '#b59670', 29, { along: 'x', lines: 30, warp: 1.2 });
}

// Polished stone floor tiles (the lobby): 50 cm tiles, 4 x 4 per 2 m
// texture; each tile its own shade and veining, thin grout lines.
export function stoneTileCanvas(a, b) {
  const S = 1024, T = S / 4;
  const cloud = fbm(S, S, 8, 4, 701), vein = fbm(S, S, 6, 4, 702);
  const A = rgb(a), B2 = rgb(b);
  return paint(S, S, (x, y, d, i) => {
    const tx = (x / T) | 0, ty = (y / T) | 0;
    // Each tile samples the noise somewhere else, so no two match.
    const ox = (x + tx * 311 + ty * 157) % S, oy = (y + ty * 263 + tx * 97) % S, k = oy * S + ox;
    const grout = x % T < 2 || y % T < 2;
    const r = 1 - Math.abs(2 * vein[k] - 1), v = r > 0.975 ? (r - 0.975) / 0.025 : 0;
    const c = mix(A, B2, hash(tx, ty, 3) * 0.6 + cloud[k] * 0.4);
    const t = grout ? 0.66 : (0.94 + (cloud[k] - 0.5) * 0.1) * (1 - v * 0.09);
    d[i] = c[0] * t; d[i + 1] = c[1] * t; d[i + 2] = c[2] * t;
  });
}

// Vinyl composition tile (the hallway): 30 cm tiles, 4 x 4 per 1.2 m, with
// the typical chips of colour.
export function vinylTileCanvas(a, b) {
  const S = 1024, T = S / 4;
  const cloud = fbm(S, S, 16, 3, 801);
  const A = rgb(a), B2 = rgb(b);
  return paint(S, S, (x, y, d, i) => {
    const tx = (x / T) | 0, ty = (y / T) | 0, k = y * S + x;
    const seam = x % T < 2 || y % T < 2;
    const chip = hash(x >> 2, y >> 2, tx * 7 + ty);
    const c = (tx + ty) % 2 ? A : B2;
    const t = seam ? 0.7 : (0.94 + (cloud[k] - 0.5) * 0.12) * (chip < 0.08 ? 0.82 : chip > 0.94 ? 1.12 : 1);
    d[i] = c[0] * t; d[i + 1] = c[1] * t; d[i + 2] = c[2] * t;
  });
}

// Broom-finished concrete with expansion joints (outside), 2 m.
export function concreteCanvas() {
  const S = 512;
  const cloud = fbm(S, S, 6, 5, 901), streak = fbm(S, S, 4, 2, 902);
  return paint(S, S, (x, y, d, i) => {
    const k = y * S + x, joint = x < 3 || y < 3;
    const broom = 0.5 + 0.5 * Math.sin(y * 1.9 + streak[k] * 8);
    const t = joint ? 0.55 : 0.86 + (cloud[k] - 0.5) * 0.24 + (broom - 0.5) * 0.05 + (hash(x, y, 9) - 0.5) * 0.08;
    d[i] = 167 * t; d[i + 1] = 163 * t; d[i + 2] = 155 * t;
  });
}

// What's on a monitor: a spreadsheet, an email client, or a slide.
function screenCanvas(kind) {
  const [c, g] = canvas(256, 160);
  const r = rng(kind * 7 + 1);
  g.fillStyle = '#1b2a3a';
  g.fillRect(0, 0, 256, 160);
  g.fillStyle = '#f3f5f7';
  g.fillRect(6, 10, 244, 144);
  g.fillStyle = ['#2f6db3', '#1f7a4a', '#b3432f'][kind % 3];
  g.fillRect(6, 10, 244, 12);
  if (kind % 3 === 0) {         // spreadsheet
    g.strokeStyle = '#c9ced4';
    for (let y = 30; y < 150; y += 8) { g.beginPath(); g.moveTo(8, y); g.lineTo(248, y); g.stroke(); }
    for (let x = 40; x < 248; x += 34) { g.beginPath(); g.moveTo(x, 24); g.lineTo(x, 152); g.stroke(); }
    g.fillStyle = '#555';
    for (let y = 31; y < 148; y += 8) for (let x = 44; x < 240; x += 34) if (r() < 0.7) g.fillRect(x, y + 2, 10 + r() * 16, 3);
  } else if (kind % 3 === 1) {  // email
    g.fillStyle = '#e3e8ee';
    g.fillRect(6, 22, 70, 132);
    for (let y = 28; y < 150; y += 14) { g.fillStyle = '#9aa4ae'; g.fillRect(12, y, 50, 3); g.fillStyle = '#6b7580'; g.fillRect(84, y, 100 + r() * 50, 3); g.fillRect(84, y + 5, 60 + r() * 40, 2); }
  } else {                      // slide / chart
    g.fillStyle = '#7a8591';
    g.fillRect(20, 32, 120, 6);
    const cols = ['#2f6db3', '#e0a030', '#4a9a5a', '#b3432f'];
    for (let i = 0; i < 6; i++) { g.fillStyle = cols[i % 4]; const h = 30 + r() * 70; g.fillRect(30 + i * 34, 145 - h, 22, h); }
  }
  return c;
}

function whiteboardCanvas() {
  const [c, g] = canvas(512, 256);
  const r = rng(31);
  g.fillStyle = '#f7f8f8';
  g.fillRect(0, 0, 512, 256);
  g.lineCap = 'round';
  for (const [col, x0, y0] of [['#1d4fa3', 40, 40], ['#1f1f1f', 260, 50], ['#b3261e', 60, 170]]) {
    g.strokeStyle = col;
    g.lineWidth = 3;
    for (let line = 0; line < 4; line++) {
      g.beginPath();
      let x = x0, y = y0 + line * 22;
      g.moveTo(x, y);
      for (let k = 0; k < 18; k++) { x += 6 + r() * 6; y += (r() - 0.5) * 6; g.lineTo(x, y); }
      g.stroke();
    }
  }
  g.strokeStyle = '#1f1f1f';
  g.strokeRect(300, 150, 150, 80);
  g.beginPath(); g.moveTo(300, 190); g.lineTo(450, 190); g.stroke();
  return c;
}

function clockCanvas() {
  const [c, g] = canvas(256);
  g.fillStyle = '#fbfbf8';
  g.beginPath(); g.arc(128, 128, 124, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#222';
  g.lineWidth = 3;
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2, r1 = i % 5 ? 112 : 100;
    g.lineWidth = i % 5 ? 2 : 5;
    g.beginPath(); g.moveTo(128 + Math.sin(a) * r1, 128 - Math.cos(a) * r1); g.lineTo(128 + Math.sin(a) * 118, 128 - Math.cos(a) * 118); g.stroke();
  }
  g.lineWidth = 7;
  g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + 50, 128 - 30); g.stroke();
  g.lineWidth = 4;
  g.beginPath(); g.moveTo(128, 128); g.lineTo(128 - 20, 128 - 85); g.stroke();
  return c;
}

function exitCanvas() {
  const [c, g] = canvas(256, 96);
  g.fillStyle = '#f2f2ee';
  g.fillRect(0, 0, 256, 96);
  g.fillStyle = '#c4161c';
  g.font = '700 64px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('EXIT', 128, 52);
  return c;
}

// Leaves for potted plants: a spray of long leaves on transparent ground.
function leavesCanvas() {
  const [c, g] = canvas(256);
  const r = rng(37);
  for (let i = 0; i < 26; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.2, len = 70 + r() * 110, w = 10 + r() * 12;
    const x0 = 128, y0 = 256, x1 = x0 + Math.cos(a) * len, y1 = y0 + Math.sin(a) * len;
    g.fillStyle = `hsl(${105 + r() * 25}, ${35 + r() * 20}%, ${22 + r() * 18}%)`;
    g.beginPath();
    g.moveTo(x0, y0);
    g.quadraticCurveTo((x0 + x1) / 2 - Math.sin(a) * w, (y0 + y1) / 2 + Math.cos(a) * w, x1, y1);
    g.quadraticCurveTo((x0 + x1) / 2 + Math.sin(a) * w, (y0 + y1) / 2 - Math.cos(a) * w, x0, y0);
    g.fill();
  }
  return c;
}

// City and sky seen through the windows (bright, slightly hazy).
function outsideCanvas() {
  const [c, g] = canvas(1024, 256);
  const r = rng(41);
  const sky = g.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#9fc0dd');
  sky.addColorStop(1, '#e5edf2');
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 256);
  for (let layer = 0; layer < 2; layer++) {
    let x = 0;
    while (x < 1024) {
      const w = 30 + r() * 70, h = (layer ? 60 : 110) + r() * (layer ? 60 : 90);
      g.fillStyle = layer ? '#b7c3cc' : '#96a4ae';
      g.fillRect(x, 256 - h, w, h);
      g.fillStyle = layer ? 'rgba(255,255,255,0.18)' : 'rgba(40,55,70,0.25)';
      for (let wy = 256 - h + 6; wy < 250; wy += 9) for (let wx = x + 4; wx < x + w - 6; wx += 8) g.fillRect(wx, wy, 5, 5);
      x += w + r() * 10;
    }
  }
  return c;
}

// The same city at night: dark sky with a glow low down, black towers with
// scattered lit windows (warm and cool), red beacons on a few roofs.
function outsideNightCanvas() {
  const [c, g] = canvas(1024, 256);
  const r = rng(41);
  const sky = g.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#04060b');
  sky.addColorStop(0.7, '#0e1320');
  sky.addColorStop(1, '#2a2530');
  g.fillStyle = sky;
  g.fillRect(0, 0, 1024, 256);
  for (let layer = 0; layer < 2; layer++) {
    let x = 0;
    while (x < 1024) {
      const w = 30 + r() * 70, h = (layer ? 60 : 110) + r() * (layer ? 60 : 90);
      g.fillStyle = layer ? '#0b0d12' : '#07080b';
      g.fillRect(x, 256 - h, w, h);
      for (let wy = 256 - h + 6; wy < 250; wy += 9) for (let wx = x + 4; wx < x + w - 6; wx += 8) {
        if (r() > (layer ? 0.28 : 0.2)) continue;
        g.fillStyle = r() < 0.7 ? `rgba(255,${200 + r() * 40},${130 + r() * 60},${0.55 + r() * 0.4})` : `rgba(190,215,255,${0.5 + r() * 0.4})`;
        g.fillRect(wx, wy, 5, 5);
      }
      if (!layer && r() < 0.3) { g.fillStyle = '#ff2a1a'; g.fillRect(x + w / 2 - 1, 256 - h - 3, 3, 3); }
      x += w + r() * 10;
    }
  }
  return c;
}

// ---- materials -------------------------------------------------------------------
export function makeMaterials() {
  const [carpetC, carpetN] = carpetCanvases();
  const [ceilC, ceilN] = ceilingCanvases();
  const [fabC, fabN] = fabricCanvases('#6f7780');
  const [dryC, dryN] = drywallCanvases();
  const std = (o) => new THREE.MeshStandardMaterial(o);
  // Materials with userData.tile (metres per texture repeat) get world-scale
  // UVs on the boxes they're used on (worldUV): the pattern keeps its real
  // size on a 24 m wall and a 1 m pillar alike.
  const perMetre = (m, tile) => { m.userData.tile = tile; return m; };
  const M = {
    carpet: perMetre(std({ map: texture(carpetC), normalMap: texture(carpetN, { srgb: false }), normalScale: new THREE.Vector2(0.7, 0.7), roughness: 1 }), 1),
    ceiling: perMetre(std({ map: texture(ceilC), normalMap: texture(ceilN, { srgb: false }), roughness: 0.95 }), 0.6),
    wall: perMetre(std({ color: '#e6e2d9', map: texture(dryC), normalMap: texture(dryN, { srgb: false }), normalScale: new THREE.Vector2(0.15, 0.15), roughness: 0.88 }), 1),
    accentWall: perMetre(std({ color: '#52687a', map: texture(dryC), normalMap: texture(dryN, { srgb: false }), normalScale: new THREE.Vector2(0.15, 0.15), roughness: 0.88 }), 1),
    baseboard: std({ color: '#3b3d40', roughness: 0.6 }),
    fabric: perMetre(std({ map: texture(fabC), normalMap: texture(fabN, { srgb: false }), normalScale: new THREE.Vector2(0.6, 0.6), roughness: 1 }), 0.5),
    lobbyFloor: perMetre(std({ map: texture(stoneTileCanvas('#dcd6ca', '#c7bfb0')), roughness: 0.18 }), 2),
    hallFloor: perMetre(std({ map: texture(vinylTileCanvas('#bdb8ae', '#aca597')), roughness: 0.32 }), 1.2),
    panelTrim: std({ color: '#b9bec4', metalness: 0.7, roughness: 0.35 }),
    laminate: std({ map: texture(laminateCanvas()), roughness: 0.45 }),
    veneer: std({ map: texture(veneerCanvas('#8f5e39', '#5e3820')), roughness: 0.42 }),
    doorFrame: std({ color: '#3c4146', metalness: 0.5, roughness: 0.45 }),
    steel: std({ color: '#c9ccd0', metalness: 1, roughness: 0.28 }),
    blackPlastic: std({ color: '#1b1c1e', roughness: 0.55 }),
    greyPlastic: std({ color: '#5a5e63', roughness: 0.6 }),
    // Powder-coated steel file cabinets (metalness >= 0.4: bullet holes look like metal).
    cabinet: std({ color: '#c3c0b8', roughness: 0.42, metalness: 0.45 }),
    cabinetDark: std({ color: '#7b7973', roughness: 0.5, metalness: 0.45 }),
    mesh: std({ color: '#26292c', roughness: 0.85 }),
    // Plain see-through glass with reflections. (Transmission would make the
    // renderer draw the whole room a second time every frame: ~1/3 slower.)
    glass: new THREE.MeshPhysicalMaterial({ color: '#dfe8ea', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.2, envMapIntensity: 1.5 }),
    frosted: new THREE.MeshStandardMaterial({ color: '#f3f5f5', roughness: 0.6, transparent: true, opacity: 0.75 }),
    troffer: std({ color: '#ffffff', emissive: '#fffaf0', emissiveIntensity: 3.2, roughness: 0.4 }),
    whiteboard: std({ map: texture(whiteboardCanvas()), roughness: 0.18 }),
    clock: std({ map: texture(clockCanvas()), roughness: 0.3 }),
    exit: std({ map: texture(exitCanvas()), emissive: '#ffffff', emissiveMap: texture(exitCanvas()), emissiveIntensity: 1.2 }),
    red: std({ color: '#b3161b', roughness: 0.35, metalness: 0.2 }),
    pot: std({ color: '#d9d5cc', roughness: 0.7 }),
    soil: std({ color: '#2b2118', roughness: 1 }),
    leaves: std({ map: texture(leavesCanvas()), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 }),
    paper: std({ color: '#f5f5f1', roughness: 0.9 }),
    mug: std({ color: '#e8e4dc', roughness: 0.3 }),
    slat: std({ color: '#e9e7e1', roughness: 0.5, metalness: 0.2 }),
    outside: new THREE.MeshBasicMaterial({ map: texture(outsideCanvas()), fog: false }),
    outsideNight: texture(outsideNightCanvas()), // swapped in as outside.map at night
    screens: [0, 1, 2].map(k => std({ color: '#000', emissive: '#ffffff', emissiveMap: texture(screenCanvas(k)), emissiveIntensity: 0.9, roughness: 0.25 })),
  };
  return M;
}

// Set texture repeats for a surface of w x h metres (tile = metres per repeat).
// Materials with userData.tile get world-scale UVs instead (worldUV): as is.
export function tiled(mat, w, h, tile) {
  if (mat.userData.tile) return mat;
  const m = mat.clone();
  for (const k of ['map', 'normalMap']) if (m[k]) { m[k] = m[k].clone(); m[k].repeat.set(w / tile, h / tile); m[k].needsUpdate = true; }
  return m;
}

// UVs in metres / tile on a w x h x d BoxGeometry, so a texture that covers
// `tile` metres keeps that size on any box. (BoxGeometry faces: +x, -x, +y,
// -y, +z, -z, four vertices each, UVs 0..1 across the face.)
export function worldUV(geo, w, h, d, tile) {
  const uv = geo.attributes.uv, faces = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setXY(i, uv.getX(i) * faces[f][0] / tile, uv.getY(i) * faces[f][1] / tile);
  }
  uv.needsUpdate = true;
  return geo;
}

// ---- builders ---------------------------------------------------------------------
function mesh(geo, mat, x = 0, y = 0, z = 0, { shadow = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}
const B = (w, h, d, mat, x, y, z, o) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, o);
const C = (rt, rb, h, mat, x, y, z, seg = 16) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z);

// A door in a wall opening: steel frame with trim, wood veneer leaf with a
// narrow glass vision panel, lever handles both sides, three hinges. The leaf
// hangs on `group.userData.pivot` (rotate it about Y to open: + swings toward
// -Z, into the room behind). Origin: floor, centre of the opening, wall plane.
export function door(M, { width = 0.92, height = 2.13, wall = 0.14, hinge = 'left', vision = true } = {}) {
  const g = new THREE.Group();
  const fw = 0.05; // frame face width
  g.add(B(fw, height + fw, wall + 0.02, M.doorFrame, -width / 2 - fw / 2, (height + fw) / 2, 0));
  g.add(B(fw, height + fw, wall + 0.02, M.doorFrame, width / 2 + fw / 2, (height + fw) / 2, 0));
  g.add(B(width + 2 * fw, fw, wall + 0.02, M.doorFrame, 0, height + fw / 2, 0));
  const pivot = new THREE.Group();
  const s = hinge === 'left' ? 1 : -1;
  pivot.position.set(-s * width / 2, 0, -wall / 2 + 0.03);
  g.add(pivot);
  const lw = width - 0.01, t = 0.045;
  const leaf = new THREE.Group();
  leaf.position.x = s * lw / 2;
  pivot.add(leaf);
  const solids = [];
  if (vision) {
    // Leaf with a vision slot near the latch side: built as four pieces.
    const vx = s * (lw / 2 - 0.2), vw = 0.12, vy0 = 1.2, vy1 = 1.95;
    const left = -lw / 2, right = lw / 2;
    const a = Math.min(vx - vw / 2, vx + vw / 2), b = Math.max(vx - vw / 2, vx + vw / 2);
    const pieces = [
      [a - left, height, (left + a) / 2, height / 2],
      [right - b, height, (b + right) / 2, height / 2],
      [vw, vy0, vx, vy0 / 2],
      [vw, height - vy1, vx, (vy1 + height) / 2],
    ];
    for (const [w, h, x, y] of pieces) { const m = B(w, h, t, M.veneer, x, y, 0); leaf.add(m); solids.push(m); }
    leaf.add(B(vw, vy1 - vy0, 0.008, M.glass, vx, (vy0 + vy1) / 2, 0, { shadow: false }));
    for (const z of [t / 2 + 0.004, -t / 2 - 0.004]) {
      leaf.add(B(vw + 0.03, 0.015, 0.008, M.steel, vx, vy0, z));
      leaf.add(B(vw + 0.03, 0.015, 0.008, M.steel, vx, vy1, z));
    }
  } else {
    const m = B(lw, height, t, M.veneer, 0, height / 2, 0);
    leaf.add(m);
    solids.push(m);
  }
  // Lever handles (rose + lever), both faces, on the latch side.
  const hx = s * (lw / 2 - 0.07);
  for (const side of [1, -1]) {
    const z = side * (t / 2 + 0.012);
    const rose = C(0.028, 0.028, 0.012, M.steel, hx, 1.02, z);
    rose.rotation.x = Math.PI / 2;
    const lever = B(0.13, 0.018, 0.018, M.steel, hx - s * 0.06, 1.02, z + side * 0.03);
    const neck = B(0.018, 0.018, 0.04, M.steel, hx, 1.02, z + side * 0.015);
    leaf.add(rose, lever, neck);
  }
  // Hinges.
  for (const y of [0.25, 1.05, 1.9]) leaf.add(C(0.009, 0.009, 0.1, M.steel, -s * lw / 2, y, 0));
  g.userData = { pivot, solids, open: 0, target: 0, sign: s };
  return g;
}

// An ergonomic task chair: five-star base on casters, gas lift, seat, mesh back.
export function taskChair(M) {
  const g = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const leg = B(0.3, 0.03, 0.04, M.blackPlastic, Math.cos(a) * 0.15, 0.07, Math.sin(a) * 0.15);
    leg.rotation.y = -a;
    g.add(leg);
    g.add(C(0.025, 0.025, 0.04, M.blackPlastic, Math.cos(a) * 0.29, 0.03, Math.sin(a) * 0.29, 8));
  }
  g.add(C(0.025, 0.03, 0.34, M.steel, 0, 0.26, 0, 10));
  g.add(B(0.5, 0.08, 0.48, M.mesh, 0, 0.47, 0));
  const back = B(0.46, 0.55, 0.05, M.mesh, 0, 0.83, 0.24);
  back.rotation.x = -0.12;
  g.add(back);
  g.add(B(0.04, 0.2, 0.04, M.blackPlastic, 0, 0.6, 0.23));
  for (const s of [-1, 1]) {
    g.add(B(0.04, 0.2, 0.04, M.blackPlastic, s * 0.27, 0.6, 0.05));
    g.add(B(0.07, 0.03, 0.26, M.blackPlastic, s * 0.27, 0.71, 0.05));
  }
  return g;
}

function monitor(M, screen) {
  const g = new THREE.Group();
  g.add(B(0.22, 0.015, 0.18, M.blackPlastic, 0, 0.0075, 0));
  g.add(B(0.04, 0.32, 0.03, M.blackPlastic, 0, 0.17, 0.05));
  g.add(B(0.56, 0.34, 0.025, M.blackPlastic, 0, 0.36, 0.03));
  const s = mesh(new THREE.PlaneGeometry(0.53, 0.31), screen, 0, 0.36, 0.044, { shadow: false });
  g.add(s);
  return g;
}

// One workstation on a desk top at height 0.74, facing +Z (the sitter's back
// toward +Z). Desk w x d; origin at the desk centre on the floor.
export function workstation(M, { w = 1.6, d = 0.75, seed = 1, chair = true } = {}) {
  const r = rng(seed * 97 + 3);
  const g = new THREE.Group();
  const solids = [];
  const top = B(w, 0.03, d, M.laminate, 0, 0.735, 0);
  g.add(top);
  solids.push(top);
  g.add(B(0.4, 0.66, d - 0.05, M.greyPlastic, w / 2 - 0.22, 0.34, 0));          // pedestal
  for (const y of [0.18, 0.42, 0.6]) g.add(B(0.3, 0.01, 0.01, M.steel, w / 2 - 0.22, y, d / 2 - 0.02));
  g.add(B(0.03, 0.7, d - 0.1, M.greyPlastic, -w / 2 + 0.03, 0.36, 0));           // end leg
  const nMon = r() < 0.6 ? 2 : 1;
  for (let i = 0; i < nMon; i++) {
    const m = monitor(M, M.screens[Math.floor(r() * 3)]);
    m.position.set((nMon === 2 ? (i ? 0.3 : -0.3) : 0) + (r() - 0.5) * 0.05, 0.75, -d / 2 + 0.2);
    m.rotation.y = nMon === 2 ? (i ? -0.18 : 0.18) : 0;
    g.add(m);
  }
  g.add(B(0.44, 0.02, 0.14, M.blackPlastic, 0, 0.76, 0.05));                    // keyboard
  g.add(B(0.06, 0.02, 0.1, M.blackPlastic, 0.32, 0.76, 0.06));                   // mouse
  if (r() < 0.8) g.add(C(0.04, 0.035, 0.1, M.mug, -0.5, 0.8, 0.1, 12));          // mug
  const stack = Math.floor(r() * 4);
  for (let i = 0; i < stack; i++) {
    const p = B(0.21, 0.004, 0.297, M.paper, -0.45 + (r() - 0.5) * 0.04, 0.752 + i * 0.005, -0.15 + (r() - 0.5) * 0.04, { shadow: false });
    p.rotation.y = (r() - 0.5) * 0.3;
    g.add(p);
  }
  if (r() < 0.6) g.add(B(0.2, 0.06, 0.18, M.blackPlastic, w / 2 - 0.25, 0.78, -0.15)); // desk phone
  if (chair) {
    const c = taskChair(M);
    c.position.set((r() - 0.5) * 0.3, 0, d / 2 + 0.25 + r() * 0.15);
    c.rotation.y = Math.PI + (r() - 0.5) * 0.9;
    g.add(c);
  }
  g.userData.solids = solids;
  return g;
}

// Recessed 2 x 4 LED troffer (60 x 120 cm): frame + glowing diffuser.
export function troffer(M) {
  const g = new THREE.Group();
  g.add(B(0.62, 0.02, 1.22, M.panelTrim, 0, 0.01, 0, { shadow: false }));
  g.add(B(0.56, 0.01, 1.16, M.troffer, 0, -0.002, 0, { shadow: false }));
  return g;
}

export function plant(M, scale = 1) {
  const g = new THREE.Group();
  g.add(C(0.2, 0.16, 0.42, M.pot, 0, 0.21, 0, 20));
  g.add(C(0.19, 0.19, 0.02, M.soil, 0, 0.41, 0, 20));
  const geo = new THREE.PlaneGeometry(0.9, 0.9);
  geo.translate(0, 0.45, 0);
  for (let i = 0; i < 3; i++) {
    const p = mesh(geo, M.leaves, 0, 0.4, 0, { shadow: true });
    p.rotation.y = (i / 3) * Math.PI;
    g.add(p);
  }
  g.scale.setScalar(scale);
  return g;
}

export function whiteboard(M) {
  const g = new THREE.Group();
  g.add(B(1.84, 1.04, 0.03, M.steel, 0, 0, 0));
  g.add(B(1.8, 1.0, 0.035, M.whiteboard, 0, 0, 0.001, { shadow: false }));
  g.add(B(1.2, 0.03, 0.06, M.steel, 0, -0.52, 0.03));
  return g;
}

export function wallClock(M) {
  const g = new THREE.Group();
  const face = C(0.16, 0.16, 0.04, M.clock, 0, 0, 0, 32);
  face.rotation.x = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.012, 8, 32), M.blackPlastic);
  g.add(face, rim);
  return g;
}

export function exitSign(M) {
  const g = new THREE.Group();
  g.add(B(0.34, 0.14, 0.05, M.exit, 0, 0, 0, { shadow: false }));
  return g;
}

export function extinguisher(M) {
  const g = new THREE.Group();
  g.add(C(0.075, 0.075, 0.5, M.red, 0, 0.25, 0, 16));
  g.add(C(0.03, 0.05, 0.08, M.blackPlastic, 0, 0.54, 0, 10));
  g.add(B(0.12, 0.02, 0.03, M.blackPlastic, 0.04, 0.6, 0));
  return g;
}

// A run of lateral file cabinets side by side (powder-coated steel, three
// drawers each with a pull and a label holder, drawers facing +z): waist-high
// cover in the office. Its body stops rounds (userData.solids).
export function lateralFiles(M, { units = 2, unitW = 0.91, h = 1.1, d = 0.5 } = {}) {
  const g = new THREE.Group();
  const W = units * unitW;
  const body = B(W, h - 0.02, d, M.cabinetDark, 0, (h - 0.02) / 2, 0);
  g.add(body);
  g.add(B(W + 0.01, 0.02, d + 0.01, M.cabinet, 0, h - 0.01, 0)); // top
  for (const sx of [-1, 1]) g.add(B(0.012, h - 0.02, d, M.cabinet, sx * (W / 2 + 0.006), (h - 0.02) / 2, 0, { shadow: false })); // end panels
  g.add(B(W, h - 0.08, 0.012, M.cabinet, 0, h / 2, -d / 2 - 0.006, { shadow: false })); // back panel
  const n = 3, base = 0.08, dh = (h - base - 0.03) / n;
  for (let u = 0; u < units; u++) {
    const cx = -W / 2 + unitW * (u + 0.5);
    for (let i = 0; i < n; i++) {
      const cy = base + dh * (i + 0.5);
      g.add(B(unitW - 0.014, dh - 0.01, 0.014, M.cabinet, cx, cy, d / 2 + 0.007, { shadow: false }));      // drawer front
      g.add(B(0.22, 0.018, 0.03, M.steel, cx, cy + dh * 0.1, d / 2 + 0.025, { shadow: false }));           // pull
      g.add(B(0.075, 0.032, 0.004, M.paper, cx, cy + dh * 0.32, d / 2 + 0.016, { shadow: false }));        // label
    }
  }
  g.add(B(W - 0.04, base - 0.01, 0.01, M.blackPlastic, 0, base / 2, d / 2 - 0.02, { shadow: false })); // toe kick
  g.userData.solids = [body];
  return g;
}

export function copier(M) {
  const g = new THREE.Group();
  g.add(B(0.62, 0.95, 0.66, M.greyPlastic, 0, 0.475, 0));
  g.add(B(0.62, 0.12, 0.55, M.paper, 0, 1.01, -0.03));
  g.add(B(0.3, 0.04, 0.18, M.blackPlastic, 0.12, 1.08, 0.2));
  return g;
}

// Venetian blinds over a window: slats in one InstancedMesh, lowered to
// `drop` (0..1 of the height), tilted half open.
export function blinds(M, width, height, drop = 0.7) {
  const n = Math.round(height * drop / 0.025);
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(width, 0.002, 0.025), M.slat, n);
  const o = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    o.position.set(0, height / 2 - 0.03 - i * 0.025, 0);
    o.rotation.x = 0.7;
    o.updateMatrix();
    im.setMatrixAt(i, o.matrix);
  }
  im.receiveShadow = true;
  const g = new THREE.Group();
  g.add(im);
  g.add(B(width + 0.02, 0.05, 0.05, M.slat, 0, height / 2, 0, { shadow: false }));
  g.add(B(width, 0.02, 0.03, M.slat, 0, height / 2 - 0.03 - n * 0.025, 0, { shadow: false }));
  return g;
}

export function outsideView(M, width, height) {
  return mesh(new THREE.PlaneGeometry(width, height), M.outside, 0, 0, 0, { shadow: false });
}

// ---- merging -------------------------------------------------------------------------
// A building is hundreds of small boxes; each is a draw call (three with two
// shadow lights and ambient occlusion). Merge every static, opaque mesh that
// shares a material and shadow settings into one mesh, baked in world space.
// `keep` holds objects (and their children) that move, hide or break: glass,
// sliding doors. `movers` are groups that move as a whole (a door's swinging
// pivot): their parts are merged inside the group, so it still moves.
// `solids` is the list of meshes that stop rounds; returns the new list
// (merged meshes replace their parts).
export function mergeStatic(scene, { keep = [], movers = [], solids = [] } = {}) {
  scene.updateMatrixWorld(true);
  const skip = new Set();
  for (const k of [...keep, ...movers]) k?.traverse(o => skip.add(o));
  const solidSet = new Set(solids), merged = new Set(), out = solids.slice();
  mergeUnder(scene, o => !skip.has(o), solidSet, merged, out);
  for (const m of movers) mergeUnder(m, o => !keep.some(k => k === o), solidSet, merged, out);
  return out.filter(o => !merged.has(o));
}

function mergeUnder(root, allowed, solidSet, merged, out) {
  const inv = root.matrixWorld.clone().invert();
  const groups = new Map();
  root.traverse(o => {
    if (!o.isMesh || !allowed(o) || o.isInstancedMesh || o.isSkinnedMesh || !o.visible) return;
    const m = o.material;
    if (Array.isArray(m) || m.transparent || m.isShaderMaterial || o.geometry.morphAttributes?.position) return;
    for (let p = o.parent; p && p !== root; p = p.parent) if (!p.visible) return;
    const g = o.geometry;
    const key = [m.uuid, o.castShadow, o.receiveShadow, solidSet.has(o), !!g.index, Object.keys(g.attributes).sort().join()].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(o);
  });
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const geo = mergeGeometries(list.map(o => {
      const g = o.geometry.clone().applyMatrix4(inv.clone().multiply(o.matrixWorld));
      g.clearGroups();
      return g;
    }));
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, list[0].material);
    mesh.castShadow = list[0].castShadow;
    mesh.receiveShadow = list[0].receiveShadow;
    root.add(mesh);
    for (const o of list) { o.removeFromParent(); merged.add(o); }
    if (solidSet.has(list[0])) out.push(mesh);
  }
}
