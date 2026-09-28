// builder.js — build your own stage (course picker -> "Build a stage", or B).
// ---------------------------------------------------------------------------
// A small form: name, par, and rows of targets and props (type, x across in
// metres - left negative - and distance in yards). Saved stages live in this
// browser (storage.js, CONFIG.storage.stages) and appear in the course list
// under "My Stages" as ordinary stages (courses.js stage format).

import { CONFIG } from './config.js';
import { load, save } from './storage.js';

const TYPES = {
  paper: 'Paper (USPSA)', pop: 'Paper: pop-up', turn: 'Paper: drop turner', swing: 'Paper: swinger',
  noshoot: 'No-shoot', popper: 'Popper', mini: 'Mini popper',
  plate: 'Plate (8 in)', wall: 'Wall (4 x 6 ft)', barrel: 'Barrel', clamshell: 'Clamshell (drop cover)',
  position: 'You run to here (next position)',
};
const STEEL = ['popper', 'mini', 'plate'];
const PROPS = ['wall', 'barrel', 'clamshell'];
const ACTIVATED = ['pop', 'turn', 'swing', 'clamshell']; // released by a steel (row.by)
// A 'position' row: you run there; the targets listed after it are shot
// from there (the first position is the start, x 0 at the firing line).

// Stage ids of the steel rows, in order (as courses.js stageTargets gives them).
const steelIds = rows => rows.filter(r => STEEL.includes(r.type)).map((_, i) => `S${i + 1}`);

export const loadStages = () => { const s = load(CONFIG.storage.stages, []); return Array.isArray(s) ? s : []; };

// A saved stage as a course (courses.js stage format).
export function stageCourse(s) {
  const positions = [{ x: 0, yd: 0 }], items = [], props = [];
  for (const r of s.rows) {
    const pos = positions.length - 1;
    if (r.type === 'position') positions.push({ x: r.x, yd: r.yd });
    else if (PROPS.includes(r.type)) props.push({ type: r.type, x: r.x, yd: r.yd, ...(r.type === 'clamshell' ? { by: r.by } : {}) });
    else items.push({ ...(ACTIVATED.includes(r.type) ? { type: 'paper', [r.type]: { by: r.by } } : { type: r.type }), x: r.x, yd: r.yd, ...(pos ? { pos } : {}) });
  }
  const act = items.filter(i => i.pop || i.turn || i.swing).length;
  const paper = items.filter(i => i.type === 'paper').length, steel = items.filter(i => STEEL.includes(i.type)).length;
  return {
    name: s.name, category: 'My Stages', type: 'stage', layout: 'range3d-stage', parTime: s.par, custom: true,
    maxShots: paper * 2 + steel + CONFIG.builder.spareRounds,
    desc: `Your stage: ${paper} paper${act ? ` (${act} activated)` : ''}, ${steel} steel${props.length ? `, ${props.length} prop${props.length > 1 ? 's' : ''}` : ''}. Edit it with B.`,
    stage: { items, props, ...(positions.length > 1 ? { positions } : {}) },
  };
}

// Open the form. current: a saved stage to edit (or null for a new one);
// onSave(stage) / onDelete(name) are called with the result.
export function openBuilder(current, { onSave, onDelete, toast }) {
  const el = document.getElementById('builder');
  const B = CONFIG.builder;
  let rows = current ? current.rows.map(r => ({ ...r })) : B.starter.map(r => ({ ...r }));
  const $ = s => el.querySelector(s);
  $('#b-name').value = current?.name || '';
  $('#b-par').value = current?.par ?? B.par;
  $('#b-delete').hidden = !current;
  const render = () => {
    const ids = steelIds(rows);
    $('#b-rows').innerHTML = rows.map((r, i) => `<tr data-i="${i}">
      <td><select data-k="type">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}"${k === r.type ? ' selected' : ''}>${v}</option>`).join('')}</select></td>
      <td><input data-k="x" type="number" step="0.1" min="${-B.maxX}" max="${B.maxX}" value="${r.x}"></td>
      <td><input data-k="yd" type="number" step="0.5" min="${B.yards[0]}" max="${B.yards[1]}" value="${r.yd}"></td>
      <td>${ACTIVATED.includes(r.type) ? `<select data-k="by">${ids.map(id => `<option${id === r.by ? ' selected' : ''}>${id}</option>`).join('') || '<option value="">add steel</option>'}</select>` : ''}</td>
      <td><button class="icon" data-del="${i}" aria-label="Remove">✕</button></td></tr>`).join('');
  };
  render();
  $('#b-rows').onchange = e => {
    const tr = e.target.closest('tr'), k = e.target.dataset.k;
    if (!tr || !k) return;
    const r = rows[Number(tr.dataset.i)];
    r[k] = k === 'type' || k === 'by' ? e.target.value : Number(e.target.value);
    if (k === 'type') render(); // (activated paper gets its "released by" choice)
  };
  $('#b-rows').onclick = e => { const i = e.target.dataset.del; if (i != null) { rows.splice(Number(i), 1); render(); } };
  $('#b-add').onclick = () => { const last = rows[rows.length - 1]; rows.push({ type: 'paper', x: last ? Math.min(B.maxX, last.x + 1.5) : 0, yd: last?.yd ?? 7 }); render(); };
  $('#b-save').onclick = () => {
    const name = $('#b-name').value.trim() || `My stage ${loadStages().length + 1}`;
    const par = Math.max(1, Number($('#b-par').value) || B.par);
    const ids = steelIds(rows);
    rows = rows.map(r => ({ type: r.type, x: clamp(r.x, -B.maxX, B.maxX), yd: r.type === 'position' ? clamp(r.yd, 0, B.maxRun) : clamp(r.yd, B.yards[0], B.yards[1]),
      ...(ACTIVATED.includes(r.type) ? { by: ids.includes(r.by) ? r.by : ids[0] } : {}) }));
    if (!rows.some(r => !PROPS.includes(r.type) && r.type !== 'noshoot' && r.type !== 'position')) return toast('Add at least one target to shoot.');
    if (rows.some(r => ACTIVATED.includes(r.type)) && !ids.length) return toast('A pop-up, turner, swinger or clamshell needs a steel target to release it.');
    const stage = { name, par, rows };
    const all = loadStages().filter(s => s.name !== name && s.name !== current?.name);
    all.push(stage);
    save(CONFIG.storage.stages, all);
    el.hidden = true;
    onSave(stage, current?.name);
  };
  $('#b-delete').onclick = () => {
    if (!current) return;
    save(CONFIG.storage.stages, loadStages().filter(s => s.name !== current.name));
    el.hidden = true;
    onDelete(current.name);
  };
  $('#b-close').onclick = () => { el.hidden = true; };
  el.hidden = false;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || 0));
