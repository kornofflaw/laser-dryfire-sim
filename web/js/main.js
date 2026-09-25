// main.js — wires everything together.
// ---------------------------------------------------------------------------
// ONE SHOT PATH: the mouse and the laser camera both call shoot(nx, ny, tMs).
// shoot() classifies the hit (Range.scoreShot), registers it (the only place
// points are added: Game.registerScoredShot), then lets the target react and
// plays the sounds. Nothing else scores.

import { CONFIG } from './config.js';
import { load, save, remove } from './storage.js';
import { unlockAudio, shotPop, hitDing } from './audio.js';
import { Range, LAYOUTS } from './range.js';
import { Game } from './game.js';
import { RunController, State } from './run.js';
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
  drillIndex: 0,
  seenHelp: false,
}, load(CONFIG.storage.settings, {}));
const persist = () => save(CONFIG.storage.settings, settings);

const range = new Range();
const game = new Game();
const run = new RunController(game);
const log = new RunLog();
const camera = new LaserCamera();
let lastInput = 'mouse';

run.drillIndex = Math.min(settings.drillIndex, CONFIG.drills.length - 1);
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
  const s = range.scoreShot(nx, ny);
  const score = { ...s, nx, ny, t: tMs, source };
  lastInput = source;
  game.registerScoredShot(score);
  range.onShot(nx, ny, score, tMs / 1000);
  shotPop();
  if (score.zone !== 'Miss') hitDing();
}

camera.onShot = (nx, ny, t) => {
  if (settings.cameraShots && !calibration.active) shoot(nx, ny, t, 'laser');
};

run.onComplete(result => log.add(result, lastInput));

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
window.addEventListener('resize', () => { resize(); refreshSetup(); });

canvas.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  unlockAudio();
  if (!settings.mouseShots) return;
  shoot(e.clientX / window.innerWidth, e.clientY / window.innerHeight, performance.now(), 'mouse');
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

function drawBackground(W, H) {
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, getVar('--wall-top'));
  grad.addColorStop(1, getVar('--wall-bottom'));
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  // A faint floor line gives the range a sense of depth.
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, H * 0.86, W, H * 0.14);
}

const cssVars = {};
function getVar(name) {
  return cssVars[name] ??= getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

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

function timerHTML(now) {
  const head = `<b class="title">SHOT TIMER</b>`;
  const d = run.drill;
  switch (run.state) {
    case State.Idle:
      return head + `Press [Space] to start\nPar: ${d.parTime.toFixed(1)}s`;
    case State.Delay:
      return head + `<span class="wait">STAND BY…</span>\nwait for the beep` +
        (run.early ? `\n<span class="bad">Early shot! (${run.early})</span>` : '');
    case State.Running:
      return head + `<span class="go">GO!</span>\n` +
        `Par in: ${run.parRemaining(now).toFixed(2)}s\n` +
        `First shot: ${run.firstShot == null ? '--' : f2(run.firstShot) + 's'}\n` +
        `Split: ${run.lastSplit == null ? '--' : f2(run.lastSplit) + 's'}\n` +
        `Shots: ${run.shots}   Hits: ${run.hits}` +
        (run.early ? `\n<span class="bad">Jumped the beep (${run.early})</span>` : '');
    case State.Done: {
      const r = run.result;
      return head + `<b>DONE</b>\n` +
        `First shot: ${r.firstShot == null ? '--' : f2(r.firstShot) + 's'}\n` +
        `Shots: ${r.shots}   Hits: ${r.hits}\n` +
        (r.early ? `<span class="bad">Jumped the beep (${r.early})</span>\n` : '') +
        `<span class="muted small">[Space] run again</span>`;
    }
  }
  return head;
}

function drillHTML() {
  const head = `<b class="title">DRILL</b>`;
  const footer = `<span class="muted small">[Tab] change drill  ·  [Space] run</span>`;
  const d = run.drill;
  const rounds = d.requiredShots > 0 ? `${d.requiredShots} rounds` : 'any number of rounds';

  if (run.state === State.Running || run.state === State.Delay) {
    const counts = run.usesCriteria
      ? `Body: ${run.bodyHits}   Head: ${run.counts.Head}`
      : `Points: ${run.points}   A: ${run.counts.A}`;
    return head + `<span class="go">${d.name}</span>\n` +
      `Shots: ${run.shots}${d.requiredShots ? ' / ' + d.requiredShots : ''}\n` + counts;
  }

  const r = run.result;
  if (r && r.drill === d.name) {
    const parTag = r.madePar ? '<span class="go">made par</span>' : '<span class="bad">over par</span>';
    let verdict = 'done';
    if (r.passed === true) verdict = '<span class="go">PASS</span>';
    else if (r.passed === false) verdict = '<span class="bad">FAIL</span>';
    const lines = [`<b>${d.name}</b> — ${verdict}`];
    if (!r.complete) lines.push(`<span class="bad">Incomplete: ${r.shots}/${r.requiredShots} rounds</span>`);
    lines.push(`Time: ${f2(r.time)}s` + (d.requiredShots ? `   ${parTag}` : ''));
    if (r.hasCriteria) lines.push(`Body: ${r.bodyHits}   Head: ${r.counts.Head}   A: ${r.counts.A}`);
    else lines.push(`Points: ${r.points}   A: ${r.counts.A}  C: ${r.counts.C}  D: ${r.counts.D}  M: ${r.counts.Miss}`);
    lines.push(`Hit factor: ${f2(r.hitFactor)}`);
    return head + lines.join('\n') + '\n' + footer;
  }

  return head + `${d.name}\n${rounds}  ·  par ${d.parTime.toFixed(1)}s\n` + footer;
}

// ---- Main loop ---------------------------------------------------------------------
let lastFrame = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;

  run.update(now);
  range.update(dt, now / 1000);

  const W = window.innerWidth, H = window.innerHeight;
  drawBackground(W, H);
  range.draw(g, now / 1000, settings.showZones);

  setHUD('stats', statsHTML(now));
  setHUD('timer', timerHTML(now));
  setHUD('drill', drillHTML());

  if (!$('#setup').hidden) updateCameraStatus();
  requestAnimationFrame(frame);
}

// ---- Actions ---------------------------------------------------------------------------
const actions = {
  start() {
    unlockAudio();
    if (run.busy) return;
    range.reset();
    run.start(performance.now());
  },
  drill(step = 1) {
    run.cycleDrill(step);
    settings.drillIndex = run.drillIndex;
    persist();
  },
  layout() {
    if (run.busy) return toast('Finish or cancel the run first (Esc).');
    const keys = Object.keys(LAYOUTS);
    settings.layout = keys[(keys.indexOf(settings.layout) + 1) % keys.length];
    range.setLayout(settings.layout);
    persist();
    refreshSetup();
    toast(LAYOUTS[settings.layout]);
  },
  zones() {
    settings.showZones = !settings.showZones;
    persist();
    refreshSetup();
  },
  reset() {
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

  if (!$('#help').hidden) {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); closeHelp(); }
    return;
  }

  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const map = {
    ' ': () => actions.start(),
    Tab: () => actions.drill(e.shiftKey ? -1 : 1),
    l: () => actions.layout(),
    z: () => actions.zones(),
    r: () => actions.reset(),
    s: () => actions.setup(),
    f: () => actions.fullscreen(),
    c: () => actions.calibrate(),
    h: () => actions.hideHud(),
    '?': () => actions.help(),
    Escape: () => {
      if (!$('#setup').hidden) closeSetup();
      else if (run.busy) { run.cancel(); toast('Run cancelled.'); }
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
  settings.layout = layoutSel.value;
  range.setLayout(settings.layout);
  persist();
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

function refreshSetup() {
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
range.setLayout(settings.layout);
refreshSetup();
if (!settings.seenHelp) $('#help').hidden = false;
// Reopen the camera if it was on last time (works once permission was granted).
if (settings.cameraOn && LaserCamera.supported()) startCamera(settings.deviceId);
requestAnimationFrame(frame);
