// interior3d.js — building blocks for realistic 3D interiors (office3d.js).
// ---------------------------------------------------------------------------
// Everything is drawn in code: canvas textures (carpet tiles, acoustic
// ceiling tiles, painted drywall, cubicle fabric, wood veneer, screens,
// whiteboard) and small models built from boxes and cylinders with physically
// based materials. Units are metres.
//
//   makeMaterials()                  the shared material set
//   door(M, opts)                    framed door with a swinging leaf
//   workstation(M, opts)             desk, pedestal, monitors, keyboard, chair...
//   taskChair(M), plant(M), whiteboard(M), wallClock(M), exitSign(M),
//   troffer(M), extinguisher(M), copier(M)
//   blinds(M, width, height)         venetian blinds (one InstancedMesh)
//   outsideView(width, height)       city/sky backdrop seen through windows
//
// Each builder returns a THREE.Group; `group.userData.solids` lists meshes
// that should stop rounds (walls, desks, doors), for the view's hit testing.

import * as THREE from 'three';

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
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// A normal map from a greyscale height canvas (Sobel).
function normalFrom(c, strength = 2) {
  const w = c.width, h = c.height;
  const src = c.getContext('2d').getImageData(0, 0, w, h).data;
  const [n, g] = canvas(w, h);
  const out = g.createImageData(w, h);
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    out.data[i] = (-dx / l * 0.5 + 0.5) * 255;
    out.data[i + 1] = (dy / l * 0.5 + 0.5) * 255;
    out.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
    out.data[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  return n;
}

// Carpet tiles: 50 cm squares laid quarter-turned, each with a directional
// loop-pile texture. One canvas = 1 m (2 x 2 tiles).
function carpetCanvases() {
  const S = 512, r = rng(3);
  const [c, g] = canvas(S);
  const [hc, hg] = canvas(S);
  g.fillStyle = '#50565e';
  g.fillRect(0, 0, S, S);
  hg.fillStyle = '#808080';
  hg.fillRect(0, 0, S, S);
  const T = S / 2;
  for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) {
    const vertical = (tx + ty) % 2 === 0;
    for (let i = 0; i < 2600; i++) {
      const x = tx * T + r() * T, y = ty * T + r() * T, len = 3 + r() * 6;
      const v = r();
      g.strokeStyle = v < 0.5 ? `rgba(30,34,40,${0.25 + r() * 0.3})` : `rgba(120,128,138,${0.15 + r() * 0.25})`;
      hg.strokeStyle = v < 0.5 ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';
      g.lineWidth = hg.lineWidth = 1.2;
      for (const [cx, col] of [[g, 0], [hg, 1]]) {
        cx.beginPath();
        if (vertical) { cx.moveTo(x, y); cx.lineTo(x, y + len); } else { cx.moveTo(x, y); cx.lineTo(x + len, y); }
        cx.stroke();
      }
    }
    // Tile seams.
    g.strokeStyle = 'rgba(15,17,20,0.5)';
    g.lineWidth = 1;
    g.strokeRect(tx * T + 0.5, ty * T + 0.5, T - 1, T - 1);
    hg.strokeStyle = '#000';
    hg.strokeRect(tx * T + 0.5, ty * T + 0.5, T - 1, T - 1);
  }
  return [c, normalFrom(hc, 1.5)];
}

// Acoustic ceiling tile, 60 x 60 cm with the metal T-grid on two edges.
function ceilingCanvases() {
  const S = 256, r = rng(7);
  const [c, g] = canvas(S);
  const [hc, hg] = canvas(S);
  g.fillStyle = '#e9e8e3';
  g.fillRect(0, 0, S, S);
  hg.fillStyle = '#c0c0c0';
  hg.fillRect(0, 0, S, S);
  for (let i = 0; i < 1400; i++) {
    const x = r() * S, y = r() * S, rad = 0.6 + r() * 1.6;
    g.fillStyle = `rgba(120,118,110,${0.15 + r() * 0.25})`;
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    hg.fillStyle = 'rgba(0,0,0,0.6)';
    hg.beginPath(); hg.arc(x, y, rad, 0, Math.PI * 2); hg.fill();
  }
  // T-grid (white painted steel), with a groove beside it.
  g.fillStyle = '#f4f4f1';
  g.fillRect(0, 0, S, 7);
  g.fillRect(0, 0, 7, S);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, 7, S, 2);
  g.fillRect(7, 0, 2, S);
  hg.fillStyle = '#fff';
  hg.fillRect(0, 0, S, 7);
  hg.fillRect(0, 0, 7, S);
  hg.fillStyle = '#000';
  hg.fillRect(0, 7, S, 3);
  hg.fillRect(7, 0, 3, S);
  return [c, normalFrom(hc, 2.5)];
}

// Painted drywall: faint roller texture (a normal map only).
function drywallNormal() {
  const S = 256, r = rng(11);
  const [c, g] = canvas(S);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 6000; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)';
    const s = 1 + r() * 3;
    g.fillRect(r() * S, r() * S, s, s);
  }
  return normalFrom(c, 1.2);
}

// Woven panel fabric.
function fabricCanvases(color) {
  const S = 256, r = rng(19);
  const [c, g] = canvas(S);
  const [hc, hg] = canvas(S);
  g.fillStyle = color;
  g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 2) for (let x = 0; x < S; x += 2) {
    const up = ((x >> 1) + (y >> 1)) % 2 === 0;
    const k = 0.05 + r() * 0.08;
    g.fillStyle = up ? `rgba(255,255,255,${k})` : `rgba(0,0,0,${k})`;
    g.fillRect(x, y, 2, 2);
    hg.fillStyle = up ? '#aaa' : '#555';
    hg.fillRect(x, y, 2, 2);
  }
  return [c, normalFrom(hc, 1)];
}

// Wood veneer with long straight grain (doors, desks in private offices).
function veneerCanvas(base, dark) {
  const W = 256, H = 1024, r = rng(23);
  const [c, g] = canvas(W, H);
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    let x = r() * W;
    const a = 0.04 + r() * 0.12, w = 0.6 + r() * 2.4;
    g.strokeStyle = `rgba(${dark},${a})`;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y <= H; y += 32) { x += (r() - 0.5) * 2.2; g.lineTo(x, y); }
    g.stroke();
  }
  return c;
}

// Light maple laminate for work surfaces.
function laminateCanvas() {
  const [c, g] = canvas(512, 256);
  const r = rng(29);
  g.fillStyle = '#d6c4a4';
  g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 180; i++) {
    let y = r() * 256;
    g.strokeStyle = `rgba(150,110,70,${0.05 + r() * 0.08})`;
    g.lineWidth = 0.5 + r() * 1.5;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) { y += (r() - 0.5) * 1.5; g.lineTo(x, y); }
    g.stroke();
  }
  return c;
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

// ---- materials -------------------------------------------------------------------
export function makeMaterials() {
  const [carpetC, carpetN] = carpetCanvases();
  const [ceilC, ceilN] = ceilingCanvases();
  const [fabC, fabN] = fabricCanvases('#6f7780');
  const dryN = drywallNormal();
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {
    carpet: std({ map: texture(carpetC), normalMap: texture(carpetN, { srgb: false }), normalScale: new THREE.Vector2(0.6, 0.6), roughness: 1 }),
    ceiling: std({ map: texture(ceilC), normalMap: texture(ceilN, { srgb: false }), roughness: 0.95 }),
    wall: std({ color: '#e2ded5', normalMap: texture(dryN, { srgb: false }), normalScale: new THREE.Vector2(0.25, 0.25), roughness: 0.88 }),
    accentWall: std({ color: '#4f6475', normalMap: texture(dryN, { srgb: false }), normalScale: new THREE.Vector2(0.25, 0.25), roughness: 0.88 }),
    baseboard: std({ color: '#3b3d40', roughness: 0.6 }),
    fabric: std({ map: texture(fabC), normalMap: texture(fabN, { srgb: false }), normalScale: new THREE.Vector2(0.5, 0.5), roughness: 1 }),
    panelTrim: std({ color: '#b9bec4', metalness: 0.7, roughness: 0.35 }),
    laminate: std({ map: texture(laminateCanvas()), roughness: 0.45 }),
    veneer: std({ map: texture(veneerCanvas('#8a5a36', '60,32,15')), roughness: 0.42 }),
    doorFrame: std({ color: '#3c4146', metalness: 0.5, roughness: 0.45 }),
    steel: std({ color: '#c9ccd0', metalness: 1, roughness: 0.28 }),
    blackPlastic: std({ color: '#1b1c1e', roughness: 0.55 }),
    greyPlastic: std({ color: '#5a5e63', roughness: 0.6 }),
    mesh: std({ color: '#26292c', roughness: 0.85 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#dfe8ea', roughness: 0.04, metalness: 0, transmission: 0.9, thickness: 0.01, transparent: true, opacity: 0.25, envMapIntensity: 1.5 }),
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
    screens: [0, 1, 2].map(k => std({ color: '#000', emissive: '#ffffff', emissiveMap: texture(screenCanvas(k)), emissiveIntensity: 0.9, roughness: 0.25 })),
  };
  return M;
}

// Set texture repeats for a surface of w x h metres (tile = metres per repeat).
export function tiled(mat, w, h, tile) {
  const m = mat.clone();
  for (const k of ['map', 'normalMap']) if (m[k]) { m[k] = m[k].clone(); m[k].repeat.set(w / tile, h / tile); m[k].needsUpdate = true; }
  return m;
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
