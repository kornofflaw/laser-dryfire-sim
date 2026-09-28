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
  noshoot: 'No-shoot', nsswing: 'No-shoot: swinger', popper: 'Popper', mini: 'Mini popper',
  plate: 'Plate (8 in)', wall: 'Wall (4 x 6 ft)', wall8: 'Wall (4 x 8 ft, hides a swinger)', porthigh: 'Wall with a port', portlow: 'Wall with a low port (kneel)', barricade: 'Barricade (3 ports: stand / kneel / prone)', barrel: 'Barrel', clamshell: 'Clamshell (drop cover)',
  position: 'You run to here (next position)',
  walkto: 'You walk to here, shooting on the way',
};
const STEEL = ['popper', 'mini', 'plate'];
const STANCES = ['kneel', 'prone']; // a position row's stance ('' = standing)
const MOVES = ['position', 'walkto']; // rows that are places you shoot from, not targets
const PROPS = ['wall', 'wall8', 'barrel', 'clamshell', 'porthigh', 'portlow', 'barricade'];
// A barricade row: a narrow tall panel with a port for each stance.
const barricade = r => {
  const B = CONFIG.range3d.props.barricade;
  return { type: 'wall', x: r.x, yd: r.yd, w: B.w, h: B.h, ports: B.ports.map(p => ({ ...p })) };
};
// A port wall row as a stage prop (8 x 7 ft plywood with the port cut in it).
const portWall = (r, side) => {
  const W = CONFIG.range3d.props.ports, p = W[side];
  return { type: 'wall', x: r.x, yd: r.yd, w: W.w, h: W.h, port: { x: 0, y: p.y, w: p.w, h: p.h } };
};
const ACTIVATED = ['pop', 'turn', 'swing', 'bob', 'run', 'clamshell', 'nsswing']; // released by a steel (row.by); a mover runs to row.to
const PAPER = ['paper', 'pop', 'turn', 'swing', 'bob', 'run']; // may carry hard cover (row.hard: a side of CONFIG.builder.hardCover)
// A 'position' row: you run there ('walkto': you walk there, shooting on the way); the targets listed after it are shot
// from there (the first position is the start, x 0 at the firing line).

// Stage ids of the steel rows, in order (as courses.js stageTargets gives them).
const steelIds = rows => rows.filter(r => STEEL.includes(r.type)).map((_, i) => `S${i + 1}`);

export const loadStages = () => { const s = load(CONFIG.storage.stages, []); return Array.isArray(s) ? s : []; };

// A saved stage as a course (courses.js stage format).
export function stageCourse(s) {
  const positions = [{ x: 0, yd: 0 }], items = [], props = [];
  for (const r of s.rows) {
    const pos = positions.length - 1;
    const stance = STANCES.includes(r.stance) ? { stance: r.stance } : {};
    if (MOVES.includes(r.type) && !items.length && positions.length === 1) positions[0] = { x: r.x, yd: r.yd, ...stance }; // before any target: where you start
    else if (r.type === 'position') positions.push({ x: r.x, yd: r.yd, ...stance });
    else if (r.type === 'walkto') positions.push({ x: r.x, yd: r.yd, onMove: true });
    else if (r.type === 'porthigh' || r.type === 'portlow') props.push(portWall(r, r.type === 'portlow' ? 'low' : 'high'));
    else if (r.type === 'barricade') props.push(barricade(r));
    else if (r.type === 'wall8') props.push({ type: 'wall', x: r.x, yd: r.yd, h: CONFIG.builder.tallWall });
    else if (PROPS.includes(r.type)) props.push({ type: r.type, x: r.x, yd: r.yd, ...(r.type === 'clamshell' ? { by: r.by } : {}) });
    else if (r.type === 'nsswing') items.push({ type: 'noshoot', swing: { by: r.by, ...rest(r) }, x: r.x, yd: r.yd, ...(pos ? { pos } : {}), ...height(r), ...facing(r) });
    else if (r.type === 'plate') items.push({ type: 'plate', x: r.x, yd: r.yd, ...(pos ? { pos } : {}), ...plateSize(r.size), ...(Object.hasOwn(CONFIG.builder.plateHeights, r.ph || '') ? { h: CONFIG.builder.plateHeights[r.ph].h } : {}), ...(r.stop && !items.some(i => i.stop) ? { stop: true } : {}) });
    else items.push({ ...(ACTIVATED.includes(r.type) ? { type: 'paper', [r.type]: { by: r.by, ...(r.type === 'run' ? { to: r.to ?? -r.x } : {}), ...(r.type === 'swing' ? rest(r) : {}) } } : { type: r.type }), x: r.x, yd: r.yd, ...(pos ? { pos } : {}), ...(hardCover(r)), ...height(r), ...facing(r) });
  }
  const act = items.filter(i => i.pop || i.turn || i.swing || i.bob || i.run).length;
  const paper = items.filter(i => i.type === 'paper').length, steel = items.filter(i => STEEL.includes(i.type)).length;
  if (items.some(i => i.stop)) { // a stop plate: Steel Challenge style (strings, lowest total time)
    const plates = items.filter(i => STEEL.includes(i.type)).length - 1;
    return {
      name: s.name, category: 'My Stages', type: 'strings', layout: 'range3d-stage', parTime: s.par, custom: true,
      desc: `Your Steel Challenge style stage: ${plates} plate${plates === 1 ? '' : 's'} and the stop plate (red pole) - shoot it last. ${CONFIG.steelChallenge.strings} strings, the slowest thrown out. Edit it with B.`,
      stage: { items: items.filter(i => STEEL.includes(i.type)), props, ...(s.start ? { start: s.start } : {}) },
    };
  }
  return {
    name: s.name, category: 'My Stages', type: 'stage', layout: 'range3d-stage', parTime: s.par, custom: true,
    maxShots: paper * 2 + steel + CONFIG.builder.spareRounds,
    desc: `Your stage: ${paper} paper${act ? ` (${act} activated)` : ''}, ${steel} steel${props.length ? `, ${props.length} prop${props.length > 1 ? 's' : ''}` : ''}. Edit it with B.`,
    stage: { items, props, ...(positions.length > 1 ? { positions } : {}), ...(s.start ? { start: s.start } : {}) },
  };
}

// Hard cover painted on a paper row: { hard: { side, cm } } or nothing.
const hardCover = r => {
  const cm = PAPER.includes(r.type) && CONFIG.builder.hardCover[r.hard]?.cm;
  return cm ? { hard: { side: r.hard, cm } } : {};
};

// A plate row's size (CONFIG.builder.plateSizes key; none = 8 in).
const plateSize = k => {
  const P = Object.hasOwn(CONFIG.builder.plateSizes, k || '') && CONFIG.builder.plateSizes[k];
  return P ? (P.rect ? { rect: [...P.rect] } : { in: P.in }) : {};
};
const sizeOf = it => it.rect ? 'rect' : Object.keys(CONFIG.builder.plateSizes).find(k => CONFIG.builder.plateSizes[k].in === it.in);

// ...and the nearest plate height choice for a stock plate's h.
const phOf = h => {
  const [k, v] = Object.entries(CONFIG.builder.plateHeights).sort((a, b) => Math.abs(a[1].h - h) - Math.abs(b[1].h - h))[0];
  return Math.abs(v.h - h) < 0.15 ? { ph: k } : {};
};

// A swinger row held to the left (behind cover there) before it's released.
const SWINGS = ['swing', 'nsswing'];
const rest = r => (r.left ? { rest: -CONFIG.range3d.swinger.rest } : {});

// A paper / no-shoot row turned: { face: degrees } or nothing (square on).
const facing = r => {
  const F = (PAPER.includes(r.type) || r.type === 'noshoot') && r.type !== 'turn' && Object.hasOwn(CONFIG.builder.facings, r.face || '') && CONFIG.builder.facings[r.face];
  return F ? { face: F.deg } : {};
};
const faceOf = deg => {
  const [k, v] = Object.entries(CONFIG.builder.facings).sort((a, b) => Math.abs(a[1].deg - deg) - Math.abs(b[1].deg - deg))[0];
  return Math.abs(v.deg - deg) < 10 ? { face: k } : {};
};

// A paper / no-shoot row's height: { dy } or nothing (normal).
const height = r => {
  const h = (PAPER.includes(r.type) || r.type === 'noshoot') && Object.hasOwn(CONFIG.builder.heights, r.h || '') && CONFIG.builder.heights[r.h];
  return h ? { dy: h.dy } : {};
};
// ...and back: the nearest height choice for a stock item's dy.
const heightOf = dy => {
  if (!dy) return {};
  const [k] = Object.entries(CONFIG.builder.heights).sort((a, b) => Math.abs(a[1].dy - dy) - Math.abs(b[1].dy - dy))[0];
  return Math.abs(CONFIG.builder.heights[k].dy - dy) < 0.2 ? { h: k } : {};
};

// A stock stage as builder rows (to copy it into My Stages): the targets
// shot from each position follow that position's row; props come first.
// (Movers and bobbers become plain paper; the builder has no such rows.)
export function stageRows(course) {
  const st = course.stage, rows = [];
  for (const p of st.props || []) {
    if (!PROPS.includes(p.type)) continue;
    const type = p.type === 'wall' && p.ports ? 'barricade' : p.type === 'wall' && p.port ? (p.port.y < 1.2 ? 'portlow' : 'porthigh') : p.type === 'wall' && p.h > 2 ? 'wall8' : p.type;
    rows.push({ type, x: p.x, yd: p.yd, ...(p.by ? { by: p.by } : {}) });
  }
  const n = st.positions?.length || 1;
  for (let k = 0; k < n; k++) {
    const P = st.positions?.[k];
    if (k || (P && (P.x || P.yd || P.stance))) rows.push({ type: k && P.onMove ? 'walkto' : 'position', x: P.x || 0, yd: P.yd || 0, ...(P.stance ? { stance: P.stance } : {}) });
    for (const it of st.items.filter(i => (i.pos ?? 0) === k)) {
      const act = it.type === 'noshoot' ? (it.swing ? 'nsswing' : null) : ['pop', 'turn', 'swing', 'bob', 'run'].find(a => it[a]);
      const hard = { ...(it.hard?.side ? { hard: it.hard.side } : {}), ...heightOf(it.dy), ...(it.face ? faceOf(it.face) : {}) };
      rows.push(act ? { type: act, x: it.x, yd: it.yd, by: it[act === 'nsswing' ? 'swing' : act].by, ...(act === 'run' ? { to: it.run.to } : {}), ...(SWINGS.includes(act) && it.swing.rest < 0 ? { left: true } : {}), ...hard } : { type: TYPES[it.type] ? it.type : 'paper', x: it.x, yd: it.yd, ...hard, ...(it.type === 'plate' && sizeOf(it) ? { size: sizeOf(it) } : {}), ...(it.type === 'plate' && it.h ? phOf(it.h) : {}), ...(it.stop ? { stop: true } : {}) });
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
      <td><input data-k="x" type="number" step="0.05" min="${-B.maxX}" max="${B.maxX}" value="${r.x}"></td>
      <td><input data-k="yd" type="number" step="0.1" min="${B.yards[0]}" max="${B.yards[1]}" value="${r.yd}"></td>
      <td>${ACTIVATED.includes(r.type) ? `<select data-k="by">${ids.map(id => `<option${id === r.by ? ' selected' : ''}>${id}</option>`).join('') || '<option value="">add steel</option>'}</select>` : ''}${r.type === 'run' ? ` to x <input data-k="to" type="number" step="0.1" min="${-B.maxX}" max="${B.maxX}" value="${r.to ?? -r.x}">` : ''}${SWINGS.includes(r.type) ? ` <select data-k="left" title="Where it's held (behind cover) until released"><option value="">held right</option><option value="1"${r.left ? ' selected' : ''}>held left</option></select>` : ''}${r.type === 'position' ? `<select data-k="stance">${[['', 'standing'], ['kneel', 'kneeling'], ['prone', 'prone']].map(([k, v]) => `<option value="${k}"${k === (r.stance || '') ? ' selected' : ''}>${v}</option>`).join('')}</select>` : ''}${r.type === 'plate' ? ` <select data-k="stop" title="A stop plate makes it a Steel Challenge style stage: strings, shoot the stop plate last"><option value="">plate</option><option value="1"${r.stop ? ' selected' : ''}>stop plate</option></select>` : ''}${r.type === 'plate' ? ` <select data-k="ph"><option value="">normal post</option>${Object.entries(B.plateHeights).map(([k, v]) => `<option value="${k}"${k === r.ph ? ' selected' : ''}>${v.label}</option>`).join('')}</select>` : ''}${r.type === 'plate' ? ` <select data-k="size"><option value="">8 in</option>${Object.entries(B.plateSizes).map(([k, v]) => `<option value="${k}"${k === r.size ? ' selected' : ''}>${v.label}</option>`).join('')}</select>` : ''}${r.type === 'noshoot' ? ` <select data-k="over" title="Put it in front of the paper row above, partly covering it"><option value="">place it myself</option>${Object.entries(B.nsCover.spots).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select>` : ''}${(PAPER.includes(r.type) || r.type === 'noshoot') && r.type !== 'turn' ? ` <select data-k="face" title="Turned to face across the bay"><option value="">square on</option>${Object.entries(B.facings).map(([k, v]) => `<option value="${k}"${k === r.face ? ' selected' : ''}>${v.label}</option>`).join('')}</select>` : ''}${PAPER.includes(r.type) || r.type === 'noshoot' ? ` <select data-k="h" title="Height of the target on its stand"><option value="">normal height</option>${Object.entries(B.heights).map(([k, v]) => `<option value="${k}"${k === r.h ? ' selected' : ''}>${v.label}</option>`).join('')}</select>` : ''}${PAPER.includes(r.type) ? ` <select data-k="hard" title="Hard cover: black paint, shots through it don't score"><option value="">no cover</option>${Object.entries(B.hardCover).map(([k, v]) => `<option value="${k}"${k === r.hard ? ' selected' : ''}>${v.label}</option>`).join('')}</select>` : ''}</td>
      <td class="b-acts"><button class="icon" data-up="${i}" aria-label="Move up" title="Move up"${i ? '' : ' disabled'}>↑</button><button class="icon" data-down="${i}" aria-label="Move down" title="Move down"${i < rows.length - 1 ? '' : ' disabled'}>↓</button><button class="icon" data-dup="${i}" aria-label="Duplicate" title="Duplicate (placed a little to the right)">⧉</button><button class="icon" data-del="${i}" aria-label="Remove" title="Remove">✕</button></td></tr>`).join('');
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
      if (MOVES.includes(r.type) && !target && !start) { start = [x, y]; continue; } // where you start
      if (!MOVES.includes(r.type) && !PROPS.includes(r.type)) target = true;
      if (MOVES.includes(r.type)) { pos++; g.fillStyle = r.type === 'walkto' ? '#1565c0' : '#2e7d32'; g.fillRect(x - 8, y - 8, 16, 12); g.fillStyle = '#fff'; g.fillText(pos, x, y + 2); continue; }
      if (r.type === 'wall' || r.type === 'wall8') { g.fillStyle = '#8d6e3f'; g.fillRect(x - 12, y - 2, 24, 4); continue; }
      if (r.type === 'barricade') { g.fillStyle = '#8d6e3f'; g.fillRect(x - 12, y - 3, 24, 6); g.fillStyle = '#333'; g.fillText('barricade', x, y - 6); continue; }
      if (r.type === 'porthigh' || r.type === 'portlow') { // a wider wall with the port gap
        g.fillStyle = '#8d6e3f'; g.fillRect(x - 24, y - 2, 18, 4); g.fillRect(x + 6, y - 2, 18, 4);
        g.fillStyle = '#333'; g.fillText(r.type === 'portlow' ? 'low port' : 'port', x, y - 6); continue;
      }
      if (r.type === 'barrel') { g.fillStyle = '#24569e'; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); continue; }
      if (r.type === 'clamshell') { g.strokeStyle = '#6d4c2f'; g.setLineDash([3, 2]); g.strokeRect(x - 8, y - 2, 16, 4); g.setLineDash([]); continue; }
      if (STEEL.includes(r.type)) { g.fillStyle = '#f2f2ee'; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); g.fillStyle = '#333'; g.fillText(ids[steelN++], x, y - 8); continue; }
      g.fillStyle = r.type === 'noshoot' || r.type === 'nsswing' ? '#f4f4f0' : ACTIVATED.includes(r.type) ? '#d19a4a' : '#c49a64';
      g.fillRect(x - 6, y - 3, 12, 6);
      if (PAPER.includes(r.type) && B.hardCover[r.hard]) { // hard cover: the painted edge, black
        g.fillStyle = '#161616';
        g.fillRect(...{ left: [x - 6, y - 3, 4, 6], right: [x + 2, y - 3, 4, 6], top: [x - 6, y - 3, 12, 2], bottom: [x - 6, y + 1, 12, 2] }[r.hard]);
      }
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
    const i = Number(tr.dataset.i), r = rows[i];
    if (k === 'over') { // a no-shoot in front of the paper above: set its x / yd / height from that paper
      const spot = B.nsCover.spots[e.target.value], above = rows.slice(0, i).reverse().find(p => PAPER.includes(p.type));
      if (!spot) return;
      if (!above) return toast('Add a paper row above the no-shoot first.');
      Object.assign(r, { x: Math.round((above.x + spot.dx) * 100) / 100, yd: Math.round((above.yd - B.nsCover.front) * 10) / 10, h: spot.h });
      return rerender();
    }
    r[k] = k === 'left' || k === 'stop' ? !!e.target.value : k === 'type' || k === 'by' || k === 'hard' || k === 'stance' || k === 'h' || k === 'size' || k === 'ph' || k === 'face' ? e.target.value : Number(e.target.value);
    if (k === 'type') render(); // (activated paper gets its "released by" choice)
    drawMap();
  };
  $('#b-rows').onclick = e => {
    const d = e.target.closest('button')?.dataset;
    if (!d) return;
    if (d.del != null) rows.splice(Number(d.del), 1);
    else if (d.up != null && d.up > 0) { const i = Number(d.up); [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; }
    else if (d.down != null && d.down < rows.length - 1) { const i = Number(d.down); [rows[i], rows[i + 1]] = [rows[i + 1], rows[i]]; }
    else if (d.dup != null) { const r = rows[Number(d.dup)]; rows.splice(Number(d.dup) + 1, 0, { ...r, x: Math.min(B.maxX, Math.round((r.x + B.dupStep) * 100) / 100) }); }
    else return;
    rerender();
  };
  $('#b-add').onclick = () => { const last = rows[rows.length - 1]; rows.push({ type: 'paper', x: last ? Math.min(B.maxX, last.x + 1.5) : 0, yd: last?.yd ?? 7 }); rerender(); };
  $('#b-save').onclick = () => {
    const name = $('#b-name').value.trim() || `My stage ${loadStages().length + 1}`;
    const par = Math.max(1, Number($('#b-par').value) || B.par);
    const ids = steelIds(rows);
    rows = rows.map(r => ({ type: r.type, x: clamp(r.x, -B.maxX, B.maxX), yd: MOVES.includes(r.type) ? clamp(r.yd, 0, B.maxRun) : PROPS.includes(r.type) ? clamp(r.yd, 1, B.yards[1]) : clamp(r.yd, B.yards[0], B.yards[1]),
      ...(ACTIVATED.includes(r.type) ? { by: ids.includes(r.by) ? r.by : ids[0] } : {}),
      ...(r.type === 'run' ? { to: clamp(r.to ?? -r.x, -B.maxX, B.maxX) } : {}),
      ...(PAPER.includes(r.type) && B.hardCover[r.hard] ? { hard: r.hard } : {}),
      ...(r.type === 'position' && STANCES.includes(r.stance) ? { stance: r.stance } : {}),
      ...(SWINGS.includes(r.type) && r.left ? { left: true } : {}),
      ...(r.type === 'plate' && Object.hasOwn(B.plateSizes, r.size || '') ? { size: r.size } : {}),
      ...(r.type === 'plate' && r.stop ? { stop: true } : {}),
      ...(r.type === 'plate' && Object.hasOwn(B.plateHeights, r.ph || '') ? { ph: r.ph } : {}),
      ...((PAPER.includes(r.type) || r.type === 'noshoot') && Object.hasOwn(B.facings, r.face || '') ? { face: r.face } : {}),
      ...((PAPER.includes(r.type) || r.type === 'noshoot') && Object.hasOwn(B.heights, r.h || '') ? { h: r.h } : {}) }));
    if (!rows.some(r => !PROPS.includes(r.type) && r.type !== 'noshoot' && r.type !== 'nsswing' && !MOVES.includes(r.type))) return toast('Add at least one target to shoot.');
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
  // Share: the form as a short text code (to paste into another browser).
  $('#b-code').value = '';
  $('#b-export').onclick = () => {
    const code = encodeStage({ name: $('#b-name').value.trim() || 'Shared stage', par: Number($('#b-par').value) || B.par, start: $('#b-start').value, rows });
    $('#b-code').value = code;
    $('#b-code').select();
    navigator.clipboard?.writeText(code).then(() => toast('Stage code copied.'), () => toast('Stage code made: copy it from the box.'));
  };
  $('#b-import').onclick = () => {
    const s = decodeStage($('#b-code').value);
    if (!s) return toast('That isn\'t a stage code.');
    rows = s.rows;
    $('#b-name').value = s.name;
    $('#b-par').value = s.par;
    if (s.start && ![...$('#b-start').options].some(o => o.value === s.start)) $('#b-start').add(new Option(s.start, s.start), 0);
    $('#b-start').value = s.start || B.starts[0];
    rerender();
    toast(`Loaded "${s.name}" - Save to keep it.`);
  };
  $('#b-close').onclick = () => { el.hidden = true; };
  el.hidden = false;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || 0));

// Stage codes: 'DFS1.' + base64url(JSON). Checked on the way back in.
const CODE = 'DFS1.';
export function encodeStage(s) {
  const json = JSON.stringify({ n: s.name, p: s.par, s: s.start, r: s.rows.map(r => [r.type, r.x, r.yd, r.by || '', r.to ?? '', r.hard || '', r.stance || '', r.h || '', r.left ? 1 : '', r.size || '', r.stop ? 1 : '', r.ph || '', r.face || '']) });
  return CODE + btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeStage(code) {
  try {
    code = String(code).trim();
    if (!code.startsWith(CODE)) return null;
    const b64 = code.slice(CODE.length).replace(/-/g, '+').replace(/_/g, '/');
    const o = JSON.parse(decodeURIComponent(escape(atob(b64))));
    const rows = (o.r || []).filter(r => TYPES[r[0]]).slice(0, 60).map(([type, x, yd, by, to, hard, stance, h, left, size, stop, ph, face]) => ({
      type, x: Number(x) || 0, yd: Number(yd) || 0, ...(by ? { by: String(by) } : {}), ...(to !== '' && to != null ? { to: Number(to) } : {}),
      ...(Object.hasOwn(CONFIG.builder.hardCover, hard) ? { hard } : {}), ...(STANCES.includes(stance) ? { stance } : {}), ...(Object.hasOwn(CONFIG.builder.heights, h || '') ? { h } : {}), ...(left ? { left: true } : {}), ...(Object.hasOwn(CONFIG.builder.plateSizes, String(size ?? '')) ? { size: String(size) } : {}), ...(stop ? { stop: true } : {}), ...(Object.hasOwn(CONFIG.builder.plateHeights, ph || '') ? { ph } : {}), ...(Object.hasOwn(CONFIG.builder.facings, face || '') ? { face } : {}),
    }));
    if (!rows.length) return null;
    return { name: String(o.n || 'Shared stage').slice(0, 40), par: Number(o.p) || CONFIG.builder.par, start: o.s ? String(o.s).slice(0, 120) : '', rows };
  } catch { return null; }
}
