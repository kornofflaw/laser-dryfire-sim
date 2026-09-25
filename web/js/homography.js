// homography.js — 4-point perspective transform (what cv2.getPerspectiveTransform did).
// Maps camera pixels -> normalized screen coords. Fixes perspective (camera off
// to the side / tilted) but NOT lens barrel distortion, so use a low-distortion
// lens (no 170-degree fisheye).

// src, dst: arrays of 4 [x, y] points. Returns a 3x3 matrix as a flat array of 9.
export function computeHomography(src, dst) {
  // Solve for h0..h7 (h8 = 1):
  //   u = (h0 x + h1 y + h2) / (h6 x + h7 y + 1)
  //   v = (h3 x + h4 y + h5) / (h6 x + h7 y + 1)
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = solve(A, b);
  if (!h) return null;
  return [...h, 1];
}

export function applyHomography(H, x, y) {
  const w = H[6] * x + H[7] * y + H[8];
  if (Math.abs(w) < 1e-12) return null;
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

// Gaussian elimination with partial pivoting. Returns null if singular
// (e.g. two calibration shots landed on the same camera pixel).
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-10) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}
