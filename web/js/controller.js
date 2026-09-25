// controller.js — the remote Controller page (controller.html).
// ---------------------------------------------------------------------------
// Sends commands to the Display window (index.html?display) and mirrors what
// it shows. Nothing is scored or timed here. See remote.js for the messages.
// The Controller is the window you touch, so it also plays the Display's
// sounds while the Display can't (audio.js forwarding) and keeps the screen
// awake.

import { CHANNEL, SETUP_CONTROLS } from './remote.js';
import { COURSES, CATEGORIES } from './courses.js';
import * as audio from './audio.js';

const $ = s => document.querySelector(s);
const ch = new BroadcastChannel(CHANNEL);
const send = m => ch.postMessage(m);

let state = null;
let lastStateAt = 0;

// ---- connection ----------------------------------------------------------------
send({ t: 'hello' });
setInterval(() => {
  const alive = performance.now() - lastStateAt < 4500;
  if (!alive) send({ t: 'hello' });
  $('#link').textContent = alive ? 'Display connected' : 'Display not found: open it with the button →';
  $('#link').className = alive ? 'go' : 'bad';
}, 1000);
$('#open-display').onclick = () => window.open('index.html?display', 'dryfire-display');

ch.onmessage = ({ data: m }) => {
  if (m.t === 'state') { state = m; lastStateAt = performance.now(); render(); }
  else if (m.t === 'sound' && typeof audio[m.name] === 'function') audio[m.name](...(m.args || []));
};

// ---- this window: audio and screen ------------------------------------------------
// A tap here unlocks audio (the Display's sounds play here) and asks to keep
// the iPad awake (if it locks, the Display stops too).
let wakeLock = null;
async function keepAwake() {
  if (wakeLock || document.visibilityState !== 'visible' || !navigator.wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch { /* try again on the next tap */ }
}
for (const ev of ['pointerup', 'touchend']) window.addEventListener(ev, () => { audio.unlockAudio(); keepAwake(); });
document.addEventListener('visibilitychange', keepAwake);

// ---- buttons ----------------------------------------------------------------------
document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.action) send({ t: 'action', name: b.dataset.action });
  if (b.dataset.key) send({ t: 'key', key: b.dataset.key, shiftKey: !!b.dataset.shift });
});

// ---- course picker ------------------------------------------------------------------
$('#courses-btn').onclick = () => { renderCourses(); $('#courses').hidden = false; };
$('#courses-close').onclick = () => { $('#courses').hidden = true; };
function renderCourses() {
  const list = $('#course-list');
  list.innerHTML = '';
  for (const cat of CATEGORIES) {
    const items = COURSES.map((c, i) => [c, i]).filter(([c]) => c.category === cat);
    if (!items.length) continue;
    const h = document.createElement('h3');
    h.textContent = cat;
    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const [c, i] of items) {
      const b = document.createElement('button');
      b.textContent = c.name;
      b.title = c.desc;
      if (state?.courseIndex === i) b.className = 'current';
      b.onclick = () => { send({ t: 'course', index: i }); $('#courses').hidden = true; };
      grid.appendChild(b);
    }
    list.append(h, grid);
  }
}

// ---- Setup mirror -------------------------------------------------------------------
const controls = {};
(function buildSetup() {
  const root = $('#setup');
  for (const c of SETUP_CONTROLS) {
    if (c.section) {
      const h = document.createElement('h3');
      h.textContent = c.section;
      root.appendChild(h);
      continue;
    }
    const id = c.id || c.text;
    let wrap, input;
    if (c.text) {
      wrap = document.createElement('div');
      wrap.className = 'text';
    } else if (c.button) {
      wrap = input = document.createElement('button');
      input.onclick = () => send({ t: 'click', id });
    } else {
      wrap = document.createElement('label');
      const name = document.createElement('span');
      name.textContent = c.label;
      const val = document.createElement('span');
      val.className = 'val';
      wrap.append(name, val);
      wrap.val = val;
      input = document.createElement(c.kind === 'select' ? 'select' : 'input');
      if (c.kind !== 'select') input.type = c.kind === 'range' ? 'range' : 'checkbox';
      const push = () => send({ t: 'input', id, value: input.value, checked: input.checked });
      input.addEventListener(input.tagName === 'SELECT' ? 'change' : 'input', push);
      input.addEventListener('change', () => { input.busyUntil = 0; });
      input.addEventListener('pointerdown', () => { input.busyUntil = performance.now() + 60000; });
      input.addEventListener('pointerup', () => { input.busyUntil = performance.now() + 800; });
      if (input.type === 'checkbox') wrap.prepend(input);
      else wrap.appendChild(input);
    }
    root.appendChild(wrap);
    controls[id] = { c, wrap, input };
  }
})();

function renderSetup(snap) {
  for (const [id, { c, wrap, input }] of Object.entries(controls)) {
    const s = snap[id];
    wrap.hidden = !s || s.hidden;
    if (!s) continue;
    if (c.text) { wrap.textContent = (c.label ? `${c.label}: ` : '') + s.text; continue; }
    if (c.button) { input.textContent = s.text; input.disabled = s.disabled; continue; }
    if (wrap.val) wrap.val.textContent = s.outText ?? '';
    input.disabled = s.disabled;
    if (input.busyUntil > performance.now()) continue; // don't fight a finger on the slider
    if (input.tagName === 'SELECT') {
      const opts = JSON.stringify(s.options);
      if (input.dataset.opts !== opts) {
        input.dataset.opts = opts;
        input.innerHTML = '';
        for (const [v, t] of s.options) input.add(new Option(t, v));
      }
      input.value = s.value;
    } else if (c.kind === 'range') {
      Object.assign(input, { min: s.min, max: s.max, step: s.step });
      input.value = s.value;
    } else {
      input.checked = s.checked;
    }
  }
}

// ---- mirror of the Display ------------------------------------------------------------
const html = {};
function setHTML(sel, v) { if (html[sel] !== v) { html[sel] = v; $(sel).innerHTML = v || ''; } }

function render() {
  const c = COURSES[state.courseIndex];
  $('#course-name').textContent = c?.name ?? state.course;
  $('#course-desc').textContent = c?.desc ?? '';
  const start = $('#start');
  start.textContent = state.busy ? 'Stop' : 'Start';
  start.classList.toggle('stop', state.busy);
  setHTML('#timer', state.hud.timer);
  setHTML('#drill', state.hud.drill);
  setHTML('#stats', state.hud.stats);
  $('#review-nav').hidden = !state.review.open;
  $('#review-btn').disabled = !state.review.has || state.busy;
  renderSetup(state.controls);
}
