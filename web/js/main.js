// main.js — wires everything together.
// ---------------------------------------------------------------------------
// ONE SHOT PATH: the mouse and the laser camera both call shoot(nx, ny, tMs).
// shoot() classifies the hit (Range.scoreShot), registers it (the only place
// points are added: Game.registerScoredShot), then lets the target react and
// plays the sounds. Nothing else scores.

import { CONFIG } from './config.js';
import { load, save, remove } from './storage.js';
import { unlockAudio, shotPop, hitDing, steelPing, penaltyBuzz } from './audio.js';
import { Range, LAYOUTS } from './range.js';
import { Game } from './game.js';
import { DrillRunner } from './run.js';
import { DotTortureRunner } from './dots.js';
import { ScenarioRunner } from './scenario.js';
import { PopupRunner } from './popdrill.js';
import { KnifeRunner } from './knife.js';
import { FlipRunner } from './flipdrill.js';
import { COURSES, CATEGORIES } from './courses.js';
import { RunLog } from './log.js';
import { LaserCamera } from './camera.js';
import { Calibration } from './calibrate.js';

const $ = sel => document.querySelector(sel);

// ---- State -------------------------------------------------------------------
const settings = Object.assign({
  layout: 'bay',
  showZones: false,
  mouseShots: true,
  cameraShots: true,
  cameraOn: false,
  deviceId: '',
  threshold: CONFIG.camera.threshold,
  course: 'Free Run',
  seenHelp: false,
  upTimes: {},        // per-course "time up" overrides (seconds)
  cars3d: CONFIG.knife3d.defaultCars, // parked cars in the 3D lot
  blood: true,        // 3D blood effects
}, load(CONFIG.storage.settings, {}));
const persist = () => save(CONFIG.storage.settings, settings);

const range = new Range();
const game = new Game();
const log = new RunLog();
const camera = new LaserCamera();
let lastInput = 'mouse';

// One runner per course type; `active()` is the one for the selected course.
const runners = {
  drill: new DrillRunner(),
  dots: new DotTortureRunner(range),
  scenario: new ScenarioRunner(range),
  popup: new PopupRunner(range),
  knife: new KnifeRunner(range),
  flip: new FlipRunner(range),
};
// 3D courses load three.js and their assets on demand (knife3d.js).
let view3d = null;
let loading3d = null;
class Loading3DRunner extends DrillRunner {
  panelHTML() {
    const pct = view3d ? Math.round(view3d.progress * 100) : 0;
    return `<b class="title">JUDGMENT · 3D</b><b>${this.course.name}</b>\nLoading 3D scene… ${pct}%` +
      (this.error ? `\n<span class="bad">${this.error}</span>` : '');
  }
  timerHTML() { return `<b class="title">3D</b>Loading…`; }
  start() {}
}
runners.knife3d = new Loading3DRunner();

function ensure3D() {
  if (loading3d) return loading3d;
  loading3d = (async () => {
    const mod = await import('./knife3d.js');
    view3d = new mod.Lot3DView($('#range3d'));
    range.view3d = view3d;
    try {
      await view3d.init({ cars: settings.cars3d });
      view3d.blood = settings.blood;
    } catch (e) {
      runners.knife3d.error = `Could not load the 3D scene (${e.message}). This needs WebGL.`;
      throw e;
    }
    const r = new mod.Knife3DRunner(range, view3d);
    r.onComplete(result => log.add(result, lastInput));
    runners.knife3d = r;
    if (course().type === 'knife3d') r.setCourse(withUpTime(course()));
  })();
  return loading3d;
}

let courseIndex = Math.max(0, COURSES.findIndex(c => c.name === settings.course));
const course = () => COURSES[courseIndex];
const active = () => runners[course().type];
game.on(score => active().onShot(score));
for (const r of Object.values(runners)) r.onComplete(result => log.add(result, lastInput));

camera.threshold = settings.threshold;

const savedCal = load(CONFIG.storage.calibration, null);
if (savedCal && Array.isArray(savedCal.H) && savedCal.H.length === 9) camera.H = savedCal.H;

const calibration = new Calibration(camera, H => {
  if (H) {
    const cal = {
      H,
      savedAt: new Date().toISOString(),
      viewport: { w: window.innerWidth, h: window.innerHeight },
      camera: { w: camera.video.videoWidth, h: camera.video.videoHeight },
    };
    camera.H = H;
    save(CONFIG.storage.calibration, cal);
    toast('Calibration saved.');
  }
  refreshSetup();
});

// ---- The single shot path ------------------------------------------------------
function shoot(nx, ny, tMs, source) {
  let score = { ...range.scoreShot(nx, ny), nx, ny, t: tMs, source };
  // A runner may re-judge a shot before it counts (Dot Torture: wrong dot = miss).
  score = active().judge?.(score) ?? score;
  lastInput = source;
  game.registerScoredShot(score);
  range.onShot(nx, ny, score, tMs / 1000);
  shotPop();
  if (score.zone === 'Steel' || score.zone === 'Tile') steelPing();
  else if (score.zone === 'NS' || score.wrongDot || score.wrongTile) penaltyBuzz();
  else if (['A', 'C', 'D', 'Head'].includes(score.zone)) hitDing();
}

camera.onShot = (nx, ny, t) => {
  if (settings.cameraShots && !calibration.active) shoot(nx, ny, t, 'laser');
};

// ---- Canvas ------------------------------------------------------------------
const canvas = $('#range');
const g = canvas.getContext('2d');

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const W = window.innerWidth, H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  range.resize(W, H);
}
window.addEventListener('resize', () => { resize(); view3d?.resize(window.innerWidth, window.innerHeight); refreshSetup(); });

canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  unlockAudio();
  if (!settings.mouseShots) return;
  shoot(e.clientX / window.innerWidth, e.clientY / window.innerHeight, performance.now(), 'mouse');
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ---- HUD -------------------------------------------------------------------------
const hudEls = { stats: $('#stats'), timer: $('#timer'), drill: $('#drill') };
const hudCache = {};
function setHUD(key, html) {
  if (hudCache[key] === html) return;
  hudCache[key] = html;
  hudEls[key].innerHTML = html;
}

const f2 = v => (v == null ? '--' : v.toFixed(2));

function statsHTML(now) {
  return `<b class="title">SESSION</b>` +
    `Score: ${game.score}\n` +
    `Hits: ${game.hits} / ${game.shots}\n` +
    `Accuracy: ${game.accuracy.toFixed(1)}%\n` +
    `Split: ${game.shots > 1 ? f2(game.lastSplit) + 's' : '--'}\n` +
    `Time: ${game.sessionTime(now).toFixed(1)}s\n` +
    `<span class="muted small">Input: ${inputLabel()}  ·  [R] reset</span>`;
}

function inputLabel() {
  const parts = [];
  if (settings.mouseShots) parts.push('mouse');
  if (settings.cameraShots && camera.active) parts.push(camera.calibrated ? 'laser' : 'laser (not calibrated)');
  return parts.join(' + ') || 'none';
}

// ---- Main loop ---------------------------------------------------------------------
let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;

  active().update(now);
  range.autoResetStar = !active().busy;
  range.autoPopups = course().type !== 'popup'; // free practice pops targets itself
  range.autoFlip = course().type !== 'flip';
  range.update(dt, now / 1000);

  const W = window.innerWidth, H = window.innerHeight;
  const show3d = range.layout === 'lot3d' && view3d?.ready;
  view3d?.setVisible(show3d);
  if (show3d) view3d.render(now);
  range.draw(g, now / 1000, settings.showZones);
  active().drawOverlay?.(g, W, H, now);

  setHUD('stats', statsHTML(now));
  setHUD('timer', active().timerHTML(now));
  setHUD('drill', active().panelHTML(now));

  if (!$('#setup').hidden) updateCameraStatus();
  requestAnimationFrame(frame);
}

// ---- Actions ---------------------------------------------------------------------------
// A course with the user's saved "time up" applied (flip grid / pop-ups).
function withUpTime(c) {
  const base = settings.upTimes?.[c.name];
  if (base == null || c.upTime == null) return c;
  return { ...c, upTime: scaledUpTime(c.upTime, base) };
}
// Array up-times (a shrinking range) keep their shape: the first value is set,
// the last scales with it.
function scaledUpTime(def, base) {
  if (!Array.isArray(def)) return base;
  return [base, Math.round(base * (def[1] / def[0]) * 10) / 10];
}
function upTimeBase(c) {
  const u = active().course?.name === c.name ? active().course.upTime : withUpTime(c).upTime;
  return Array.isArray(u) ? u[0] : u;
}

function setUpTime(value) {
  const c = course();
  if (c.upTime == null) return toast('This course has no time-up setting.');
  if (active().busy) return toast('Finish or cancel the run first (Esc).');
  const U = CONFIG.upTime;
  const v = Math.round(Math.min(U.max, Math.max(U.min, value)) * 10) / 10;
  settings.upTimes = { ...(settings.upTimes || {}), [c.name]: v };
  persist();
  active().setCourse(withUpTime(c));
  refreshSetup();
  const u = active().course.upTime;
  toast(`Time up: ${Array.isArray(u) ? `${u[0].toFixed(1)}s → ${u[1].toFixed(1)}s` : `${u.toFixed(1)}s`}`);
}

function adjustUpTime(dir) {
  if (course().upTime == null) return toast('[ and ] change the time up on flip grid and pop-up courses.');
  setUpTime(upTimeBase(course()) + dir * CONFIG.upTime.step);
}

// Pick a course: set its runner and put up its targets.
function selectCourse(i, announce = true) {
  if (active().busy) return toast('Finish or cancel the run first (Esc).');
  courseIndex = (i + COURSES.length) % COURSES.length;
  const c = course();
  active().setCourse(withUpTime(c));
  range.setLayout(c.layout ?? settings.layout);
  if (c.type === 'knife3d') ensure3D().catch(() => {});
  settings.course = c.name;
  persist();
  renderCourseList();
  refreshSetup();
  if (announce) toast(c.name);
}

const actions = {
  start() {
    unlockAudio();
    const r = active();
    if (r.busy) return;
    if (course().type === 'drill') range.setLayout(course().layout ?? settings.layout);
    r.start(performance.now());
  },
  drill(step = 1) { selectCourse(courseIndex + step); },
  courses() { toggleCourses(); },
  layout() {
    if (active().busy) return toast('Finish or cancel the run first (Esc).');
    const keys = Object.keys(LAYOUTS);
    settings.layout = keys[(keys.indexOf(settings.layout) + 1) % keys.length];
    persist();
    // Changing targets means free practice.
    if (course().layout != null) selectCourse(0, false);
    range.setLayout(settings.layout);
    refreshSetup();
    toast(LAYOUTS[settings.layout]);
  },
  zones() {
    settings.showZones = !settings.showZones;
    persist();
    refreshSetup();
  },
  reset() {
    active().cancel();
    game.reset();
    range.reset();
    toast('Session reset.');
  },
  setup() { toggleSetup(); },
  fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => toast('Fullscreen was blocked by the browser.'));
  },
  help() { $('#help').hidden = false; },
  calibrate() {
    if (!camera.active) {
      openSetup();
      return toast('Start the camera first.');
    }
    closeSetup();
    calibration.open();
  },
  hideHud() { $('#hud').classList.toggle('hidden'); },
};

$('#toolbar').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  b.blur(); // so Space doesn't re-press the button
  actions[b.dataset.act]?.();
});
$('[data-act="close-help"]').onclick = () => closeHelp();
$('[data-act="close-setup"]').onclick = () => closeSetup();

function closeHelp() {
  $('#help').hidden = true;
  settings.seenHelp = true;
  persist();
}

window.addEventListener('keydown', e => {
  unlockAudio();
  if (calibration.active) {
    if (calibration.handleKey(e)) e.preventDefault();
    return;
  }
  const tag = e.target.tagName;
  if ((tag === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'range') || tag === 'SELECT') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  if (!$('#courses').hidden) {
    if (e.key === 'Escape' || e.key.toLowerCase() === 'd') { e.preventDefault(); closeCourses(); }
    return;
  }
  if (!$('#help').hidden) {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closeHelp(); }
    return;
  }

  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const map = {
    ' ': () => actions.start(),
    Tab: () => actions.drill(e.shiftKey ? -1 : 1),
    l: () => actions.layout(),
    d: () => actions.courses(),
    z: () => actions.zones(),
    r: () => actions.reset(),
    s: () => actions.setup(),
    f: () => actions.fullscreen(),
    c: () => actions.calibrate(),
    h: () => actions.hideHud(),
    '?': () => actions.help(),
    '[': () => adjustUpTime(-1),
    ']': () => adjustUpTime(1),
    Escape: () => {
      if (!$('#setup').hidden) closeSetup();
      else if (active().busy) { active().cancel(); toast('Run cancelled.'); }
    },
  };
  if (map[k]) {
    e.preventDefault();
    map[k]();
  }
});

// ---- Setup drawer --------------------------------------------------------------------------
function toggleSetup() { $('#setup').hidden ? openSetup() : closeSetup(); }
function openSetup() {
  $('#setup').hidden = false;
  camera.preview = $('#cam-preview');
  refreshSetup();
  refreshDevices();
}
function closeSetup() {
  $('#setup').hidden = true;
  camera.preview = null;
}

const layoutSel = $('#opt-layout');
for (const [key, label] of Object.entries(LAYOUTS)) layoutSel.add(new Option(label, key));
layoutSel.onchange = () => {
  if (active().busy) { refreshSetup(); return toast('Finish or cancel the run first (Esc).'); }
  settings.layout = layoutSel.value;
  persist();
  if (course().layout != null) selectCourse(0, false);
  range.setLayout(settings.layout);
};
$('#opt-zones').onchange = e => { settings.showZones = e.target.checked; persist(); };
$('#opt-mouse').onchange = e => { settings.mouseShots = e.target.checked; persist(); };
$('#opt-camera-shots').onchange = e => { settings.cameraShots = e.target.checked; persist(); };

const thr = $('#cam-thr');
thr.oninput = () => {
  camera.threshold = settings.threshold = Number(thr.value);
  $('#cam-thr-val').textContent = thr.value;
  persist();
};

$('#cam-toggle').onclick = async () => {
  if (camera.active) {
    camera.stop();
    settings.cameraOn = false;
    persist();
    refreshSetup();
    return;
  }
  await startCamera($('#cam-device').value);
};

$('#cam-device').onchange = async e => {
  settings.deviceId = e.target.value;
  persist();
  if (camera.active) await startCamera(settings.deviceId);
};

$('#cam-calibrate').onclick = () => actions.calibrate();
$('#cam-clear-cal').onclick = () => {
  camera.H = null;
  remove(CONFIG.storage.calibration);
  refreshSetup();
  toast('Calibration cleared.');
};

$('#log-download').onclick = () => {
  if (!log.rows.length) return toast('No runs logged yet.');
  log.download();
};
$('#log-clear').onclick = () => {
  if (!log.rows.length) return;
  if (confirm(`Delete all ${log.rows.length} logged runs from this browser?`)) {
    log.clear();
    refreshSetup();
  }
};

async function startCamera(deviceId) {
  $('#cam-status').textContent = 'Starting…';
  try {
    await camera.start(deviceId || undefined);
    settings.cameraOn = true;
    settings.deviceId = camera.deviceId || deviceId || '';
    persist();
    await refreshDevices();
  } catch {
    settings.cameraOn = false;
    persist();
    toast(camera.error || 'Could not start the camera.');
  }
  refreshSetup();
}

async function refreshDevices() {
  const sel = $('#cam-device');
  let devices = [];
  try { devices = await LaserCamera.listDevices(); } catch { /* ignore */ }
  const current = camera.deviceId || settings.deviceId;
  sel.length = 0;
  sel.add(new Option('Default camera', ''));
  devices.forEach((d, i) => sel.add(new Option(d.label || `Camera ${i + 1}`, d.deviceId)));
  sel.value = devices.some(d => d.deviceId === current) ? current : '';
}

$('#up-time').oninput = e => setUpTime(Number(e.target.value));
$('#up-time-reset').onclick = () => {
  const c = course();
  if (active().busy) return toast('Finish or cancel the run first (Esc).');
  const rest = { ...(settings.upTimes || {}) };
  delete rest[c.name];
  settings.upTimes = rest;
  persist();
  active().setCourse(c);
  refreshSetup();
  toast('Time up reset to default.');
};

$('#cars3d').oninput = e => {
  settings.cars3d = Number(e.target.value);
  $('#cars3d-val').textContent = settings.cars3d;
  persist();
  view3d?.setCarCount(settings.cars3d);
};

$('#opt-blood').onchange = e => {
  settings.blood = e.target.checked;
  persist();
  if (view3d) view3d.blood = settings.blood;
};

function refreshSetup() {
  const c = course();
  $('#opt-blood').checked = settings.blood;
  $('#cars3d-row').hidden = c.type !== 'knife3d';
  $('#cars3d').max = CONFIG.knife3d.maxCars;
  $('#cars3d').value = settings.cars3d;
  $('#cars3d-val').textContent = settings.cars3d;
  const hasUp = c.upTime != null;
  $('#up-time-row').hidden = !hasUp;
  $('#up-time-none').hidden = hasUp;
  $('#course-name').textContent = c.name;
  if (hasUp) {
    const U = CONFIG.upTime;
    const slider = $('#up-time');
    slider.min = U.min; slider.max = U.max; slider.step = U.step;
    slider.value = upTimeBase(c);
    const u = active().course?.upTime ?? c.upTime;
    $('#up-time-val').textContent = Array.isArray(u) ? `${u[0].toFixed(1)}s → ${u[1].toFixed(1)}s` : `${u.toFixed(1)}s`;
  }
  layoutSel.value = settings.layout;
  $('#opt-zones').checked = settings.showZones;
  $('#opt-mouse').checked = settings.mouseShots;
  $('#opt-camera-shots').checked = settings.cameraShots;
  thr.value = settings.threshold;
  $('#cam-thr-val').textContent = settings.threshold;

  const supported = LaserCamera.supported();
  $('#cam-support').textContent = supported
    ? ''
    : 'This browser cannot use a camera here. Use a current Chrome or Edge over https.';
  $('#cam-toggle').disabled = !supported;
  $('#cam-toggle').textContent = camera.active ? 'Stop camera' : 'Start camera';
  updateCameraStatus();

  const cal = load(CONFIG.storage.calibration, null);
  let calText = 'Not calibrated. Laser shots are ignored until you calibrate.';
  if (camera.H && cal) {
    calText = `Calibrated ${new Date(cal.savedAt).toLocaleString()}.`;
    const vw = window.innerWidth, vh = window.innerHeight;
    if (cal.viewport && (Math.abs(cal.viewport.w - vw) > 2 || Math.abs(cal.viewport.h - vh) > 2)) {
      calText += ` It was done at ${cal.viewport.w}×${cal.viewport.h}, but the page is now ${vw}×${vh}. Go fullscreen, or recalibrate.`;
    }
  }
  $('#cal-status').textContent = calText;

  $('#log-status').textContent = log.rows.length
    ? `${log.rows.length} run${log.rows.length === 1 ? '' : 's'} logged in this browser.`
    : 'No runs logged yet. Each finished timed run adds a row.';
}

function updateCameraStatus() {
  const el = $('#cam-status');
  if (!camera.active) { el.textContent = camera.error ? 'Error' : 'Off'; return; }
  const v = camera.video;
  const dot = camera.lastDot ? `  ·  dot ${camera.lastDot.peak}` : '';
  el.textContent = `${v.videoWidth}×${v.videoHeight} @ ${camera.fps.toFixed(0)} fps${dot}`;
}

// ---- Course picker ---------------------------------------------------------------------------
function toggleCourses() { $('#courses').hidden ? openCourses() : closeCourses(); }
function openCourses() {
  renderCourseList();
  $('#courses').hidden = false;
  $('#course-list .current')?.focus();
}
function closeCourses() { $('#courses').hidden = true; }
$('[data-act="close-courses"]').onclick = () => closeCourses();
$('#courses').addEventListener('click', e => {
  if (e.target.id === 'courses') closeCourses(); // click outside the card
});

function renderCourseList() {
  const list = $('#course-list');
  list.innerHTML = '';
  for (const cat of CATEGORIES) {
    const items = COURSES.map((c, i) => [c, i]).filter(([c]) => c.category === cat);
    if (!items.length) continue;
    const sec = document.createElement('section');
    const h = document.createElement('h3');
    h.textContent = cat;
    sec.appendChild(h);
    const grid = document.createElement('div');
    grid.className = 'course-grid';
    for (const [c, i] of items) {
      const b = document.createElement('button');
      b.className = 'course' + (i === courseIndex ? ' current' : '');
      b.innerHTML = `<b></b><span></span>`;
      b.querySelector('b').textContent = c.name;
      b.querySelector('span').textContent = c.desc;
      b.onclick = () => { selectCourse(i); closeCourses(); };
      grid.appendChild(b);
    }
    sec.appendChild(grid);
    list.appendChild(sec);
  }
}

// ---- Toast -------------------------------------------------------------------------------
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

// ---- Boot --------------------------------------------------------------------------------
resize();
active().setCourse(withUpTime(course()));
range.setLayout(course().layout ?? settings.layout);
if (course().type === 'knife3d') ensure3D().catch(() => {});
refreshSetup();
if (!settings.seenHelp) $('#help').hidden = false;
// Reopen the camera if it was on last time (works once permission was granted).
if (settings.cameraOn && LaserCamera.supported()) startCamera(settings.deviceId);
requestAnimationFrame(frame);

// Test hook: open the page with ?debug to drive it from automated tests.
if (new URLSearchParams(location.search).has('debug')) {
  window.sim = { range, game, runners, active, course, selectCourse, shoot, COURSES };
}
