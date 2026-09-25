// scenery.js — painted backdrops and surface textures, generated in code.
// ---------------------------------------------------------------------------
// There are no image files. Backdrops are painted once into an offscreen
// canvas per viewport size (resize rebuilds them), so each frame is a single
// drawImage. Textures (cardboard, dirt) are small tiling patterns.
//
//   'range'  outdoor bay: overcast sky, tree line, dirt berm, gravel floor
//   'room'   indoor lobby for scenarios: wall, door, window, tiled floor
//
//   'lot'    parking lot at dusk, drawn in true perspective to match the
//            knife-attack runner (horizon and focal length from config.knife)
//
// FLOOR (0.86 of the height) is where target stakes and people's feet meet
// the ground in the range and room layouts.

import { CONFIG } from './config.js';

export const FLOOR = 0.86;

const cache = new Map();

export function drawBackdrop(g, kind, W, H) {
  const key = `${kind}:${W}x${H}:${window.devicePixelRatio || 1}`;
  let cv = cache.get(key);
  if (!cv) {
    if (cache.size > 6) cache.clear();
    cv = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);
    ({ room: paintRoom, lot: paintLot }[kind] || paintRange)(c, W, H);
    cache.set(key, cv);
  }
  g.drawImage(cv, 0, 0, W, H);
}

// Seeded random so the same screen size always paints the same scene.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// A tileable noise texture: base colour with per-pixel variation.
function noiseTile(size, [r, gg, b], amp, seed, streak = 0) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d');
  const img = c.createImageData(size, size);
  const rand = rng(seed);
  let run = 0;
  for (let i = 0; i < size * size; i++) {
    // Optional horizontal streaks (cardboard fibre, wood grain).
    if (streak && i % size === 0) run = (rand() - 0.5) * streak;
    const n = (rand() - 0.5) * amp + run;
    img.data[i * 4] = r + n;
    img.data[i * 4 + 1] = gg + n;
    img.data[i * 4 + 2] = b + n * 0.8;
    img.data[i * 4 + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  return cv;
}

// Patterns are cached per canvas context (they belong to the context that made them).
export function pattern(g, name) {
  const patterns = (g.__patterns ??= {});
  if (patterns[name]) return patterns[name];
  let tile;
  if (name === 'cardboard') tile = noiseTile(96, [201, 164, 110], 22, 7, 10);
  else if (name === 'dirt') tile = noiseTile(128, [122, 96, 70], 34, 11);
  else if (name === 'gravel') tile = noiseTile(128, [118, 112, 102], 48, 13);
  else if (name === 'wall') tile = noiseTile(128, [196, 186, 168], 10, 17);
  else if (name === 'wood') tile = noiseTile(128, [112, 78, 48], 16, 19, 26);
  else if (name === 'paper') tile = noiseTile(96, [246, 244, 237], 6, 23);
  else if (name === 'asphalt') tile = noiseTile(128, [58, 59, 61], 26, 29);
  patterns[name] = g.createPattern(tile, 'repeat');
  return patterns[name];
}

function paintRange(c, W, H) {
  const rand = rng(W * 31 + H);
  const floorY = FLOOR * H;
  const bermTop = 0.2 * H;

  // Overcast sky.
  const sky = c.createLinearGradient(0, 0, 0, bermTop);
  sky.addColorStop(0, '#9fb0bf');
  sky.addColorStop(1, '#c9d2d6');
  c.fillStyle = sky;
  c.fillRect(0, 0, W, bermTop + 20);

  // Distant tree line: rounded canopies in two depths.
  for (const [color, base, size, n] of [['#5d6b57', 0.035, 0.05, 70], ['#3f4d3a', 0.012, 0.038, 110]]) {
    c.fillStyle = color;
    c.fillRect(0, bermTop - base * H, W, base * H + 20);
    for (let i = 0; i < n; i++) {
      const x = (i / n) * W + rand() * (W / n);
      const r = (0.4 + rand() * 0.6) * size * H;
      c.beginPath();
      c.ellipse(x, bermTop - base * H, r * 0.8, r, 0, Math.PI, 0);
      c.fill();
    }
  }

  // Dirt berm with a rounded crest, lit from above.
  c.save();
  c.beginPath();
  c.moveTo(0, bermTop + 0.03 * H);
  c.quadraticCurveTo(W / 2, bermTop - 0.03 * H, W, bermTop + 0.03 * H);
  c.lineTo(W, floorY);
  c.lineTo(0, floorY);
  c.closePath();
  c.clip();
  c.fillStyle = pattern(c, 'dirt');
  c.fillRect(0, 0, W, H);
  const shade = c.createLinearGradient(0, bermTop, 0, floorY);
  shade.addColorStop(0, 'rgba(255,240,215,0.22)');
  shade.addColorStop(0.5, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.35)');
  c.fillStyle = shade;
  c.fillRect(0, 0, W, H);
  // Pocks and small stones in the berm face.
  for (let i = 0; i < 260; i++) {
    const x = rand() * W, y = bermTop + rand() * (floorY - bermTop);
    const r = 1 + rand() * 3.5;
    c.fillStyle = rand() < 0.5 ? 'rgba(60,45,32,0.35)' : 'rgba(170,150,125,0.35)';
    c.beginPath();
    c.ellipse(x, y, r * 1.4, r, 0, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();

  // Grass tufts along the crest.
  c.strokeStyle = 'rgba(88,104,60,0.9)';
  c.lineWidth = 1.2;
  for (let i = 0; i < 180; i++) {
    const x = rand() * W;
    const t = x / W;
    const y = bermTop + 0.03 * H - 4 * 0.06 * H * t * (1 - t) + 2;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + (rand() - 0.5) * 6, y - 3 - rand() * 7);
    c.stroke();
  }

  // Gravel floor, darker toward the shooter.
  c.fillStyle = pattern(c, 'gravel');
  c.fillRect(0, floorY, W, H - floorY);
  const floorShade = c.createLinearGradient(0, floorY, 0, H);
  floorShade.addColorStop(0, 'rgba(0,0,0,0.05)');
  floorShade.addColorStop(1, 'rgba(0,0,0,0.45)');
  c.fillStyle = floorShade;
  c.fillRect(0, floorY, W, H - floorY);
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.fillRect(0, floorY, W, 2);

  // Side baffles (timber walls) framing the bay.
  for (const side of [0, 1]) {
    c.save();
    c.beginPath();
    if (side === 0) {
      c.moveTo(0, 0.1 * H); c.lineTo(0.05 * W, 0.18 * H); c.lineTo(0.05 * W, floorY + 0.02 * H); c.lineTo(0, H);
    } else {
      c.moveTo(W, 0.1 * H); c.lineTo(0.95 * W, 0.18 * H); c.lineTo(0.95 * W, floorY + 0.02 * H); c.lineTo(W, H);
    }
    c.closePath();
    c.clip();
    c.fillStyle = pattern(c, 'wood');
    c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.fillRect(0, 0, W, H);
    c.restore();
  }

  vignette(c, W, H, 0.35);
}

function paintRoom(c, W, H) {
  const rand = rng(W * 17 + H * 3);
  const floorY = 0.7 * H;

  // Wall.
  c.fillStyle = pattern(c, 'wall');
  c.fillRect(0, 0, W, floorY);
  const wallLight = c.createRadialGradient(W / 2, -0.2 * H, 0.1 * H, W / 2, 0.3 * H, 0.9 * W);
  wallLight.addColorStop(0, 'rgba(255,248,230,0.18)');
  wallLight.addColorStop(1, 'rgba(0,0,0,0.25)');
  c.fillStyle = wallLight;
  c.fillRect(0, 0, W, floorY);

  // Door on the left.
  const dx = 0.07 * W, dw = 0.13 * W, dy = 0.12 * H;
  c.fillStyle = '#e8e2d6';
  c.fillRect(dx - 8, dy - 8, dw + 16, floorY - dy + 8); // frame
  c.fillStyle = pattern(c, 'wood');
  c.fillRect(dx, dy, dw, floorY - dy);
  c.strokeStyle = 'rgba(0,0,0,0.25)';
  c.lineWidth = 2;
  c.strokeRect(dx + 0.15 * dw, dy + 0.06 * H, 0.7 * dw, 0.2 * H);
  c.strokeRect(dx + 0.15 * dw, dy + 0.32 * H, 0.7 * dw, 0.2 * H);
  c.fillStyle = '#c9b27a';
  c.beginPath();
  c.arc(dx + 0.85 * dw, dy + 0.3 * H, 5, 0, Math.PI * 2);
  c.fill();

  // Window with blinds on the right.
  const wx = 0.72 * W, ww = 0.2 * W, wy = 0.14 * H, wh = 0.28 * H;
  c.fillStyle = '#eee9df';
  c.fillRect(wx - 8, wy - 8, ww + 16, wh + 16);
  const glass = c.createLinearGradient(wx, wy, wx + ww, wy + wh);
  glass.addColorStop(0, '#b9cfdc');
  glass.addColorStop(1, '#8aa6b8');
  c.fillStyle = glass;
  c.fillRect(wx, wy, ww, wh);
  c.fillStyle = 'rgba(240,236,226,0.85)';
  for (let y = wy; y < wy + wh * 0.62; y += 7) c.fillRect(wx, y, ww, 4);
  c.fillStyle = '#eee9df';
  c.fillRect(wx - 12, wy + wh + 6, ww + 24, 8); // sill

  // Framed picture in the middle.
  const px = 0.44 * W, pw = 0.12 * W, py = 0.13 * H, ph = 0.12 * H;
  c.fillStyle = '#3b2f24';
  c.fillRect(px - 6, py - 6, pw + 12, ph + 12);
  const art = c.createLinearGradient(px, py, px, py + ph);
  art.addColorStop(0, '#9cb3c7');
  art.addColorStop(0.6, '#d8c9a3');
  art.addColorStop(1, '#6f7f5a');
  c.fillStyle = art;
  c.fillRect(px, py, pw, ph);

  // Baseboard.
  c.fillStyle = '#efeae0';
  c.fillRect(0, floorY - 0.025 * H, W, 0.025 * H);
  c.fillStyle = 'rgba(0,0,0,0.2)';
  c.fillRect(0, floorY - 2, W, 2);

  // Tiled floor in perspective.
  c.fillStyle = '#8f877a';
  c.fillRect(0, floorY, W, H - floorY);
  const vx = W / 2, vy = 0.25 * H;
  c.strokeStyle = 'rgba(40,36,30,0.35)';
  c.lineWidth = 1.5;
  for (let i = -12; i <= 12; i++) {
    const xb = W / 2 + i * (W / 8);
    const t = (floorY - vy) / (H - vy);
    c.beginPath();
    c.moveTo(vx + (xb - vx) * t, floorY);
    c.lineTo(xb, H);
    c.stroke();
  }
  let y = floorY, step = 0.02 * H;
  while (y < H) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(W, y);
    c.stroke();
    y += step;
    step *= 1.35;
  }
  for (let i = 0; i < 400; i++) {
    c.fillStyle = `rgba(0,0,0,${rand() * 0.05})`;
    c.fillRect(rand() * W, floorY + rand() * (H - floorY), 2, 2);
  }
  const floorShade = c.createLinearGradient(0, floorY, 0, H);
  floorShade.addColorStop(0, 'rgba(0,0,0,0.15)');
  floorShade.addColorStop(1, 'rgba(0,0,0,0.4)');
  c.fillStyle = floorShade;
  c.fillRect(0, floorY, W, H - floorY);

  vignette(c, W, H, 0.4);
}

function paintLot(c, W, H) {
  const K = CONFIG.knife;
  const rand = rng(W * 7 + H * 13);
  const hz = K.horizonY * H;
  const f = K.focalFrac * H;
  const vx = W / 2;
  // Ground-plane helpers: a point `d` metres ahead and `x` metres to the side.
  const gy = d => hz + (f * K.eyeHeight) / d;
  const gx = (x, d) => vx + (f * x) / d;
  const ppm = d => f / d; // pixels per metre at distance d

  // Dusk sky.
  const sky = c.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, '#223049');
  sky.addColorStop(0.6, '#5a5a70');
  sky.addColorStop(1, '#c98a62');
  c.fillStyle = sky;
  c.fillRect(0, 0, W, hz + 2);

  // Tree line behind the store.
  c.fillStyle = '#1d2420';
  for (let i = 0; i < 90; i++) {
    const x = (i / 90) * W + rand() * 20;
    const r = (0.02 + rand() * 0.035) * H;
    c.beginPath();
    c.ellipse(x, hz - 0.035 * H, r * 0.8, r, 0, Math.PI, 0);
    c.fill();
  }
  c.fillRect(0, hz - 0.036 * H, W, 0.036 * H);

  // Store front 45 m away.
  const sd = 45;
  const sx0 = gx(-22, sd), sx1 = gx(22, sd), base = gy(sd), top = base - ppm(sd) * 7;
  c.fillStyle = '#b8a88e';
  c.fillRect(sx0, top, sx1 - sx0, base - top);
  c.fillStyle = '#8f3b2e';
  c.fillRect(sx0, top, sx1 - sx0, ppm(sd) * 1.2);           // fascia
  c.fillStyle = '#ffe9b0';
  c.font = `800 ${Math.round(ppm(sd) * 0.9)}px system-ui, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('MARKET', vx, top + ppm(sd) * 0.6);
  for (let i = 0; i < 9; i++) {                              // lit windows
    const wx = sx0 + (i + 0.5) * ((sx1 - sx0) / 9);
    const glow = c.createLinearGradient(0, base - ppm(sd) * 4, 0, base);
    glow.addColorStop(0, '#ffe7a8');
    glow.addColorStop(1, '#d9a95f');
    c.fillStyle = glow;
    c.fillRect(wx - ppm(sd) * 1.6, base - ppm(sd) * 4.2, ppm(sd) * 3.2, ppm(sd) * 3.4);
  }

  // Asphalt.
  c.fillStyle = pattern(c, 'asphalt');
  c.fillRect(0, hz, W, H - hz);
  const dark = c.createLinearGradient(0, hz, 0, H);
  dark.addColorStop(0, 'rgba(0,0,0,0.1)');
  dark.addColorStop(1, 'rgba(0,0,0,0.35)');
  c.fillStyle = dark;
  c.fillRect(0, hz, W, H - hz);

  // Parking stalls: two rows either side of the drive lane.
  c.strokeStyle = 'rgba(235,232,215,0.75)';
  for (const side of [-1, 1]) {
    for (const [xa, xb] of [[3.2, 8.2], [8.6, 13.6]]) {
      for (let d = 3; d < 45; d += 2.7) {
        c.lineWidth = Math.max(1, ppm(d) * 0.1);
        c.beginPath();
        c.moveTo(gx(side * xa, d), gy(d));
        c.lineTo(gx(side * xb, d), gy(d));
        c.stroke();
      }
    }
    c.lineWidth = 2;
    c.beginPath();                                             // lane edge line
    c.moveTo(gx(side * 3.2, 45), gy(45));
    c.lineTo(gx(side * 3.2, 1.2), gy(1.2));
    c.stroke();
  }

  // Parked cars (rear view), far to near so near ones overlap.
  const cars = [];
  for (const side of [-1, 1]) {
    for (let d = 8; d < 42; d += 2.7 * (1 + Math.floor(rand() * 2))) {
      if (rand() < 0.3) continue;
      cars.push({ x: side * (5.2 + rand() * 1.2), d: d + 1.3, color: pick(rand, ['#7b1e1e', '#20344f', '#c9c9c9', '#2b2b2b', '#5b6b52', '#9a8a70', '#e8e8e8']) });
    }
  }
  cars.sort((a, b) => b.d - a.d);
  for (const car of cars) drawCar(c, gx(car.x, car.d), gy(car.d), ppm(car.d), car.color);

  // Light poles.
  for (const [x, d] of [[-3.6, 34], [3.6, 34], [-9, 22], [9, 22]]) {
    const px = gx(x, d), py = gy(d), k = ppm(d);
    c.fillStyle = '#3b3e42';
    c.fillRect(px - k * 0.08, py - k * 8, k * 0.16, k * 8);
    c.fillRect(px - (x < 0 ? 0 : k * 1.2), py - k * 8, k * 1.2, k * 0.12);
    const lx = px + (x < 0 ? k * 1.1 : -k * 1.1), ly = py - k * 7.9;
    const glow = c.createRadialGradient(lx, ly, 0, lx, ly, k * 1.6);
    glow.addColorStop(0, 'rgba(255,230,170,0.9)');
    glow.addColorStop(1, 'rgba(255,230,170,0)');
    c.fillStyle = glow;
    c.beginPath();
    c.arc(lx, ly, k * 1.6, 0, Math.PI * 2);
    c.fill();
    // Pool of light on the ground.
    const pool = c.createRadialGradient(lx, py, 0, lx, py, k * 5);
    pool.addColorStop(0, 'rgba(255,225,160,0.14)');
    pool.addColorStop(1, 'rgba(255,225,160,0)');
    c.fillStyle = pool;
    c.beginPath();
    c.ellipse(lx, py, k * 5, k * 1.2, 0, 0, Math.PI * 2);
    c.fill();
  }

  vignette(c, W, H, 0.45);
}

// Rear view of a parked car. (x, y) = ground point under the rear bumper
// centre; k = pixels per metre at that distance.
function drawCar(c, x, y, k, color) {
  const w = 1.8 * k, bodyH = 0.75 * k, cabH = 0.55 * k;
  c.fillStyle = 'rgba(0,0,0,0.45)';
  c.beginPath();
  c.ellipse(x, y, w * 0.6, 0.12 * k, 0, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = '#111';
  c.fillRect(x - w * 0.46, y - 0.35 * k, 0.24 * k, 0.35 * k);  // tyres
  c.fillRect(x + w * 0.46 - 0.24 * k, y - 0.35 * k, 0.24 * k, 0.35 * k);
  c.fillStyle = color;
  const by = y - 0.25 * k - bodyH;
  c.beginPath();
  c.moveTo(x - w / 2, y - 0.25 * k);
  c.lineTo(x - w / 2, by + 0.1 * k);
  c.quadraticCurveTo(x - w / 2, by, x - w / 2 + 0.1 * k, by);
  c.lineTo(x + w / 2 - 0.1 * k, by);
  c.quadraticCurveTo(x + w / 2, by, x + w / 2, by + 0.1 * k);
  c.lineTo(x + w / 2, y - 0.25 * k);
  c.closePath();
  c.fill();
  c.beginPath();                                               // cabin
  c.moveTo(x - w * 0.4, by);
  c.lineTo(x - w * 0.33, by - cabH);
  c.lineTo(x + w * 0.33, by - cabH);
  c.lineTo(x + w * 0.4, by);
  c.closePath();
  c.fill();
  c.fillStyle = 'rgba(20,28,38,0.85)';                         // rear window
  c.beginPath();
  c.moveTo(x - w * 0.36, by - 0.05 * k);
  c.lineTo(x - w * 0.31, by - cabH + 0.07 * k);
  c.lineTo(x + w * 0.31, by - cabH + 0.07 * k);
  c.lineTo(x + w * 0.36, by - 0.05 * k);
  c.closePath();
  c.fill();
  c.fillStyle = '#b3141b';                                     // tail lights
  c.fillRect(x - w / 2 + 0.05 * k, by + 0.12 * k, 0.3 * k, 0.14 * k);
  c.fillRect(x + w / 2 - 0.35 * k, by + 0.12 * k, 0.3 * k, 0.14 * k);
  c.fillStyle = '#e8e2c8';                                     // plate
  c.fillRect(x - 0.26 * k, by + 0.35 * k, 0.52 * k, 0.12 * k);
  c.fillStyle = 'rgba(255,255,255,0.12)';                      // roof sheen
  c.fillRect(x - w * 0.33, by - cabH, w * 0.66, 0.05 * k);
}

function pick(rand, arr) { return arr[Math.floor(rand() * arr.length)]; }

function vignette(c, W, H, strength) {
  const v = c.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.35, W / 2, H * 0.5, Math.max(W, H) * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, `rgba(0,0,0,${strength})`);
  c.fillStyle = v;
  c.fillRect(0, 0, W, H);
}
