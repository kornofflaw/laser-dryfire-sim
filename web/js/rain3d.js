// rain3d.js — falling rain for 3D scenes (parking lot, 3D range).
// ---------------------------------------------------------------------------
// Thin streaks (line segments) in a box `area` (x, depth, height, m) that
// follows the camera; they fall at `speed` m/s, drift with `wind` and start
// again at the top when they reach the ground. R = a rain config block
// (CONFIG.knife3d.rain, CONFIG.range3d.rain).

import * as THREE from 'three';

export function rainStreaks(R) {
  const n = R.drops, a = new Float32Array(n * 6), [W, D, H] = R.area;
  for (let i = 0; i < n; i++) {
    const x = (Math.random() - 0.5) * W, z = -Math.random() * D, y = Math.random() * H;
    a.set([x, y, z, x + R.wind / R.speed * R.length, y - R.length, z], i * 6);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(a, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: R.color, transparent: true, opacity: R.opacity, depthWrite: false, fog: true }));
  lines.frustumCulled = false;
  lines.renderOrder = 3;
  return lines;
}

// One frame of rain (dt s), the box kept in front of the camera at (cx, cz).
export function moveRain(lines, R, dt, cx, cz) {
  const pos = lines.geometry.attributes.position, a = pos.array, [W, D, H] = R.area;
  const fall = R.speed * dt, drift = R.wind * dt;
  for (let i = 0; i < a.length; i += 6) {
    a[i + 1] -= fall; a[i + 4] -= fall; a[i] += drift; a[i + 3] += drift;
    if (a[i + 4] < 0) { // hit the ground: start again at the top, somewhere new
      const x = (Math.random() - 0.5) * W, z = -Math.random() * D, y = H * (0.8 + Math.random() * 0.2);
      a[i] = x; a[i + 1] = y; a[i + 2] = z;
      a[i + 3] = x + R.wind / R.speed * R.length; a[i + 4] = y - R.length; a[i + 5] = z;
    }
  }
  pos.needsUpdate = true;
  lines.position.set(cx, 0, cz + 2);
}
