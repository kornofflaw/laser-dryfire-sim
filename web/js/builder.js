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
  bob: 'Paper: bobber', run: 'Paper: mover (runs to x...)',
  noshoot: 'No-shoot', popper: 'Popper', mini: 'Mini popper',
  plate: 'Plate (8 in)', wall: 'Wall (4 x 6 ft)', barrel: 'Barrel', clamshell: 'Clamshell (drop cover)',
  position: 'You run to here (next position)',
};
const STEEL = ['popper', 'mini', 'plate'];
const PROPS = ['wall', 'barrel', 'clamshell'];
const ACTIVATED = ['pop', 'turn', 'swing', 'bob', 'run', 'clamshell']; // released by a steel (row.by); a mover runs to row.to
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
    if (r.type === 'position' && !items.length && positions.length === 1) positions[0] = { x: r.x, yd: r.yd }; // before any target: where you start
    else if (r.type === 'position') positions.push({ x: r.x, yd: r.yd });
    else if (PROPS.includes(r.type)) props.push({ type: r.type, x: r.x, yd: r.yd, ...(r.type === 'clamshell' ? { by: r.by } : {}) });
    else items.push({ ...(ACTIVATED.includes(r.type) ? { type: 'paper', [r.type]: { by: r.by, ...(r.type === 'run' ? { to: r.to ?? -r.x } : {}) } } : { type: r.type }), x: r.x, yd: r.yd, ...(pos ? { pos } : {}) });
  }
  const act = items.filter(i => i.pop || i.turn || i.swing || i.bob || i.run).length;
  const paper = items.filter(i => i.type === 'paper').length, steel = items.filter(i => STEEL.includes(i.type)).length;
  return {
    name: s.name, category: 'My Stages', type: 'stage', layout: 'range3d-stage', parTime: s.par, custom: true,
    maxShots: paper * 2 + steel + CONFIG.builder.spareRounds,
    desc: `Your stage: ${paper} paper${act ? ` (${act} activated)` : ''}, ${steel} steel${props.length ? `, ${props.length} prop${props.length > 1 ? 's' : ''}` : ''}. Edit it with B.`,
    stage: { items, props, ...(positions.length > 1 ? { positions } : {}), ...(s.start ? { start: s.start } : {}) },
  };
}

// A stock stage as builder rows (to copy it into My Stages): the targets
// shot from each position follow that position's row; props come first.
// (Movers and bobbers become plain paper; the builder has no such rows.)
export function stageRows(course) {
  const st = course.stage, rows = [];
  for (const p of st.props || []) if (PROPS.includes(p.type)) rows.push({ type: p.type, x: p.x, yd: p.yd, ...(p.by ? { by: p.by } : {}) });
  const n = st.positions?.length || 1;
  for (let k = 0; k < n; k++) {
    const P = st.positions?.[k];
    if (k || (P && (P.x || P.yd))) rows.push({ type: 'position', x: P.x || 0, yd: P.yd || 0 });
    for (const it of st.items.filter(i => (i.pos ?? 0) === k)) {
      const act = ['pop', 'turn', 'swing', 'bob', 'run'].find(a => it[a]);
      rows.push(act ? { type: act, x: it.x, yd: it.yd, by: it[act].by, ...(act === 'run' ? { to: it.run.to } : {}) } : { type: TYPES[it.type] ? it.type : 'paper', x: it.x, yd: it.yd });
    }
  }
  return { name: `${course.name} (my copy)`, par: course.parTime, rows, start: st.start };
}

// Open the form. current: a saved stage to edit (or null for a new one);
// prefill: a new stage's starting values (a copy of a stock stage);
// onSave(stage) / onDelete(name) are called with the result.
export function openBuilder(current, { onSave, onDelete, toast, prefill = null }) {
  const el = document.getElementById('builder');
  const B = CONFIG.builder;
  const from = current || prefill;
  let rows = from ? from.rows.map(r => ({ ...r })) : B.starter.map(r => ({ ...r }));
  const $ = s => el.querySelector(s);
  $('#b-name').value = from?.name || '';
  $('#b-par').value = from?.par ?? B.par;
  const starts = from?.start && !B.starts.includes(from.start) ? [from.start, ...B.starts] : B.starts;
  $('#b-start').innerHTML = starts.map(s => `<option>${s}</option>`).join('');
  $('#b-start').value = from?.start || B.starts[0];
  $('#b-delete').hidden = !current;
  const render = () => {
    const ids = steelIds(rows);
    $('#b-rows').innerHTML = rows.map((r, i) => `<tr data-i="${i}">
      <td><select data-k="type">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}"${k === r.type ? ' selected' : ''}>${v}</option>`).join('')}</select></td>
      <td><input data-k="x" type="number" step="0.1" min="${-B.maxX}" max="${B.maxX}" value="${r.x}"></td>
      <td><input data-k="yd" type="number" step="0.5" min="${B.yards[0]}" max="${B.yards[1]}" value="${r.yd}"></td>
      <td>${ACTIVATED.includes(r.type) ? `<select data-k="by">${ids.map(id => `<option${id === r.by ? ' selected' : ''}>${id}</option>`).join('') || '<option value="">add steel</option>'}</select>` : ''}${r.type === 'run' ? ` to x <input data-k="to" type="number" step="0.1" min="${-B.maxX}" max="${B.maxX}" value="${r.to ?? -r.x}">` : ''}</td>
      <td><button class="icon" data-del="${i}" aria-label="Remove">✕</button></td></tr>`).join('');
  };
  // Top-down map (you at the bottom, downrange up): x across, yards up.
  const drawMap = () => {
    const c = $('#b-map'), g = c.getContext('2d'), W = c.width, H = c.height, maxYd = B.yards[1];
    const px = x => W / 2 + (x / (B.maxX + 1)) * (W / 2 - 10), py = yd => H - 16 - (yd / maxYd) * (H - 30);
    g.fillStyle = '#b8ab92'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.fillStyle = 'rgba(0,0,0,0.45)'; g.font = '10px system-ui, sans-serif'; g.textAlign = 'left';
    for (let yd = 5; yd <= maxYd; yd += 5) { g.beginPath(); g.moveTo(0, py(yd)); g.lineTo(W, py(yd)); g.stroke(); g.fillText(`${yd} yd`, 4, py(yd) - 2); }
    const ids = steelIds(rows);
    let pos = 1, steelN = 0, target = false, start = null;
    g.textAlign = 'center';
    for (const r of rows) {
      const x = px(r.x), y = py(r.yd);
      if (r.type === 'position' && !target && !start) { start = [x, y]; continue; } // where you start
      if (r.type !== 'position' && !PROPS.includes(r.type)) target = true;
      if (r.type === 'position') { pos++; g.fillStyle = '#2e7d32'; g.fillRect(x - 8, y - 8, 16, 12); g.fillStyle = '#fff'; g.fillText(pos, x, y + 2); continue; }
      if (r.type === 'wall') { g.fillStyle = '#8d6e3f'; g.fillRect(x - 12, y - 2, 24, 4); continue; }
      if (r.type === 'barrel') { g.fillStyle = '#24569e'; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); continue; }
      if (r.type === 'clamshell') { g.strokeStyle = '#6d4c2f'; g.setLineDash([3, 2]); g.strokeRect(x - 8, y - 2, 16, 4); g.setLineDash([]); continue; }
      if (STEEL.includes(r.type)) { g.fillStyle = '#f2f2ee'; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); g.fillStyle = '#333'; g.fillText(ids[steelN++], x, y - 8); continue; }
      g.fillStyle = r.type === 'noshoot' ? '#f4f4f0' : ACTIVATED.includes(r.type) ? '#d19a4a' : '#c49a64';
      g.fillRect(x - 6, y - 3, 12, 6);
      if (ACTIVATED.includes(r.type)) { g.fillStyle = '#333'; g.fillText(r.type, x, y - 6); }
    }
    const [sx, sy] = start || [px(0), py(0)];
    g.fillStyle = '#2e7d32'; g.fillRect(sx - 8, sy - 8, 16, 12); // start position
    g.fillStyle = '#fff'; g.fillText('1', sx, sy + 2);
  };
  const render0 = render;
  const rerender = () => { render0(); drawMap(); };
  rerender();
  $('#b-rows').onchange = e => {
    const tr = e.target.closest('tr'), k = e.target.dataset.k;
    if (!tr || !k) return;
    const r = rows[Number(tr.dataset.i)];
    r[k] = k === 'type' || k === 'by' ? e.target.value : Number(e.target.value);
    if (k === 'type') render(); // (activated paper gets its "released by" choice)
    drawMap();
  };
  $('#b-rows').onclick = e => { const i = e.target.dataset.del; if (i != null) { rows.splice(Number(i), 1); rerender(); } };
  $('#b-add').onclick = () => { const last = rows[rows.length - 1]; rows.push({ type: 'paper', x: last ? Math.min(B.maxX, last.x + 1.5) : 0, yd: last?.yd ?? 7 }); rerender(); };
  $('#b-save').onclick = () => {
    const name = $('#b-name').value.trim() || `My stage ${loadStages().length + 1}`;
    const par = Math.max(1, Number($('#b-par').value) || B.par);
    const ids = steelIds(rows);
    rows = rows.map(r => ({ type: r.type, x: clamp(r.x, -B.maxX, B.maxX), yd: r.type === 'position' ? clamp(r.yd, 0, B.maxRun) : clamp(r.yd, B.yards[0], B.yards[1]),
      ...(ACTIVATED.includes(r.type) ? { by: ids.includes(r.by) ? r.by : ids[0] } : {}),
      ...(r.type === 'run' ? { to: clamp(r.to ?? -r.x, -B.maxX, B.maxX) } : {}) }));
    if (!rows.some(r => !PROPS.includes(r.type) && r.type !== 'noshoot' && r.type !== 'position')) return toast('Add at least one target to shoot.');
    if (rows.some(r => ACTIVATED.includes(r.type)) && !ids.length) return toast('A pop-up, turner, swinger, bobber, mover or clamshell needs a steel target to release it.');
    const stage = { name, par, rows, start: $('#b-start').value };
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
