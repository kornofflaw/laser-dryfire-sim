// scenery.js — painted backdrops and surface textures, generated in code.
// ---------------------------------------------------------------------------
// There are no image files. Backdrops are painted once into an offscreen
// canvas per viewport size (resize rebuilds them), so each frame is a single
// drawImage. Textures (cardboard, dirt) are small tiling patterns.
//
//   'range'  outdoor bay: overcast sky, tree line, dirt berm, gravel floor
//   'room'   indoor lobby for scenarios: wall, door, window, tiled floor
//
// FLOOR (0.86 of the height) is where target stakes and people's feet meet
// the ground in every layout.

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
    (kind === 'room' ? paintRoom : paintRange)(c, W, H);
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

function vignette(c, W, H, strength) {
  const v = c.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.35, W / 2, H * 0.5, Math.max(W, H) * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, `rgba(0,0,0,${strength})`);
  c.fillStyle = v;
  c.fillRect(0, 0, W, H);
}
