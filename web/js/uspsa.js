// uspsa.js — the cardboard USPSA metric target: drawing and scoring.
// ---------------------------------------------------------------------------
// Both use the same shapes from CONFIG.uspsa (centimetres, y up), so a hit
// scores exactly where the printed perforation lines are.

import { CONFIG } from './config.js';
import { pattern } from './scenery.js';

const U = CONFIG.uspsa;
export const USPSA_ASPECT = U.width / U.height;

// Screen px -> target cm. (cx, cy) = target centre in px; h = target height in px.
export function toCm(px, py, cx, cy, h) {
  const k = U.height / h;
  return [(px - cx) * k, -(py - cy) * k];
}

// Returns 'Head' | 'A' | 'C' | 'D' | null (off the target).
export function classifyUspsa(x, y) {
  if (!pointInPoly(x, y, U.outline)) return null;
  const hd = U.head;
  if (x >= hd.x0 && x <= hd.x1 && y >= hd.y0 && y <= hd.y1) return 'Head';
  const a = U.aZone;
  if (x >= a.x0 && x <= a.x1 && y >= a.y0 && y <= a.y1) return 'A';
  if (pointInPoly(x, y, U.cZone)) return 'C';
  return 'D';
}

// Draw the target with its centre at (cx, cy) and height h px.
// stakes: draw the wooden stand down to floorY.
export function drawUspsa(g, cx, cy, h, { showZones = false, stakes = false, floorY = 0 } = {}) {
  const k = h / U.height; // px per cm
  const P = ([x, y]) => [cx + x * k, cy - y * k];

  if (stakes) {
    // Two 1x2 furring-strip stakes behind the target, into the ground.
    for (const sx of [-13, 13]) {
      const x = cx + sx * k;
      const top = cy - 10 * k;
      g.fillStyle = pattern(g, 'wood');
      g.fillRect(x - 2.2 * k, top, 4.4 * k, floorY - top);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(x + 1.2 * k, top, 1 * k, floorY - top);
    }
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.ellipse(cx, floorY, 20 * k, 2.2 * k, 0, 0, Math.PI * 2);
    g.fill();
  }

  // Cardboard face with a soft drop shadow.
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.45)';
  g.shadowBlur = 3 * k;
  g.shadowOffsetX = 1.2 * k;
  g.shadowOffsetY = 1.2 * k;
  poly(g, U.outline.map(P));
  g.fillStyle = pattern(g, 'cardboard');
  g.fill();
  g.restore();

  // Light falloff across the face.
  poly(g, U.outline.map(P));
  const light = g.createLinearGradient(cx - 23 * k, cy - 38 * k, cx + 23 * k, cy + 38 * k);
  light.addColorStop(0, 'rgba(255,245,225,0.18)');
  light.addColorStop(1, 'rgba(60,35,10,0.18)');
  g.fillStyle = light;
  g.fill();
  g.strokeStyle = 'rgba(90,60,30,0.6)';
  g.lineWidth = Math.max(1, 0.25 * k);
  g.stroke();

  // Perforated scoring lines.
  g.save();
  g.setLineDash([1.1 * k, 0.8 * k]);
  g.lineWidth = Math.max(1, 0.3 * k);
  g.strokeStyle = showZones ? 'rgba(70,40,15,0.9)' : 'rgba(80,50,20,0.55)';
  poly(g, U.cZone.map(P));
  g.stroke();
  const a = U.aZone;
  g.strokeRect(cx + a.x0 * k, cy - a.y1 * k, (a.x1 - a.x0) * k, (a.y1 - a.y0) * k);
  const hd = U.head;
  g.beginPath();
  g.moveTo(cx + hd.x0 * k, cy - hd.y0 * k);
  g.lineTo(cx + hd.x1 * k, cy - hd.y0 * k);
  g.stroke();
  g.restore();

  // Small printed zone letters, as on the real target.
  g.fillStyle = showZones ? 'rgba(70,40,15,0.9)' : 'rgba(80,50,20,0.55)';
  g.font = `600 ${Math.max(8, Math.round((showZones ? 4 : 2.6) * k))}px system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('A', cx, cy - (a.y1 - 2.5) * k);
  g.fillText('C', cx, cy + 22 * k);
  g.fillText('D', cx, cy + 35 * k);
  g.fillText(showZones ? 'H' : 'A', cx, cy - 34.5 * k);
}

function poly(g, pts) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
}

function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
