// main.js — wires everything together.
// ---------------------------------------------------------------------------
// ONE SHOT PATH: the mouse and the laser camera both call shoot(nx, ny, tMs).
// shoot() classifies the hit (Range.scoreShot), registers it (the only place
// points are added: Game.registerScoredShot), then lets the target react and
// plays the sounds. Nothing else scores.

import { CONFIG } from './config.js';
import { load, save, remove } from './storage.js';
import { loadStages, stageCourse, openBuilder, stageRows } from './builder.js';
import { unlockAudio, shotPop, hitDing, steelPing, penaltyBuzz, setAudioForwarder, setAmbience, setVolumes, setSoundChoices, footstep, glassBreak, distantShot, setRain, say } from './audio.js';
import { CHANNEL, REMOTE_ACTIONS, snapshotControls } from './remote.js';
import { Range, LAYOUTS, RANGE3D_KIND, TO_3D, is3DLayout } from './range.js';
import { Game } from './game.js';
import { DrillRunner } from './run.js';
import { DotTortureRunner } from './dots.js';
import { ScenarioRunner } from './scenario.js';
import { PopupRunner } from './popdrill.js';
import { KnifeRunner } from './knife.js';
import { FlipRunner } from './flipdrill.js';
import { StageRunner, StringsRunner, ClassifierRunner } from './stage.js';
import { COURSES, CATEGORIES } from './courses.js';
import { ShotReview } from './review.js';
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
  pars: {},           // per-course par time overrides (seconds; [ ] on drills and stages)
  real3d: true,       // courses whose targets exist in 3D use the photo-realistic 3D range
  yards3d: {},        // 3D range distance per kind of target (defaults: CONFIG.range3d.yards)
  cars3d: CONFIG.knife3d.defaultCars, // parked cars in the 3D lot
  blood: true,        // 3D blood effects
  lotNight: false,    // parking lot at night (knife attack, 3D judgment scenes)
  lotRain: false,     // parking lot in the rain (wet asphalt, rain, rain sound)
  rangeTime: 'day',   // 3D range time of day: day / morning / evening / night
  rangeWind: 'breezy', // 3D range wind: calm / breezy / windy
  bayGap: CONFIG.range3d.bayGap, // 3D range: metres between the 3 bay targets
  bayStagger: false,  // 3D range: bay targets at +0 / +5 / +10 yd
  rangeWeather: 'dry', // 3D range weather: dry / rain
  office: {},         // office scenario options (defaults: CONFIG.office3d.options)
  lifeSize: false,    // 3D field of view matched to the screen (CONFIG.lifeSize)
  quality: 'auto',    // 3D graphics: auto | high | medium | low (CONFIG.post)
  screenIn: CONFIG.lifeSize.screenWidthIn.default,
  viewFt: CONFIG.lifeSize.distanceFt.default,
  flipSpeed: 1,       // flip grid: plate spin / pace multiplier (CONFIG.flip.speed)
  flipVariable: false, // flip grid: vary each time up and pause
  volGun: 1,          // gunshot volume (Setup slider, 1 = normal)
  volAmb: 1,          // background sound volume (Setup slider)
  roCommands: true,   // "Make ready... Are you ready? Standby" before the beep
  paperDing: true,    // a ding on paper hits (real cardboard is silent)
  splitGoal: 0,       // shot timer: flag splits slower than this (s; 0 = off)
  drawGoal: 0,        // shot timer: flag a first shot slower than this (s; 0 = off)
  autoRepeat: 0,      // shot timer REP mode: next drill / stage run starts this many s after the last (0 = off)
  earPro: 'none',     // hearing protection you hear through: none | electronic | passive
  paste: true,        // 3D range: paste holes between runs
  powerFactor: 'minor', // USPSA scoring of C and D hits (CONFIG.powerFactor)
  soundPicks: {},     // Sound choices (compare): overrides of SOUND_DEFAULTS
}, load(CONFIG.storage.settings, {}));
CONFIG.post.quality = settings.quality; // 3D graphics (read by post3d.js)
CONFIG.timer.commands.on = settings.roCommands;
CONFIG.timer.splitGoal = settings.splitGoal;
CONFIG.timer.drawGoal = settings.drawGoal;
CONFIG.range3d.bayGap = settings.bayGap;
CONFIG.range3d.bayStagger = settings.bayStagger ? [0, 5, 10] : [0, 0, 0];
CONFIG.range3d.paste.on = settings.paste;
Object.assign(CONFIG.points, CONFIG.powerFactor[settings.powerFactor] || CONFIG.powerFactor.minor);
const persist = () => save(CONFIG.storage.settings, settings);
// Older versions kept one 3D distance (for the paper targets).
if (typeof settings.dist3d === 'number') {
  settings.yards3d = { paper: settings.dist3d, ...settings.yards3d };
  delete settings.dist3d;
}
const yards3d = kind => settings.yards3d?.[kind] ?? CONFIG.range3d.yards[kind];

const range = new Range();
const game = new Game();
const log = new RunLog();
const camera = new LaserCamera();
let lastInput = 'mouse';
let lastAmbience;          // the scene's background sound, set when it changes
let lastRain = false;      // rain sound on (parking lot + Rain option)

// One runner per course type; `active()` is the one for the selected course.
const runners = {
  drill: new DrillRunner(),
  dots: new DotTortureRunner(range),
  scenario: new ScenarioRunner(range),
  popup: new PopupRunner(range),
  knife: new KnifeRunner(range),
  flip: new FlipRunner(range),
  stage: new StageRunner(),
  strings: new StringsRunner(),
  classifier: new ClassifierRunner(),
};
// 3D courses load three.js and their assets on demand. Each 3D layout has
// its own view (canvas + scene); range.view3d is the one for the current layout.
const views3d = {};
const loading3d = {};
class Loading3DRunner extends DrillRunner {
  panelHTML() {
    const pct = this.view ? Math.round(this.view.progress * 100) : 0;
    return `<b class="title">3D</b><b>${this.course.name}</b>\nLoading 3D scene… ${pct}%` +
      (this.error ? `\n<span class="bad">${this.error}</span>` : '');
  }
  timerHTML() { return `<b class="title">3D</b>Loading…`; }
  start() {}
}
runners.knife3d = new Loading3DRunner();
runners.office3d = new Loading3DRunner();

function ensure3D(type) {
  if (loading3d[type]) return loading3d[type];
  loading3d[type] = (async () => {
    let view, runner;
    try {
      if (type === 'knife3d') {
        const mod = await import('./knife3d.js');
        view = new mod.Lot3DView($('#range3d'));
        views3d.lot3d = view;
        runners.knife3d.view = view;
        await view.init({ cars: settings.cars3d });
        runner = new mod.Knife3DRunner(range, view);
      } else {
        const mod = await import('./office3d.js');
        view = new mod.OfficeView();
        views3d.office3d = view;
        runners.office3d.view = view;
        await view.init();
        runner = new mod.OfficeRunner(range, view);
      }
    } catch (e) {
      runners[type].error = `Could not load the 3D scene (${e.message}). This needs WebGL.`;
      throw e;
    }
    view.blood = settings.blood;
    view.setNight?.(settings.lotNight);
    view.setRain?.(settings.lotRain);
    resize3D();
    if (type === 'office3d') runner.opts = settings.office;
    runner.onComplete(runDone);
    runners[type] = runner;
    if (course().type === type) runner.setCourse(withUpTime(course()));
  })();
  return loading3d[type];
}
const is3D = type => type === 'knife3d' || type === 'office3d';

// The photo-realistic 3D range. The drills run on their normal runners
// (DrillRunner, PopupRunner); only the range and targets are 3D. One view
// serves every 'range3d-*' layout.
let range3dLoading = null;
let range3dError = '';
function ensureRange3D() {
  if (range3dLoading) return range3dLoading;
  range3dLoading = (async () => {
    const mod = await import('./range3d.js');
    const view = new mod.Range3DView();
    for (const l of Object.keys(RANGE3D_KIND)) views3d[l] = view;
    view.layoutName = isRange3D(range.layout) ? range.layout : 'range3d-single';
    const yards = Object.fromEntries(Object.keys(CONFIG.range3d.yards).map(k => [k, yards3d(k)]));
    await view.init({ yards, star: range.star, popups: range.popups, flip: range.flip, stage: () => range.stageDef });
    view.setTime(rangeTime());
    view.setWind(settings.rangeWind);
    view.setWeather(settings.rangeWeather);
    resize3D();
  })().catch(e => { range3dError = `Could not load the 3D range (${e.message}). Turn it off in Setup.`; });
  return range3dLoading;
}
const isRange3D = layout => typeof layout === 'string' && layout.startsWith('range3d');

// The judgment scenarios in 3D: the same scripts and grading (ScenarioRunner),
// realistic people in the 3D parking lot (judge3d.js).
let judge3dLoading = null;
let judge3dError = '';
function ensureJudge3D() {
  judge3dLoading ??= (async () => {
    const mod = await import('./judge3d.js');
    const view = new mod.Judge3DView(range);
    views3d.scene3d = view;
    await view.init({ cars: settings.cars3d });
    view.blood = settings.blood;
    view.setNight?.(settings.lotNight);
    view.setRain?.(settings.lotRain);
    resize3D();
  })().catch(e => { judge3dError = `Could not load the 3D scene (${e.message}). Turn the 3D range off in Setup.`; console.error(e); });
  return judge3dLoading;
}

// Which layout a course uses: its own (the 3D range version when that's on
// and exists), or for free practice the one picked with L.
function layoutFor(c) {
  if (c.layout == null) return settings.layout;
  return settings.real3d && TO_3D[c.layout] ? TO_3D[c.layout] : c.layout;
}
// Put up a course's targets (a stage also needs its item list).
function showCourseLayout(c) {
  range.stageDef = c.stage || null;
  range.setLayout(layoutFor(c));
}
// The 3D range layout the Setup distance slider is about, if any.
const setupLayout3D = () => (isRange3D(range.layout) ? range.layout : TO_3D[course().layout] || null);

// Clearing the range (new run, R) also clears holes on the 3D targets.
range.onReset = () => {
  const v = views3d[range.layout];
  if (!v?.ready || !v.resetTargets) return;
  if (!v.setLayout(range.layout)) v.resetTargets(); // rebuilt for a new layout/stage, or just cleared
};

// Your own stages (builder.js) join the course list, at the end.
for (const s of loadStages()) COURSES.push(stageCourse(s));
let courseIndex = Math.max(0, COURSES.findIndex(c => c.name === settings.course));
const course = () => COURSES[courseIndex];
const active = () => runners[course().type];
game.on(score => active().onShot(score));
for (const r of Object.values(runners)) r.onComplete(runDone);

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

// ---- Shot review -------------------------------------------------------------------
const review = new ShotReview({ canvases: () => [views3d[range.layout]?.canvas, $('#range')] });
// The review's progress chart: this course's last complete runs from the run log.
review.progress = name => {
  const c = COURSES.find(x => x.name === name);
  const byHF = c && (c.type === 'stage' || c.type === 'classifier');
  const rows = log.rows.filter(r => r.drill === name && r.complete === 'yes').slice(-CONFIG.review.progressRuns);
  const points = rows.map(r => ({ v: Number(byHF ? r.hit_factor : r.time_s), date: r.datetime })).filter(p => p.v > 0);
  return { label: byHF ? 'Hit factor' : 'Time', unit: byHF ? 'HF' : 's', better: byHF ? 'high' : 'low', points };
};

// What shot times count from, per course type.
function reviewZero(r) {
  switch (course().type) {
    case 'drill': case 'stage': case 'strings': case 'classifier': return [r.runStart || null, 'beep'];
    case 'dots': return [r.startT, 'start'];
    case 'scenario': return [r.sceneStart, 'scene appearing'];
    case 'popup': return [r.startT, 'start'];
    case 'flip': return [r.revealMs || r.startMs, r.revealMs ? 'plates turning' : 'start'];
    case 'knife': case 'knife3d': return [r.chargeAt || null, 'charge'];
    default: return [r.t0 || null, 'start'];
  }
}

let repeatAt = null; // repeat mode: when the next run starts (performance.now ms)

// Personal bests per course (run.js DrillRunner.remember), kept in this browser.
DrillRunner.bests = load(CONFIG.storage.bests, {}) || {};
DrillRunner.saveBests = b => save(CONFIG.storage.bests, b);

// ---- Match (course type 'match'): its stages one after another -------------------
// Picking a match loads its first stage; after each stage's run the next one
// loads by itself (once you're back from walking the targets / the review);
// after the last, the results. Picking any other course ends the match.
let match = null, matchSelecting = false;
function startMatch(def) {
  match = { def, i: 0, results: [], nextAt: null };
  loadMatchStage();
}
function loadMatchStage() {
  const name = match.def.stages[match.i];
  matchSelecting = true;
  selectCourse(COURSES.findIndex(c => c.name === name), false);
  matchSelecting = false;
  match.nextAt = null;
  toast(`${match.def.name}: stage ${match.i + 1} of ${match.def.stages.length} - ${name}. Space when ready.`);
}
function matchStageDone(result) {
  if (!match || result.course !== match.def.stages[match.i]) return false;
  match.results.push({ name: result.course, type: result.type, points: result.points, time: result.time, hf: result.hitFactor, complete: result.complete });
  match.i++;
  if (match.i < match.def.stages.length) match.nextAt = performance.now() + CONFIG.match.nextStageAfter * 1000;
  else setTimeout(showMatchResults, 1500);
  return true;
}
function showMatchResults() {
  if (!match) return;
  const r = match.results, f = v => v.toFixed(2);
  const pts = r.reduce((a, s) => a + s.points, 0), time = r.reduce((a, s) => a + s.time, 0);
  $('#match-title').textContent = `${match.def.name}: results`;
  if (r.every(s => s.type === 'strings')) {
    // Steel Challenge style: each stage's total time, lowest wins.
    $('#match-body').innerHTML = `<table><tr><th>Stage</th><th>Total time</th></tr>` +
      r.map(s => `<tr><td>${s.name}${s.complete ? '' : ' (incomplete)'}</td><td>${f(s.time)}</td></tr>`).join('') +
      `<tr><th>Match</th><th>${f(time)}</th></tr></table><p class="note">Each stage: its best four strings added up. Lowest match time wins.</p>`;
    $('#match').hidden = false;
    match = null;
    return;
  }
  $('#match-body').innerHTML = `<table><tr><th>Stage</th><th>Points</th><th>Time</th><th>Hit factor</th></tr>` +
    r.map(s => `<tr><td>${s.name}${s.complete ? '' : ' (incomplete)'}</td><td>${s.points}</td><td>${f(s.time)}</td><td>${f(s.hf)}</td></tr>`).join('') +
    `<tr><th>Match</th><th>${pts}</th><th>${f(time)}</th><th>${f(time > 0 ? pts / time : 0)}</th></tr></table>` +
    `<p class="note">Match hit factor = all points / all time. Stage hit factors can be compared with other shooters' on the same stage.</p>`;
  $('#match').hidden = false;
  match = null;
}
$('[data-act="close-match"]').onclick = () => { $('#match').hidden = true; };
function runDone(result) {
  log.add(result, lastInput);
  const inMatch = matchStageDone(result);
  if (result.newBest) setTimeout(() => toast(`New personal best on ${result.course}!`), 400);
  const [zero, label] = reviewZero(active());
  review.finishRun(result, zero, label);
  const walk = isRange3D(range.layout) && views3d[range.layout]?.inspectable?.().length;
  // Repeat mode: the next run starts by itself (any key stops it).
  if (!inMatch && settings.autoRepeat > 0 && ['drill', 'stage', 'strings', 'classifier'].includes(course().type)) {
    repeatAt = performance.now() + settings.autoRepeat * 1000;
    setTimeout(() => { if (repeatAt) toast(`Next run in ${settings.autoRepeat} s - any key stops repeat`); }, 1600);
    return;
  }
  setTimeout(() => { if (!review.isOpen) toast(walk ? 'Press V to review your shots, I to walk up to the targets' : 'Press V to review your shots'); }, 900);
}

// The RO's call on a target, as at a match: "Two alpha", "Alpha, charlie",
// "Alpha, mike", "No-shoot, clean". A stage target is called from its score
// sheet row (its best hits and misses), anything else from its holes.
function scoreCall(w) {
  const NUM = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const WORD = { A: 'alpha', C: 'charlie', D: 'delta', M: 'mike', NS: 'no-shoot' };
  const cap = t => t[0].toUpperCase() + t.slice(1) + '.';
  if (w.noShoot) return cap(!w.zones.length ? 'no-shoot, clean' : w.zones.length > 1 ? `${NUM[w.zones.length] || w.zones.length} hits on the no-shoot` : 'no-shoot hit');
  const row = active().result?.sheet?.find(t => t.id === w.id);
  const marks = row ? row.marks.filter(m => m !== '–') : w.zones;
  if (!marks.length) return row ? 'Disappearing target, no penalty.' : 'No hits.';
  const counts = {};
  for (const m of marks) counts[m] = (counts[m] || 0) + 1;
  const parts = ['A', 'C', 'D', 'M'].filter(z => counts[z]).map(z => (counts[z] > 1 ? `${NUM[counts[z]] || counts[z]} ${WORD[z]}` : WORD[z]));
  return cap(parts.join(', '));
}

// Walking the targets: which one this is and what each hole scored.
function drawWalkLabel(g, W, w) {
  const counts = {};
  for (const z of w.zones) counts[z] = (counts[z] || 0) + 1;
  const holes = w.zones.length;
  const lines = [
    `Target ${w.i + 1} of ${w.n}${w.noShoot ? ' · No-shoot' : ''}`,
    !holes ? 'No hits' : ['A', 'C', 'D', 'M', 'NS'].filter(z => counts[z]).map(z => `${counts[z]} ${z === 'M' ? 'hard cover' : z}`).join(' · ') + ` (${holes} hole${holes > 1 ? 's' : ''})`,
    `[I] ${w.i + 1 < w.n ? 'next target' : 'back to the line'} · [Esc] back to the line`,
  ];
  g.save();
  g.font = '600 18px system-ui, sans-serif';
  const bw = Math.max(...lines.map(l => g.measureText(l).width)) + 36, bh = 88, x = (W - bw) / 2, y = 16;
  g.fillStyle = 'rgba(20,24,28,0.72)';
  g.beginPath();
  g.roundRect(x, y, bw, bh, 12);
  g.fill();
  g.textAlign = 'center';
  g.textBaseline = 'top';
  g.fillStyle = '#fff';
  g.fillText(lines[0], W / 2, y + 12);
  g.font = '500 16px system-ui, sans-serif';
  g.fillStyle = w.noShoot && holes ? '#ff8f8f' : '#e8e2d0';
  g.fillText(lines[1], W / 2, y + 38);
  g.font = '500 13px system-ui, sans-serif';
  g.fillStyle = '#a9b0b8';
  g.fillText(lines[2], W / 2, y + 63);
  g.restore();
}

// ---- The single shot path ------------------------------------------------------
function shoot(nx, ny, tMs, source) {
  if (range.view3d?.walking) return; // downrange looking at the targets
  let score = { ...range.scoreShot(nx, ny), nx, ny, t: tMs, source };
  // A runner may re-judge a shot before it counts (Dot Torture: wrong dot = miss).
  score = active().judge?.(score) ?? score;
  lastInput = source;
  if (active().busy) review.recordShot(score, active().shotZero?.());
  game.registerScoredShot(score);
  range.onShot(nx, ny, score, tMs / 1000);
  shotPop({ indoor: range.layout === 'office3d', outdoor: range.layout !== 'office3d' }); // the office echoes; outside, a recorded echo
  if (score.zone === 'Steel' || score.zone === 'Tile' || score.noFall) steelPing(score.size, { dist: score.dist, pan: nx * 2 - 1 }); // bigger plates ring lower and longer; far steel later and quieter
  else if (score.zone === 'NS' || score.wrongDot || score.wrongTile) penaltyBuzz();
  else if (['A', 'C', 'D', 'Head'].includes(score.zone) && score.kind !== 'actor' && settings.paperDing) hitDing(); // people react instead of dinging
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
window.addEventListener('resize', () => {
  resize();
  resize3D();
  refreshSetup();
});

// Life-size: the vertical field of view that makes the 3D scene true to size
// for the viewer (null = the usual framing).
function lifeFov() {
  if (!settings.lifeSize) return null;
  const hIn = settings.screenIn * (window.innerHeight / window.innerWidth);
  return THREE_DEG * 2 * Math.atan(hIn / 2 / (settings.viewFt * 12));
}
const THREE_DEG = 180 / Math.PI;
function resize3D() {
  const fov = lifeFov();
  CONFIG.post.quality = settings.quality;
  for (const v of new Set(Object.values(views3d))) {
    v.fovOverride = fov;
    // Views without the effects pipeline: cap their resolution by the chosen
    // quality (once per change, so the 3D range's own step-down stays).
    if (!v.post && v.renderer && v.qualitySet !== settings.quality) {
      v.qualitySet = settings.quality;
      const P = CONFIG.post, cap = P.steps[P.modes[settings.quality] ?? 0].dpr;
      v.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2, cap));
    }
    v.resize(window.innerWidth, window.innerHeight);
  }
}

canvas.addEventListener('pointerdown', e => {
  if (e.button === 2) { active().setCover?.(true); return; } // hold the right button: take cover (office)
  if (e.button !== 0) return;
  unlockAudio();
  if (!settings.mouseShots) return;
  shoot(e.clientX / window.innerWidth, e.clientY / window.innerHeight, performance.now(), 'mouse');
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerup', e => { if (e.button === 2) active().setCover?.(false); });
// Letting go of X ends cover (so does leaving the window).
window.addEventListener('keyup', e => { if (e.key.toLowerCase() === 'x') active().setCover?.(false); });
window.addEventListener('blur', () => active().setCover?.(false));
// On touch screens (iPad) only the END of a tap counts as a user gesture for
// starting audio, so unlock there too.
window.addEventListener('pointerup', unlockAudio);
window.addEventListener('touchend', unlockAudio);
// iPad with a Magic Keyboard: trackpad clicks and key presses start audio too.
window.addEventListener('click', unlockAudio);
window.addEventListener('keydown', unlockAudio, true);

// Keep the screen awake while the page is open (tablets and laptops would
// otherwise dim or lock mid-session). Needs a user gesture on some browsers,
// and is dropped when the page is hidden, so ask again.
let wakeLock = null;
async function keepAwake() {
  if (wakeLock || document.visibilityState !== 'visible' || !navigator.wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch { /* not allowed yet; try again on the next tap */ }
}
document.addEventListener('visibilitychange', keepAwake);
window.addEventListener('pointerup', keepAwake);

// ---- HUD -------------------------------------------------------------------------
const hudEls = { stats: $('#stats'), timer: $('#timer'), drill: $('#drill'), start: $('#start-btn') };
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
  if (now > lastFrame) fpsAvg += (1000 / (now - lastFrame) - fpsAvg) * 0.05;
  lastFrame = now;

  active().update(now);
  if (match?.nextAt && now >= match.nextAt && !active().busy && !review.isOpen && !range.view3d?.walking && !range.view3d?.inspecting) loadMatchStage();
  if (repeatAt && now >= repeatAt) {
    repeatAt = null;
    if (!active().busy && !review.isOpen && !range.view3d?.walking) actions.start();
  }
  // Between Steel Challenge strings the RO resets the steel.
  if (active().wantsReset) { active().wantsReset = false; range.reset(); }
  // A stage with shooting positions: run to the next one.
  if (active().wantsMove != null) { views3d[range.layout]?.moveTo?.(active().wantsMove); active().wantsMove = null; }
  walkOn(now);
  // Between classifier strings only the steel is reset (paper is scored at the end).
  if (active().wantsSteelReset) { active().wantsSteelReset = false; views3d[range.layout]?.steel?.reset(); }
  // Free practice: cleared steel stands back up. Not after a run: the
  // targets stay as shot (holes, steel down) until the next one, to be
  // looked at or walked up to.
  range.autoResetStar = !active().busy && active().state !== 'Done';
  range.autoPopups = course().type !== 'popup'; // free practice pops targets itself
  range.autoFlip = course().type !== 'flip';
  range.update(dt, now / 1000);

  const W = window.innerWidth, H = window.innerHeight;
  range.loadingText = '';
  if (isRange3D(range.layout)) {
    ensureRange3D();
    const rv = views3d[range.layout];
    if (rv?.ready) rv.setLayout(range.layout); // no-op unless the layout or stage changed
    range.loadingText = rv?.ready ? '' : (range3dError || `Loading 3D range… ${Math.round((rv?.progress || 0) * 100)}%`);
  } else if (range.layout === 'scene3d') {
    ensureJudge3D();
    const jv = views3d.scene3d;
    range.loadingText = jv?.ready ? '' : (judge3dError || `Loading 3D scene and people… ${Math.round((jv?.progress || 0) * 100)}%`);
  }
  const v3 = views3d[range.layout] || null;
  range.view3d = v3;
  // Background sound for the scene on screen (none for 2D courses).
  const amb = range.layout === 'office3d' ? 'office' : (range.layout === 'lot3d' || range.layout === 'scene3d') ? 'lot' : range.layout.startsWith('range3d') ? 'range' : null;
  if (amb !== lastAmbience) { lastAmbience = amb; setAmbience(amb); }
  const rain = (amb === 'lot' && settings.lotRain) || (amb === 'range' && settings.rangeWeather === 'rain');
  if (rain !== lastRain) { lastRain = rain; setRain(rain); }
  if (v3) v3.autoReset = range.autoResetStar; // free practice: steel stands back up
  for (const v of Object.values(views3d)) v.setVisible(v === v3 && v.ready);
  v3?.setHighlightDot?.(range.highlightDot); // Dot Torture: the dot to shoot
  if (v3?.ready) v3.render(now);
  range.draw(g, now / 1000, settings.showZones);
  active().drawOverlay?.(g, W, H, now);
  if (v3?.inspecting) drawWalkLabel(g, W, v3.inspecting);
  review.captureFrame();

  setHUD('stats', statsHTML(now));
  setHUD('timer', active().timerHTML(now));
  setHUD('drill', active().panelHTML(now));
  setHUD('start', active().busy ? 'Stop <kbd>Esc</kbd>' : 'Start <kbd>Space</kbd>');

  if (!$('#setup').hidden || remote?.connected) { updateCameraStatus(); updateQualityStatus(); }
  remote?.tick(now);
  requestAnimationFrame(frame);
}

// ---- Actions ---------------------------------------------------------------------------
// A course with the user's saved "time up" applied (flip grid / pop-ups).
function withUpTime(c) {
  const par = settings.pars?.[c.name];
  if (par != null && c.parTime != null && c.upTime == null) c = { ...c, parTime: par }; // your own par ([ ])
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
  if (course().upTime == null) return adjustPar(dir);
  setUpTime(upTimeBase(course()) + dir * CONFIG.upTime.step);
}

// Drills and stages: [ and ] set your own par, as on a shot timer (kept per
// course; back at the standard par it's forgotten).
function adjustPar(dir) {
  const c = course(), P = CONFIG.timer.par;
  if (c.parTime == null) return toast('[ and ] change the par time on drills and stages, and the time up on flip grid and pop-up courses.');
  if (active().busy) return toast('Finish or cancel the run first (Esc).');
  const cur = active().course?.name === c.name ? active().course.parTime : withUpTime(c).parTime;
  const v = Math.round(Math.min(P.max, Math.max(P.min, cur + dir * P.step)) * 100) / 100;
  const pars = { ...(settings.pars || {}) };
  if (Math.abs(v - c.parTime) < 1e-6) delete pars[c.name]; else pars[c.name] = v;
  settings.pars = pars;
  persist();
  active().setCourse(withUpTime(c));
  refreshSetup();
  toast(`Par ${v.toFixed(2)} s${Math.abs(v - c.parTime) < 1e-6 ? ' (standard)' : ` (standard ${c.parTime.toFixed(2)} s)`}`);
}

// The 3D range's time of day: the course's own (a night stage) or Setup's.
const rangeTime = () => course().time || match?.def.time || settings.rangeTime; // (a night match makes all its stages night)

// Pick a course: set its runner and put up its targets.
function selectCourse(i, announce = true) {
  if (active().busy) return toast('Finish or cancel the run first (Esc).');
  repeatAt = null;
  const pick = COURSES[(i + COURSES.length) % COURSES.length];
  if (pick.type === 'match') return startMatch(pick);
  if (!matchSelecting) match = null; // another course: the match is over
  courseIndex = (i + COURSES.length) % COURSES.length;
  const c = course();
  active().setCourse(withUpTime(c));
  showCourseLayout(c);
  views3d['range3d-single']?.setTime(rangeTime());
  if (is3D(c.type)) ensure3D(c.type).catch(() => {});
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
    if (['drill', 'stage', 'strings', 'classifier'].includes(course().type)) showCourseLayout(course());
    // Not while a 3D range/scene is still loading: its targets or people
    // wouldn't be there yet (every shot a miss, or a scenario played unseen).
    // The knife and office scenarios have their own loading runner.
    if (is3DLayout(range.layout) && !is3D(course().type) && !views3d[range.layout]?.ready) {
      return toast('The 3D scene is still loading. Start again in a moment.');
    }
    views3d[range.layout]?.inspect?.(null, true); // back to the firing line
    const t = performance.now();
    r.start(t);
    if (r.busy) review.startRun(course(), t);
  },
  // Toolbar button: starts a run, or stops one (no Esc key on a tablet).
  startStop() {
    if (active().busy) { active().cancel(); toast('Run cancelled.'); } else actions.start();
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
  // Build (or edit, if one of yours is picked) a stage.
  builder() {
    if (active().busy) return toast('Finish or cancel the run first (Esc).');
    closeCourses();
    const current = course().custom ? loadStages().find(s => s.name === course().name) || null : null;
    // A stock stage picked: start from a copy of it (saved as a new stage of yours).
    const prefill = !current && course().type === 'stage' && course().stage ? stageRows(course()) : null;
    // (point the selection at the first course while the list changes)
    const drop = name => { const i = COURSES.findIndex(c => c.custom && c.name === name); if (i >= 0) { courseIndex = 0; COURSES.splice(i, 1); } };
    openBuilder(current, {
      toast, prefill,
      onSave(stage, oldName) {
        if (oldName) drop(oldName);
        drop(stage.name);
        COURSES.push(stageCourse(stage));
        selectCourse(COURSES.length - 1, false);
        toast(`Saved "${stage.name}" (Courses -> My Stages). Space to shoot it.`);
      },
      onDelete(name) { drop(name); selectCourse(0, false); toast(`Deleted "${name}".`); },
    });
  },
  review() {
    if (active().busy) return toast('Finish or cancel the run first (Esc).');
    if (!review.open()) toast('No runs to review yet. Finish a course first.');
  },
  // Walk the targets (3D range): up to the next paper target, then back.
  inspect() {
    const v = views3d[range.layout];
    if (!isRange3D(range.layout) || !v?.ready) return toast('Walk the targets works on the 3D range.');
    if (active().busy) return toast('Finish or cancel the run first (Esc).');
    const cur = v.inspecting;
    const w = v.inspect(cur ? cur.i + 1 : 0);
    if (!w && !cur) toast('No paper targets to walk to here.');
    if (w) active().stopCalls?.(); // the RO is done talking and goes to score
    if (w && CONFIG.timer.commands.on) say(scoreCall(w), { rate: 1.0 }); // and calls each target
  },
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
  if (repeatAt && e.key !== ' ') { repeatAt = null; toast('Repeat stopped.'); }
  if (calibration.active) {
    if (calibration.handleKey(e)) e.preventDefault();
    return;
  }
  const tag = e.target.tagName;
  if ((tag === 'INPUT' && e.target.type !== 'checkbox' && e.target.type !== 'range') || tag === 'SELECT') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  if (review.isOpen) {
    if (review.handleKey(e)) e.preventDefault();
    return;
  }
  if (!$('#match').hidden) {
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#match').hidden = true; }
    return;
  }
  if (!$('#builder').hidden) {
    if (e.key === 'Escape') { e.preventDefault(); $('#builder').hidden = true; }
    return;
  }
  if (!$('#courses').hidden) {
    if (e.key === 'Escape' || e.key.toLowerCase() === 'd') { e.preventDefault(); closeCourses(); }
    if (e.key.toLowerCase() === 'b') { e.preventDefault(); actions.builder(); }
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
    v: () => actions.review(),
    i: () => actions.inspect(),
    b: () => actions.builder(),
    '[': () => adjustUpTime(-1),
    ']': () => adjustUpTime(1),
    x: () => active().setCover?.(true), // hold: take cover (office)
    q: () => lean(-1), // 3D range: lean out left / right (again: upright)
    e: () => lean(1),
    Escape: () => {
      if (!$('#setup').hidden) closeSetup();
      else if (range.view3d?.inspecting) range.view3d.inspect(null);
      else if (active().busy) { active().cancel(); toast('Run cancelled.'); }
    },
  };
  if (map[k]) {
    e.preventDefault();
    map[k]();
  }
});

// Shooting on the move (course.advance { from: [x m, yd], to, speed m/s }):
// the view stands at `from` until the beep, then walks to `to` while you
// shoot, with footsteps; after the run it stays where the walk got to.
let walkU = 0, lastStride = 0;
function walkOn(now) {
  const A = course().advance, v = range.view3d;
  if (!v?.setStep) return;
  if (!A) return v.setStep(null);
  const R = active(), W = CONFIG.range3d.advance;
  const dist = Math.hypot(A.to[0] - A.from[0], (A.to[1] - A.from[1]) * 0.9144);
  if (R.state === 'Running') {
    const t = (now - R.runStart) / 1000, u = Math.min(1, (t * A.speed) / dist);
    if (u < 1 && walkU < 1) {
      const n = Math.floor(t / W.stride);
      if (n > lastStride) { lastStride = n; footstep(W.step); }
    }
    walkU = u;
  } else if (R.state !== 'Done') { walkU = 0; lastStride = 0; }
  const moving = R.state === 'Running' && walkU < 1;
  const bob = moving ? W.bob * Math.abs(Math.sin(((now - R.runStart) / 1000 / W.stride) * Math.PI)) - W.bob : 0;
  v.setStep(A.from[0] + (A.to[0] - A.from[0]) * walkU, A.from[1] + (A.to[1] - A.from[1]) * walkU, bob);
}

// 3D range: lean out left or right of cover (press the same side again to stand upright).
function lean(side) {
  const v = range.view3d;
  if (!v?.setLean || v.walking || v.inspecting) return;
  v.setLean(v.lean === side ? 0 : side);
}

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
$('#opt-pf').onchange = e => {
  if (active().busy) { refreshSetup(); return toast('Finish or cancel the run first (Esc).'); }
  settings.powerFactor = e.target.value;
  Object.assign(CONFIG.points, CONFIG.powerFactor[settings.powerFactor]);
  persist();
};
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
  views3d.lot3d?.setCarCount(settings.cars3d);
  views3d.scene3d?.setCarCount(settings.cars3d);
};

$('#opt-real3d').onchange = e => {
  settings.real3d = e.target.checked;
  persist();
  if (!active().busy) showCourseLayout(course());
  refreshSetup();
};
$('#dist3d').oninput = e => {
  const kind = RANGE3D_KIND[setupLayout3D()];
  if (!CONFIG.range3d.yardsRange[kind]) return;
  const yd = Number(e.target.value);
  settings.yards3d = { ...(settings.yards3d || {}), [kind]: yd };
  $('#dist3d-val').textContent = `${yd} yd`;
  persist();
  views3d['range3d-single']?.setDistance(kind, yd);
};

// Office scenario options: one handler for every control in #office-row.
const officeCtl = {
  gunmen: ['#of-gunmen', el => Number(el.value)],
  innocents: ['#of-innocents', el => Number(el.value)],
  fireDelay: ['#of-fire', el => Number(el.value)],
  lives: ['#of-lives', el => Number(el.value)],
  rifle: ['#of-rifle', el => el.checked],
  armor: ['#of-armor', el => el.checked],
  hostage: ['#of-hostage', el => el.checked],
  fleeing: ['#of-fleeing', el => el.checked],
  victimVoice: ['#of-voice', el => el.checked],
  alarm: ['#of-alarm', el => el.checked],
  peeker: ['#of-peeker', el => el.checked],
  lightsOut: ['#of-dark', el => el.checked],
  night: ['#of-night', el => el.checked],
};
for (const [key, [sel, read]] of Object.entries(officeCtl)) {
  const el = $(sel);
  el[el.tagName === 'SELECT' || el.type === 'checkbox' ? 'onchange' : 'oninput'] = () => {
    if (active().busy) { refreshSetup(); return toast('Finish or cancel the run first (Esc).'); }
    settings.office = { ...settings.office, [key]: read(el) };
    persist();
    if (runners.office3d) runners.office3d.opts = settings.office;
    refreshSetup();
  };
}
function refreshOffice() {
  const o = { ...CONFIG.office3d.options, ...settings.office };
  $('#of-gunmen').value = o.gunmen;
  $('#of-innocents').value = o.innocents;
  $('#of-fire').value = o.fireDelay;
  $('#of-fire-val').textContent = `${o.fireDelay.toFixed(1)}–${(o.fireDelay * 1.5).toFixed(1)} s`;
  $('#of-lives').value = o.lives;
  $('#of-lives-val').textContent = String(o.lives);
  for (const k of ['rifle', 'armor', 'hostage', 'fleeing']) $(officeCtl[k][0]).checked = o[k];
  $('#of-voice').checked = o.victimVoice;
  $('#of-alarm').checked = o.alarm;
  $('#of-peeker').checked = o.peeker;
  $('#of-dark').checked = o.lightsOut;
  $('#of-night').checked = o.night;
}

// Life-size 3D.
$('#opt-life').onchange = e => { settings.lifeSize = e.target.checked; persist(); resize3D(); refreshSetup(); };
// 3D graphics quality (CONFIG.post): the office's effects and every 3D view's resolution.
$('#opt-quality').onchange = e => {
  settings.quality = e.target.value;
  persist();
  resize3D();
  for (const v of new Set(Object.values(views3d))) v.post?.reset();
  refreshSetup();
};
// Frames per second (smoothed) and the office's current effects level, for Setup.
let fpsAvg = 0;
function updateQualityStatus() {
  const v = views3d[range.layout];
  const level = v?.post ? ` · ${v.post.levelName}` : '';
  $('#quality-now').textContent = v?.ready ? `${Math.round(fpsAvg)} fps${level}` : '–';
}
$('#life-screen').oninput = e => { settings.screenIn = Number(e.target.value); persist(); resize3D(); refreshSetup(); };
$('#life-dist').oninput = e => { settings.viewFt = Number(e.target.value); persist(); resize3D(); refreshSetup(); };
function refreshLife() {
  const L = CONFIG.lifeSize;
  for (const [id, r, v] of [['#life-screen', L.screenWidthIn, settings.screenIn], ['#life-dist', L.distanceFt, settings.viewFt]]) {
    const el = $(id);
    el.min = r.min; el.max = r.max; el.step = r.step; el.value = v;
    el.disabled = !settings.lifeSize;
  }
  $('#opt-life').checked = settings.lifeSize;
  $('#opt-quality').value = settings.quality;
  $('#life-screen-val').textContent = `${settings.screenIn} in (${Math.round(settings.screenIn * 2.54)} cm)`;
  $('#life-dist-val').textContent = `${settings.viewFt} ft (${(settings.viewFt * 0.3048).toFixed(1)} m)`;
}

// Flip grid: spin speed and variable timing (apply to the board right away).
function applyFlip() {
  range.flip.speed = settings.flipSpeed;
  range.flip.variable = settings.flipVariable;
}
applyFlip();
$('#flip-speed').oninput = e => {
  settings.flipSpeed = Number(e.target.value);
  persist();
  applyFlip();
  refreshSetup();
};
$('#flip-var').onchange = e => {
  settings.flipVariable = e.target.checked;
  persist();
  applyFlip();
};
function refreshFlip() {
  const S = CONFIG.flip.speed, el = $('#flip-speed');
  el.min = S.min; el.max = S.max; el.step = S.step;
  el.value = settings.flipSpeed;
  const v = settings.flipSpeed;
  $('#flip-speed-val').textContent = v === 1 ? 'normal' : v > 1 ? `${v}× faster` : `${+(1 / v).toFixed(1)}× slower`;
  $('#flip-var').checked = settings.flipVariable;
}

// Sound sliders.
setVolumes({ gun: settings.volGun, amb: settings.volAmb, earPro: settings.earPro });
for (const [id, key] of [['#vol-gun', 'volGun'], ['#vol-amb', 'volAmb']]) {
  $(id).oninput = e => {
    settings[key] = Number(e.target.value);
    persist();
    setVolumes({ gun: settings.volGun, amb: settings.volAmb, earPro: settings.earPro });
    refreshSound();
  };
}
// Sound choices (compare recorded / generated versions); ▶ Test buttons.
// Andrew (2026-09-27): the recorded versions are all better, so R is the default.
const SOUND_DEFAULTS = { gun: 'rec', gunTake: -1, steel: 'rec', step: 'rec', glass: 'rec', distant: 'rec' };
const SOUND_SELECTS = { gun: '#snd-gun', gunTake: '#snd-gun-take', steel: '#snd-steel', step: '#snd-step', glass: '#snd-glass', distant: '#snd-distant' };
const soundChoices = () => ({ ...SOUND_DEFAULTS, ...settings.soundPicks });
setSoundChoices(soundChoices());
for (const [key, id] of Object.entries(SOUND_SELECTS)) {
  $(id).onchange = e => {
    settings.soundPicks = { ...settings.soundPicks, [key]: key === 'gunTake' ? Number(e.target.value) : e.target.value };
    persist();
    setSoundChoices(soundChoices());
  };
}
$('#test-gun-out').onclick = () => shotPop({ outdoor: true });
$('#test-gun-in').onclick = () => shotPop({ indoor: true });
$('#test-steel-small').onclick = () => steelPing(CONFIG.sound.steelRing.ref);
$('#test-steel-big').onclick = () => steelPing(CONFIG.range3d.steel.popper.height * CONFIG.sound.steelRing.popperSize);
$('#test-step').onclick = () => { for (let i = 0; i < 6; i++) setTimeout(() => footstep(0.3 + i * 0.14), i * CONFIG.knife.strideTime * 1000); };
$('#test-glass').onclick = () => glassBreak();
$('#test-distant').onclick = () => distantShot();
$('#opt-ro').onchange = e => { settings.roCommands = CONFIG.timer.commands.on = e.target.checked; persist(); };
$('#opt-ding').onchange = e => { settings.paperDing = e.target.checked; persist(); };
$('#opt-draw').onchange = e => { settings.drawGoal = CONFIG.timer.drawGoal = Number(e.target.value); persist(); };
$('#opt-split').onchange = e => { settings.splitGoal = CONFIG.timer.splitGoal = Number(e.target.value); persist(); };
$('#opt-repeat').onchange = e => { settings.autoRepeat = Number(e.target.value); repeatAt = null; persist(); };
$('#opt-earpro').onchange = e => {
  settings.earPro = e.target.value;
  persist();
  setVolumes({ gun: settings.volGun, amb: settings.volAmb, earPro: settings.earPro });
};
$('#opt-paste').onchange = e => { settings.paste = CONFIG.range3d.paste.on = e.target.checked; persist(); };
function refreshSound() {
  $('#opt-ro').checked = settings.roCommands;
  $('#opt-ding').checked = settings.paperDing;
  $('#opt-repeat').value = String(settings.autoRepeat);
  $('#opt-draw').value = settings.drawGoal ? Number(settings.drawGoal).toFixed(2) : '0';
  $('#opt-split').value = Number(settings.splitGoal).toFixed(2) === '0.00' ? '0' : Number(settings.splitGoal).toFixed(2);
  $('#opt-earpro').value = settings.earPro;
  $('#opt-paste').checked = settings.paste;
  const c = soundChoices();
  for (const [key, id] of Object.entries(SOUND_SELECTS)) $(id).value = String(c[key]);
  const M = CONFIG.sound.mix;
  for (const [id, v] of [['vol-gun', settings.volGun], ['vol-amb', settings.volAmb]]) {
    const el = $('#' + id);
    el.min = M.min; el.max = M.max; el.step = M.step;
    el.value = v;
    $(`#${id}-val`).textContent = `${Math.round(v * 100)}%`;
  }
}

$('#opt-weather').onchange = e => {
  settings.rangeWeather = e.target.value;
  persist();
  views3d['range3d-single']?.setWeather(settings.rangeWeather);
};
$('#opt-bay').onchange = e => {
  if (active().busy) { refreshSetup(); return toast('Finish or cancel the run first (Esc).'); }
  settings.bayGap = CONFIG.range3d.bayGap = Number(e.target.value);
  persist();
  const v = views3d['range3d-bay'];
  if (v?.ready && range.layout === 'range3d-bay') v.setLayout('range3d-bay', true); // rebuild with the new spacing
};
$('#opt-stagger').onchange = e => {
  if (active().busy) { refreshSetup(); return toast('Finish or cancel the run first (Esc).'); }
  settings.bayStagger = e.target.value === '1';
  CONFIG.range3d.bayStagger = settings.bayStagger ? [0, 5, 10] : [0, 0, 0];
  persist();
  const v = views3d['range3d-bay'];
  if (v?.ready && range.layout === 'range3d-bay') v.setLayout('range3d-bay', true);
};
$('#opt-wind').onchange = e => {
  settings.rangeWind = e.target.value;
  persist();
  views3d['range3d-single']?.setWind(settings.rangeWind);
};
$('#opt-time').onchange = e => {
  settings.rangeTime = e.target.value;
  persist();
  views3d['range3d-single']?.setTime(rangeTime());
};
$('#opt-rain').onchange = e => {
  settings.lotRain = e.target.checked;
  persist();
  for (const v of new Set(Object.values(views3d))) v.setRain?.(settings.lotRain);
};
$('#opt-night').onchange = e => {
  settings.lotNight = e.target.checked;
  persist();
  for (const v of new Set(Object.values(views3d))) v.setNight?.(settings.lotNight);
};

$('#opt-blood').onchange = e => {
  settings.blood = e.target.checked;
  persist();
  for (const v of Object.values(views3d)) v.blood = settings.blood;
};

function refreshSetup() {
  const c = course();
  $('#opt-blood').checked = settings.blood;
  $('#opt-night').checked = settings.lotNight;
  $('#opt-rain').checked = settings.lotRain;
  $('#opt-time').value = settings.rangeTime;
  $('#opt-wind').value = settings.rangeWind;
  $('#opt-bay').value = String(settings.bayGap);
  $('#opt-stagger').value = settings.bayStagger ? '1' : '0';
  $('#opt-weather').value = settings.rangeWeather;
  $('#opt-real3d').checked = settings.real3d;
  const l3 = setupLayout3D(), kind = RANGE3D_KIND[l3];
  $('#range3d-row').hidden = !l3;
  // Stages set each target's distance themselves: no slider.
  $('#dist3d-label').hidden = !CONFIG.range3d.yardsRange[kind];
  if (CONFIG.range3d.yardsRange[kind]) {
    const [lo, hi] = CONFIG.range3d.yardsRange[kind];
    const dist = $('#dist3d');
    dist.min = lo; dist.max = hi;
    dist.value = yards3d(kind);
    $('#dist3d-val').textContent = `${yards3d(kind)} yd`;
    $('#dist3d-kind').textContent = { paper: 'paper targets', popup: 'pop-ups', star: 'Texas Star', plates: 'plate rack', poppers: 'poppers', movers: 'movers', grid: 'flip grid', tree: 'dueling tree', dots: 'Dot Torture sheet' }[kind];
  }
  // Only courses with both a 2D and a 3D version can switch (free practice uses L).
  $('#opt-real3d').disabled = !TO_3D[c.layout];
  $('#cars3d-row').hidden = !(is3D(c.type) || range.layout === 'scene3d');
  $('#office-row').hidden = c.type !== 'office3d';
  refreshOffice();
  $('#flip-row').hidden = c.layout !== 'grid' && range.layout !== 'grid';
  $('#life-row').hidden = !(is3D(c.type) || is3DLayout(range.layout));
  refreshLife();
  refreshFlip();
  refreshSound();
  $('#cars3d-only').hidden = c.type !== 'knife3d' && range.layout !== 'scene3d';
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
  $('#opt-pf').value = settings.powerFactor;
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
$('[data-act="builder"]').onclick = () => actions.builder();
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

// ---- Remote control (remote.js) ------------------------------------------------------------
// Opened as index.html?display, this page is the Display: it follows a
// Controller window (controller.html, e.g. on the iPad's own screen) and
// hides its toolbar. Only Display pages listen, so a stray tab can't react.
const displayMode = new URLSearchParams(location.search).has('display');
if (displayMode) document.body.classList.add('display-mode');
const remote = displayMode && 'BroadcastChannel' in window ? {
  ch: new BroadcastChannel(CHANNEL),
  connected: false,
  sent: '',
  sentAt: 0,
  // Send the state when it changes (checked 5x a second), and a heartbeat
  // every 2 s so the Controller knows the Display is there.
  tick(now) {
    if (!this.connected || now - this.checkedAt < 200) return;
    this.checkedAt = now;
    const state = JSON.stringify({
      t: 'state', courseIndex, course: course().name, busy: active().busy, layout: range.layout,
      // your own stages (builder.js): the Controller lists them from here
      customs: COURSES.map((c, i) => [c, i]).filter(([c]) => c.custom).map(([c, i]) => ({ name: c.name, desc: c.desc, index: i })),
      hud: { timer: hudCache.timer, drill: hudCache.drill, stats: hudCache.stats },
      controls: snapshotControls(document),
      review: { open: review.isOpen, has: review.hasRuns },
      calibrating: calibration.active,
      volumes: { gun: settings.volGun, amb: settings.volAmb, earPro: settings.earPro }, // the Controller plays sounds at these too
      sounds: soundChoices(), // ... and with these sound choices
    });
    if (state === this.sent && now - this.sentAt < 2000) return;
    this.sent = state;
    this.sentAt = now;
    this.ch.postMessage(JSON.parse(state));
  },
  checkedAt: 0,
} : null;
if (remote) {
  remote.ch.onmessage = ({ data: m }) => {
    if (m.t === 'hello') {
      remote.connected = true;
      remote.sent = '';
      // Nobody taps the Display, so its audio may never start: play sounds
      // on the Controller instead (audio.js only forwards while local audio
      // isn't running).
      setAudioForwarder((name, args) => remote.ch.postMessage({ t: 'sound', name, args }));
    } else if (m.t === 'action' && REMOTE_ACTIONS.includes(m.name)) {
      actions[m.name]();
    } else if (m.t === 'key') {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: m.key, shiftKey: !!m.shiftKey }));
    } else if (m.t === 'cover') {
      active().setCover?.(!!m.on);
    } else if (m.t === 'course') {
      selectCourse(m.index);
    } else if (m.t === 'input') {
      const el = document.getElementById(m.id);
      if (!el || el.disabled) return;
      if (el.type === 'checkbox') el.checked = !!m.checked;
      else el.value = m.value;
      el.dispatchEvent(new Event('input'));
      el.dispatchEvent(new Event('change'));
    } else if (m.t === 'click') {
      document.getElementById(m.id)?.click();
    }
  };
}
$('#open-controller').onclick = () => window.open('controller.html', 'dryfire-controller');
$('#open-display').onclick = () => window.open('index.html?display', 'dryfire-display');

// ---- Boot --------------------------------------------------------------------------------
resize();
active().setCourse(withUpTime(course()));
showCourseLayout(course());
if (is3D(course().type)) ensure3D(course().type).catch(() => {});
refreshSetup();
if (!settings.seenHelp && !displayMode) $('#help').hidden = false;
// Reopen the camera if it was on last time (works once permission was granted).
if (settings.cameraOn && LaserCamera.supported()) startCamera(settings.deviceId);
requestAnimationFrame(frame);

// Test hook: open the page with ?debug to drive it from automated tests.
if (new URLSearchParams(location.search).has('debug')) {
  window.sim = { range, game, runners, active, course, selectCourse, shoot, COURSES, views3d, review };
}
