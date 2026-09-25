// remote.js — remote control: a Controller window (e.g. on the iPad's own
// screen) drives the Display window (the range, full screen on the projector
// or TV the iPad is connected to).
// ---------------------------------------------------------------------------
// Both windows are pages of this site on the same device, so they talk over a
// BroadcastChannel. No server, no network, no lag worth measuring.
//
// The Display runs everything: courses, 3D, camera, scoring, sounds (sounds
// are forwarded to the Controller while the Display has had no tap, see
// audio.js). The Controller only sends commands and mirrors what the Display
// shows (timer, drill panel, session stats, Setup controls).
//
// Messages, Controller -> Display:
//   { t: 'hello' }                      ask for the current state
//   { t: 'action', name }               an action in main.js (startStop, reset, ...)
//   { t: 'key', key, shiftKey }         a key press, as if typed on the Display
//   { t: 'course', index }              select COURSES[index]
//   { t: 'input', id, value, checked }  set a Setup control (fires input + change)
//   { t: 'click', id }                  click a Setup button
// Display -> Controller:
//   { t: 'state', ... }                 see remote.tick() in main.js
//   { t: 'sound', name, args }          play this sound here (audio.js)

export const CHANNEL = 'dryfire-remote';

// Actions a Controller may run on the Display (main.js `actions`).
export const REMOTE_ACTIONS = ['startStop', 'reset', 'layout', 'zones', 'hideHud', 'review', 'calibrate'];

// Setup controls mirrored on the Controller, in order. kind: range / check /
// select (or button / text); `out` is the element showing the value;
// `section` starts a new heading.
export const SETUP_CONTROLS = [
  { section: 'Current course' },
  { id: 'up-time', kind: 'range', label: 'Time targets stay up', out: 'up-time-val' },
  { id: 'up-time-reset', button: true },
  { id: 'opt-real3d', kind: 'check', label: 'Photo-realistic 3D range' },
  { id: 'dist3d', kind: 'range', label: 'Distance', out: 'dist3d-val' },
  { id: 'cars3d', kind: 'range', label: 'Parked cars', out: 'cars3d-val' },
  { id: 'opt-blood', kind: 'check', label: 'Blood effects' },
  { section: 'Targets' },
  { id: 'opt-layout', kind: 'select', label: 'Free-practice targets' },
  { id: 'opt-zones', kind: 'check', label: 'Show scoring zones' },
  { id: 'opt-mouse', kind: 'check', label: 'Mouse / touch shots on the Display' },
  { section: 'Laser camera' },
  { id: 'cam-toggle', button: true },
  { id: 'cam-device', kind: 'select', label: 'Camera' },
  { id: 'cam-thr', kind: 'range', label: 'Dot threshold', out: 'cam-thr-val' },
  { id: 'opt-camera-shots', kind: 'check', label: 'Laser shots' },
  { id: 'cam-calibrate', button: true },
  { id: 'cam-clear-cal', button: true },
  { text: 'cam-status', label: 'Status' },
  { text: 'cal-status' },
];

// Display side: the current state of every mirrored control. A control
// counts as hidden if it or a parent inside the Setup drawer is hidden (the
// drawer itself is usually closed on the Display).
export function snapshotControls(doc) {
  const hidden = el => {
    for (let e = el; e && e.id !== 'setup'; e = e.parentElement) if (e.hidden) return true;
    return false;
  };
  const out = {};
  for (const c of SETUP_CONTROLS) {
    const id = c.id || c.text;
    const el = id && doc.getElementById(id);
    if (!el) continue;
    out[id] = {
      value: el.value, checked: el.checked, min: el.min, max: el.max, step: el.step,
      disabled: el.disabled, hidden: hidden(el), text: el.textContent.trim(),
      options: el.tagName === 'SELECT' ? [...el.options].map(o => [o.value, o.text]) : undefined,
      outText: c.out ? doc.getElementById(c.out)?.textContent : undefined,
    };
  }
  return out;
}
