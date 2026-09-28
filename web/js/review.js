// review.js — after a run, review where every shot landed and when.
// ---------------------------------------------------------------------------
// While a course runs, every shot is recorded (screen point, zone, points,
// time) and the frame right after it is captured (3D canvas + 2D canvas,
// downscaled, JPEG) so moving targets and 3D scenes can be reviewed exactly
// as they were at that moment. When the run completes, the final frame is
// captured too and the run is kept (the last `keep` runs, in memory only).
//
// The review screen (V) shows either all shots on the final frame, or one
// shot at a time on its own frame, plus a list and a timeline.
//
// Times: drills count from the beep; everything else from the start.

const ZONE_COLORS = {
  A: '#34d058', Head: '#2ec4b6', C: '#ffd33d', D: '#ff9f43', Steel: '#58a6ff', Tile: '#58a6ff',
  Dot: '#34d058', Miss: '#ff5c5c', NS: '#c678dd',
};
const zoneLabel = s => (s.wrongDot || s.wrongTile ? 'Wrong' : s.zone === 'NS' ? 'No-shoot' : s.zone);

export class ShotReview {
  constructor({ canvases, keep = 5, maxShots = 80, width = 800 }) {
    this.canvases = canvases;   // () => [canvas, ...] drawn in order (3D first, then 2D)
    this.keep = keep;
    this.maxShots = maxShots;
    this.width = width;
    this.runs = [];
    this.current = null;
    this.pending = [];
    this.el = document.getElementById('review');
    this.sel = 0;               // selected shot index; -1 = all shots
    this.runIndex = 0;
    this.bind();
  }

  // ---- recording -------------------------------------------------------------
  startRun(course, startMs) {
    this.current = { course: course.name, type: course.type, startMs, zeroMs: null, zeroLabel: 'start', shots: [] };
  }

  // zeroMs (optional): what this shot's time counts from, when that changes
  // during a run (Steel Challenge strings: each string's own beep).
  recordShot(score, zeroMs) {
    const run = this.current;
    if (!run || run.shots.length >= this.maxShots) return;
    const shot = {
      n: run.shots.length + 1, t: score.t, nx: score.nx, ny: score.ny, zero: zeroMs,
      zone: score.zone, points: score.points, label: zoneLabel(score), source: score.source,
    };
    run.shots.push(shot);
    // A 2D canvas still holds the last frame, so grab it now: the moment of
    // the shot, before the target reacts (a mover dropping, a plate falling).
    // A WebGL canvas can only be read right after it renders: next frame.
    const has3D = this.canvases().some(c => c && c.getContext && c.style.display !== 'none' && c.id !== 'range');
    if (has3D) this.pending.push(shot);
    else this.snapshot(url => { shot.image = url; });
  }

  // Call once per frame after everything is drawn: grabs frames for new shots.
  // (A WebGL canvas can only be read right after it renders, so all captures
  // happen here, not when the shot or the run end happens.)
  captureFrame() {
    if (this.pending.length) {
      const shots = this.pending;
      this.pending = [];
      this.snapshot(url => shots.forEach(s => { s.image = url; }));
    }
    if (this.pendingFinal) {
      const run = this.pendingFinal;
      this.pendingFinal = null;
      this.snapshot(url => { run.finalImage = url; if (this.isOpen && this.run === run) this.render(); });
    }
  }

  // zeroMs: what shot times count from (the beep for drills).
  finishRun(result, zeroMs, zeroLabel) {
    const run = this.current;
    if (!run) return;
    this.current = null;
    run.result = result;
    run.zeroMs = zeroMs ?? run.startMs;
    run.zeroLabel = zeroLabel;
    run.shots.forEach((s, i) => {
      s.time = (s.t - (s.zero ?? run.zeroMs)) / 1000;
      // (no split across strings: the first shot of a string has none)
      s.split = i && s.zero === run.shots[i - 1].zero ? (s.t - run.shots[i - 1].t) / 1000 : null;
    });
    this.pendingFinal = run; // captured after the next render
    this.runs.unshift(run);
    while (this.runs.length > this.keep) this.dispose(this.runs.pop());
  }

  snapshot(done) {
    const src = this.canvases().filter(c => c && c.width && c.style.display !== 'none');
    if (!src.length) return;
    const W = this.width, H = Math.round(W * (window.innerHeight / window.innerWidth));
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#111';
    g.fillRect(0, 0, W, H);
    for (const s of src) g.drawImage(s, 0, 0, W, H);
    c.toBlob(b => done(b ? URL.createObjectURL(b) : null), 'image/jpeg', 0.82);
  }

  dispose(run) {
    const urls = new Set([run.finalImage, ...run.shots.map(s => s.image)]);
    urls.forEach(u => u && URL.revokeObjectURL(u));
  }

  get hasRuns() { return this.runs.length > 0; }
  get isOpen() { return !this.el.hidden; }

  // ---- review screen ---------------------------------------------------------
  bind() {
    const q = s => this.el.querySelector(s);
    q('[data-act="review-close"]').onclick = () => this.close();
    q('[data-act="review-all"]').onclick = () => this.select(-1);
    q('[data-act="review-prev"]').onclick = () => this.step(-1);
    q('[data-act="review-next"]').onclick = () => this.step(1);
    q('#review-run').onchange = e => { this.runIndex = Number(e.target.value); this.sel = -1; this.render(); };
    this.img = new Image();
    this.img.onload = () => this.drawViewer();
    window.addEventListener('resize', () => this.isOpen && this.drawViewer());
  }

  open() {
    if (!this.hasRuns) return false;
    this.runIndex = 0;
    this.sel = -1;
    this.el.hidden = false;
    this.render();
    return true;
  }

  close() { this.el.hidden = true; }

  handleKey(e) {
    if (e.key === 'Escape' || e.key.toLowerCase() === 'v') this.close();
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') this.step(1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') this.step(-1);
    else if (e.key.toLowerCase() === 'a') this.select(-1);
    else return false;
    return true;
  }

  get run() { return this.runs[this.runIndex]; }

  step(d) {
    const n = this.run.shots.length;
    if (!n) return;
    let i = this.sel + d;
    if (i < -1) i = n - 1;
    if (i >= n) i = -1;
    this.select(i);
  }

  select(i) {
    this.sel = i;
    this.render();
  }

  // Progress on this course (main.js sets progress(course) -> { label,
  // better: 'low' | 'high', points: [{ v, date }] } from the run log): the last
  // runs as a line, the latest labelled; hover a point for its value.
  renderProgress(course) {
    const box = this.el.querySelector('#review-progress');
    const P = this.progress?.(course);
    if (!box || !P || P.points.length < 2) { if (box) box.innerHTML = ''; return; }
    const W = Math.max(300, box.clientWidth || 600), H = 110, L = 40, R = 60, T = 10, B = 18, pts = P.points, n = pts.length;
    const vs = pts.map(p => p.v), lo = Math.min(...vs), hi = Math.max(...vs), pad = (hi - lo) * 0.15 || hi * 0.1 || 1;
    const y0 = lo - pad, y1 = hi + pad;
    const X = i => L + (n === 1 ? 0 : (i / (n - 1)) * (W - L - R)), Y = v => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
    const f = v => v.toFixed(2);
    const grid = [lo, hi].map(v => `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text class="ax" x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${f(v)}</text>`).join('');
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`).join('');
    const dots = pts.map((p, i) => `<circle class="pt" cx="${X(i)}" cy="${Y(p.v)}" r="4"><title>Run ${i + 1}: ${f(p.v)} ${P.unit} (${p.date})</title></circle>`).join('');
    const last = pts[n - 1];
    box.innerHTML = `<h3>${P.label} - your last ${n} runs on ${course} (${P.better === 'low' ? 'lower' : 'higher'} is better)</h3>` +
      `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${P.label} over your last ${n} runs">${grid}<path class="ln" d="${path}"/>${dots}` +
      `<text class="ax" x="${X(n - 1) + 8}" y="${Y(last.v) + 4}">${f(last.v)} ${P.unit}</text>` +
      `<text class="ax" x="${L}" y="${H - 4}">oldest</text><text class="ax" x="${W - R}" y="${H - 4}" text-anchor="end">latest</text></svg>`;
  }

  render() {
    const run = this.run;
    const q = s => this.el.querySelector(s);
    this.renderProgress(run.course);
    // Run picker.
    const sel = q('#review-run');
    sel.innerHTML = '';
    this.runs.forEach((r, i) => {
      const verdict = r.result?.passed === true ? 'PASS' : r.result?.passed === false ? 'FAIL' : 'done';
      sel.add(new Option(`${r.course} — ${verdict} — ${new Date(r.startMs + performance.timeOrigin).toLocaleTimeString()}`, i));
    });
    sel.value = this.runIndex;

    // List.
    const tbody = q('#review-list tbody');
    tbody.innerHTML = '';
    run.shots.forEach((s, i) => {
      const tr = document.createElement('tr');
      if (i === this.sel) tr.className = 'sel';
      tr.innerHTML = `<td>${s.n}</td><td>${fmt(s.time)}</td><td>${s.split == null ? '' : fmt(s.split)}</td>` +
        `<td><span class="dot" style="background:${ZONE_COLORS[s.zone] || '#999'}"></span>${s.label}</td><td>${s.points}</td>`;
      tr.onclick = () => this.select(i);
      tbody.appendChild(tr);
    });
    tbody.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
    q('#review-empty').hidden = run.shots.length > 0;
    q('#review-zero').textContent = `Times from the ${run.zeroLabel}`;

    // Caption.
    const s = run.shots[this.sel];
    q('#review-caption').textContent = s
      ? `Shot ${s.n} of ${run.shots.length}: ${s.label}${s.points ? ` (${s.points > 0 ? '+' : ''}${s.points})` : ''} at ${fmt(s.time)}${s.split != null ? `, split ${fmt(s.split)}` : ''}`
      : `All ${run.shots.length} shots on the final frame`;

    // Timeline.
    const tl = q('#review-timeline');
    tl.innerHTML = '';
    const span = Math.max(0.5, ...run.shots.map(x => x.time), run.result?.time || 0);
    run.shots.forEach((x, i) => {
      const b = document.createElement('button');
      b.className = 'tick' + (i === this.sel ? ' sel' : '');
      b.style.left = `${Math.max(0, x.time) / span * 100}%`;
      b.style.background = ZONE_COLORS[x.zone] || '#999';
      b.title = `Shot ${x.n}: ${fmt(x.time)}`;
      b.textContent = x.n;
      b.onclick = () => this.select(i);
      tl.appendChild(b);
    });
    q('#review-span').textContent = fmt(span);

    const url = s ? s.image : run.finalImage;
    if (url && this.img.src !== url) this.img.src = url;
    else this.drawViewer();
  }

  drawViewer() {
    const cv = this.el.querySelector('#review-canvas');
    const box = cv.parentElement.getBoundingClientRect();
    const run = this.run;
    const aspect = window.innerWidth / window.innerHeight;
    let w = box.width, h = w / aspect;
    if (h > box.height) { h = box.height; w = h * aspect; }
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#111';
    g.fillRect(0, 0, w, h);
    if (this.img.complete && this.img.naturalWidth) g.drawImage(this.img, 0, 0, w, h);
    const r = Math.max(9, w * 0.012);
    const mark = (s, big) => {
      const x = s.nx * w, y = s.ny * h;
      const col = ZONE_COLORS[s.zone] || '#999';
      g.lineWidth = big ? 3 : 2;
      g.strokeStyle = '#000';
      g.beginPath(); g.arc(x, y, (big ? r * 1.6 : r) + 1.5, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = col;
      g.beginPath(); g.arc(x, y, big ? r * 1.6 : r, 0, Math.PI * 2); g.stroke();
      g.fillStyle = col;
      g.beginPath(); g.arc(x, y, 2.5, 0, Math.PI * 2); g.fill();
      g.font = `700 ${Math.round(r * (big ? 1.3 : 1.05))}px system-ui, sans-serif`;
      g.textAlign = 'left';
      g.textBaseline = 'bottom';
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(0,0,0,0.8)';
      const tx = x + r * 0.9, ty = y - r * 0.6;
      g.strokeText(String(s.n), tx, ty);
      g.fillStyle = '#fff';
      g.fillText(String(s.n), tx, ty);
    };
    if (this.sel < 0) run.shots.forEach(s => mark(s, false));
    else mark(run.shots[this.sel], true);
  }
}

const fmt = v => (v == null ? '--' : `${v.toFixed(2)}s`);

export { ZONE_COLORS };
