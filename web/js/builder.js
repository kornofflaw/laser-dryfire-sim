// builder.js — build your own stage (the Build button, B, or Courses ->
// "Build a stage").
// ---------------------------------------------------------------------------
// A map of the bay to build on (pick what to add, click where it goes, drag
// to move) over a list of rows: type, x across in metres (left negative),
// distance in yards and each row's details. Saved stages live in this browser
// (storage.js, CONFIG.storage.stages) and appear in the course list under
// "My Stages" as ordinary stages (courses.js stage format).

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
    else items.push({ ...(ACTIVATED.includes(r.type) ? { type: 'paper', [r.type]: { by: r.by, ...(r.type === 'run' ? { to: r.to ?? -r.x } : {}), ...(r.type === 'swing' ? rest(r) : {}) } } : { type: r.type }), x: r.x, yd: r.yd, ...(pos ? { pos } : {}), ...(hardCover(r)), ...height(r), ...facing(r), ...(r.shared && (r.type === 'paper' || r.type === 'noshoot') ? { shared: true } : {}) });
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
    // (one position that isn't the default box still says where you start)
    stage: { items, props, ...(positions.length > 1 || positions[0].x || positions[0].yd || positions[0].stance ? { positions } : {}), ...(s.start ? { start: s.start } : {}) },
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
      const hard = { ...(it.hard?.side ? { hard: it.hard.side } : {}), ...heightOf(it.dy), ...(it.face ? faceOf(it.face) : {}), ...(it.shared ? { shared: true } : {}) };
      rows.push(act ? { type: act, x: it.x, yd: it.yd, by: it[act === 'nsswing' ? 'swing' : act].by, ...(act === 'run' ? { to: it.run.to } : {}), ...(SWINGS.includes(act) && it.swing.rest < 0 ? { left: true } : {}), ...hard } : { type: TYPES[it.type] ? it.type : 'paper', x: it.x, yd: it.yd, ...hard, ...(it.type === 'plate' && sizeOf(it) ? { size: sizeOf(it) } : {}), ...(it.type === 'plate' && it.h ? phOf(it.h) : {}), ...(it.stop ? { stop: true } : {}) });
    }
  }
  return { name: `${course.name} (my copy)`, par: course.parTime, rows, start: st.start };
}

// ---- The builder form ---------------------------------------------------------
// A top-down map of the bay you build on (pick what to add, click where it
// goes, drag to move, click to select) and, under it, the list of rows with
// every detail (released by, cover, height...). The list order matters: steel
// is numbered S1, S2... in list order, and the targets after a "You run to
// here" row are shot from that position.

// One-click tools above the map (the rest are under "More...").
const TOOLS = ['paper', 'noshoot', 'popper', 'mini', 'plate', 'wall', 'barrel', 'position'];
const TOOL_NAMES = { paper: 'Paper', noshoot: 'No-shoot', popper: 'Popper', mini: 'Mini popper', plate: 'Plate', wall: 'Wall', barrel: 'Barrel', position: 'Shooting position' };
// Short names on the map for activated targets.
const SHORT = { pop: 'pop-up', turn: 'turner', swing: 'swinger', bob: 'bobber', run: 'mover', nsswing: 'swinger', clamshell: 'clamshell' };
const YARD_M = 0.9144;
// Real widths across (m) for drawing to scale.
const WIDTH_M = { popper: 0.3, mini: 0.2, wall: 1.22, wall8: 1.22, porthigh: 2.44, portlow: 2.44, barricade: 1.22, clamshell: 0.8, barrel: 0.58, position: 1.2, walkto: 1.2 };
const widthM = r => r.type === 'plate' ? (r.size === 'rect' ? 0.46 : (Number(CONFIG.builder.plateSizes[r.size]?.in) || 8) * 0.0254) : WIDTH_M[r.type] ?? 0.46;
const ydRange = t => MOVES.includes(t) ? [0, CONFIG.builder.maxRun] : PROPS.includes(t) ? [1, CONFIG.builder.yards[1]] : [CONFIG.builder.yards[0], CONFIG.builder.yards[1]];
const round = (v, step) => Number((Math.round(v / step) * step).toFixed(2));

// What each row is on the score sheet (P1, NS1, S1 - as courses.js
// stageTargets numbers them) and which shooting position it's shot from
// (pos: 0 = the start box; move: the row IS a position, label = its number).
function rowInfo(rows) {
  let npos = 1, anyTarget = false, p = 0, n = 0, s = 0;
  return rows.map(r => {
    if (MOVES.includes(r.type)) {
      if (!anyTarget && npos === 1) return { move: true, pos: 0, label: '1' }; // before any target: where you start
      const k = npos++;
      return { move: true, pos: k, label: String(k + 1) };
    }
    if (PROPS.includes(r.type)) return { prop: true, pos: null, label: '' };
    anyTarget = true;
    const label = STEEL.includes(r.type) ? `S${++s}` : r.type === 'noshoot' || r.type === 'nsswing' ? `NS${++n}` : `P${++p}`;
    return { pos: npos - 1, label };
  });
}

// The shooting positions (x m, yd) in order, as stageCourse makes them.
function positionsOf(rows) {
  const info = rowInfo(rows), P = [{ x: 0, yd: 0 }];
  rows.forEach((r, i) => { if (info[i].move) P[info[i].pos] = { x: r.x, yd: r.yd, i }; });
  return P;
}

// Open the builder. current: a saved stage to edit (or null for a new one);
// prefill: a new stage's starting values (a copy of a stock stage);
// onSave(stage, oldName) / onDelete(name) are called with the result;
// viewFov(): the 3D camera's vertical field of view (deg) if not the usual.
let builderOpen = null; // the open builder's key handler and redraw (builderKey, resize)
export function openBuilder(current, { onSave, onDelete, toast, prefill = null, viewFov = () => null }) {
  const el = document.getElementById('builder');
  const B = CONFIG.builder;
  const from = current || prefill;
  let rows = from ? from.rows.map(r => ({ ...r })) : B.starter.map(r => ({ ...r }));
  let sel = -1, tool = '', hover = -1, drag = null;
  const hist = [];
  const $ = s => el.querySelector(s);
  const canvas = $('#b-map');
  $('#b-name').value = from?.name || '';
  $('#b-par').value = from?.par ?? B.par;
  const setStarts = start => {
    const starts = start && !B.starts.includes(start) ? [start, ...B.starts] : B.starts;
    $('#b-start').innerHTML = starts.map(s => `<option>${s}</option>`).join('');
    $('#b-start').value = start || B.starts[0];
  };
  setStarts(from?.start);
  const setCurrent = c => { current = c; $('#b-delete').hidden = !current; };
  setCurrent(current);
  $('#b-tool-btns').innerHTML = TOOLS.map(t => `<button data-tool="${t}"><i class="sw sw-${t}"></i>${TOOL_NAMES[t]}</button>`).join('');
  // "More..." holds the types without a button of their own.
  $('#b-more').innerHTML = '<option value="">More...</option>' + Object.entries(TYPES).filter(([k]) => !TOOLS.includes(k)).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');

  // ---- undo, and keeping activators on their steel ----
  const remember = () => {
    hist.push(JSON.stringify({ rows, sel, name: $('#b-name').value, current }));
    if (hist.length > B.undoSteps) hist.shift();
    $('#b-undo').disabled = false;
  };
  const undo = () => {
    const h = hist.pop();
    if (!h) return toast('Nothing to undo.');
    const s = JSON.parse(h);
    rows = s.rows; sel = s.sel; $('#b-name').value = s.name; setCurrent(s.current);
    $('#b-undo').disabled = !hist.length;
    rerender();
  };
  // Adding, removing or reordering rows renumbers the steel (S1, S2... in
  // list order): pop-ups, swingers and the rest stay released by the same
  // plate or popper.
  const keepSteel = change => {
    const steel = rows.filter(r => STEEL.includes(r.type));
    const links = rows.filter(r => ACTIVATED.includes(r.type) && r.by).map(r => [r, steel[Number(String(r.by).slice(1)) - 1]]);
    change();
    const now = rows.filter(r => STEEL.includes(r.type));
    for (const [r, s] of links) { const k = now.indexOf(s); r.by = k >= 0 ? `S${k + 1}` : now.length ? 'S1' : ''; }
  };

  // ---- the list ----
  const render = () => {
    const ids = steelIds(rows), info = rowInfo(rows);
    $('#b-rows').innerHTML = rows.map((r, i) => { const [lo, hi] = ydRange(r.type); return `<tr data-i="${i}"${i === sel ? ' class="sel"' : ''}>
      <td class="b-id">${info[i].move ? `pos ${info[i].label}` : info[i].label}</td>
      <td><select data-k="type">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}"${k === r.type ? ' selected' : ''}>${v}</option>`).join('')}</select></td>
      <td><input data-k="x" type="number" step="0.05" min="${-B.maxX}" max="${B.maxX}" value="${r.x}"></td>
      <td><input data-k="yd" type="number" step="0.1" min="${lo}" max="${hi}" value="${r.yd}"></td>
      <td>${ACTIVATED.includes(r.type) ? `<select data-k="by">${ids.map(id => `<option${id === r.by ? ' selected' : ''}>${id}</option>`).join('') || '<option value="">add steel</option>'}</select>` : ''}${r.type === 'run' ? ` to x <input data-k="to" type="number" step="0.1" min="${-B.maxX}" max="${B.maxX}" value="${r.to ?? -r.x}">` : ''}${SWINGS.includes(r.type) ? ` <select data-k="left" title="Where it's held (behind cover) until released"><option value="">held right</option><option value="1"${r.left ? ' selected' : ''}>held left</option></select>` : ''}${r.type === 'position' ? `<select data-k="stance">${[['', 'standing'], ['kneel', 'kneeling'], ['prone', 'prone']].map(([k, v]) => `<option value="${k}"${k === (r.stance || '') ? ' selected' : ''}>${v}</option>`).join('')}</select>` : ''}${r.type === 'plate' ? ` <select data-k="stop" title="A stop plate makes it a Steel Challenge style stage: strings, shoot the stop plate last"><option value="">plate</option><option value="1"${r.stop ? ' selected' : ''}>stop plate</option></select>` : ''}${r.type === 'plate' ? ` <select data-k="ph"><option value="">normal post</option>${Object.entries(B.plateHeights).map(([k, v]) => `<option value="${k}"${k === r.ph ? ' selected' : ''}>${v.label}</option>`).join('')}</select>` : ''}${r.type === 'plate' ? ` <select data-k="size"><option value="">8 in</option>${Object.entries(B.plateSizes).map(([k, v]) => `<option value="${k}"${k === r.size ? ' selected' : ''}>${v.label}</option>`).join('')}</select>` : ''}${r.type === 'paper' || r.type === 'noshoot' ? ` <select data-k="shared" title="Stapled beside the paper row above, on one wide stand (same distance, x about 0.5 m apart)"><option value="">own stand</option><option value="1"${r.shared ? ' selected' : ''}>on the stand of the row above</option></select>` : ''}${r.type === 'noshoot' ? ` <select data-k="over" title="Put it in front of the paper row above, partly covering it"><option value="">place it myself</option>${Object.entries(B.nsCover.spots).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select>` : ''}${(PAPER.includes(r.type) || r.type === 'noshoot') && r.type !== 'turn' ? ` <select data-k="face" title="Turned to face across the bay"><option value="">square on</option>${Object.entries(B.facings).map(([k, v]) => `<option value="${k}"${k === r.face ? ' selected' : ''}>${v.label}</option>`).join('')}</select>` : ''}${PAPER.includes(r.type) || r.type === 'noshoot' ? ` <select data-k="h" title="Height of the target on its stand"><option value="">normal height</option>${Object.entries(B.heights).map(([k, v]) => `<option value="${k}"${k === r.h ? ' selected' : ''}>${v.label}</option>`).join('')}</select>` : ''}${PAPER.includes(r.type) ? ` <select data-k="hard" title="Hard cover: black paint, shots through it don't score"><option value="">no cover</option>${Object.entries(B.hardCover).map(([k, v]) => `<option value="${k}"${k === r.hard ? ' selected' : ''}>${v.label}</option>`).join('')}</select>` : ''}</td>
      <td class="b-acts"><button class="icon" data-up="${i}" aria-label="Move up" title="Move up"${i ? '' : ' disabled'}>↑</button><button class="icon" data-down="${i}" aria-label="Move down" title="Move down"${i < rows.length - 1 ? '' : ' disabled'}>↓</button><button class="icon" data-dup="${i}" aria-label="Duplicate" title="Duplicate (placed a little to the right)">⧉</button><button class="icon" data-del="${i}" aria-label="Remove" title="Remove">✕</button></td></tr>`; }).join('');
  };
  // During a drag only the moved rows' x / yd boxes change (no rebuild).
  const syncRow = i => {
    const tr = $(`#b-rows tr[data-i="${i}"]`);
    if (!tr) return;
    tr.querySelector('[data-k=x]').value = rows[i].x;
    tr.querySelector('[data-k=yd]').value = rows[i].yd;
  };

  // ---- the map: you at the bottom, downrange up, the whole bay ----
  const view = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = canvas.clientWidth || 800, H = canvas.clientHeight || 420;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    const bay = CONFIG.range3d.berm, x0 = -bay.sideX, x1 = bay.sideX, y0 = B.map.ydBehind, y1 = bay.backZ / YARD_M + B.map.ydOver;
    const L = 38, R = 8, T = 8, Bo = 20; // room for the yard / metre labels
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return {
      g, W, H, bay, backYd: bay.backZ / YARD_M,
      px: x => L + ((x - x0) / (x1 - x0)) * (W - L - R),
      py: yd => H - Bo - ((yd - y0) / (y1 - y0)) * (H - T - Bo),
      xOf: p => x0 + ((p - L) / (W - L - R)) * (x1 - x0),
      ydOf: p => y0 + ((H - Bo - p) / (H - T - Bo)) * (y1 - y0),
      mPx: (W - L - R) / (x1 - x0), ydPx: (H - T - Bo) / (y1 - y0),
    };
  };
  // A row's box on the map (centre, width, depth in px), to draw and to hit.
  const shape = (V, r) => {
    const w = Math.max(STEEL.includes(r.type) ? 9 : 8, widthM(r) * V.mPx);
    const h = MOVES.includes(r.type) ? Math.max(14, (1.2 / YARD_M) * V.ydPx) : STEEL.includes(r.type) || r.type === 'barrel' ? w : 7;
    return { cx: V.px(r.x), cy: V.py(r.yd), w, h };
  };
  // The 3D view's width (degrees either side of straight ahead), from each
  // position: things outside it can't be seen (the view doesn't turn).
  const halfFov = () => {
    const v = viewFov(), aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const tanV = v ? Math.tan((v * Math.PI) / 360) : 1 / (2 * CONFIG.knife.focalFrac);
    return Math.atan(tanV * aspect);
  };
  // Is row i in view from the position it's shot from?
  const inView = (P, info, i) => {
    const r = rows[i], at = P[info[i].pos] || P[0], dz = (r.yd - at.yd) * YARD_M;
    if (dz <= 0.5) return false;
    return Math.atan2(Math.max(0, Math.abs(r.x - at.x) - widthM(r) / 2), dz) < halfFov();
  };
  const drawMap = () => {
    const V = view(), { g, W, H, px, py, bay } = V, info = rowInfo(rows), P = positionsOf(rows);
    const line = (ax, ay, bx, by) => { g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); };
    const text = (s, x, y, align = 'center', color = '#222') => { g.fillStyle = color; g.textAlign = align; g.fillText(s, x, y); };
    // Gravel, the side berms and the back berm.
    g.fillStyle = '#c3b59b'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#a08c66';
    g.fillRect(0, 0, px(-bay.sideX) + 6, H); g.fillRect(px(bay.sideX) - 6, 0, W, H); g.fillRect(0, 0, W, py(V.backYd));
    g.fillStyle = 'rgba(0,0,0,0.07)'; // beyond where targets can go
    g.fillRect(px(-bay.sideX) + 6, py(V.backYd), px(-B.maxX) - px(-bay.sideX) - 6, H); g.fillRect(px(B.maxX), py(V.backYd), px(bay.sideX) - 6 - px(B.maxX), H);
    g.font = '11px system-ui, sans-serif'; g.lineWidth = 1;
    for (let yd = 1; yd < V.backYd; yd++) {
      g.strokeStyle = yd % 5 ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.18)';
      line(px(-bay.sideX) + 6, py(yd), px(bay.sideX) - 6, py(yd));
      if (!(yd % 5)) text(`${yd} yd`, 4, py(yd) + 4, 'left', '#3d3426');
    }
    for (let x = -Math.floor(bay.sideX); x <= bay.sideX; x++) {
      g.strokeStyle = 'rgba(0,0,0,0.05)'; line(px(x), py(0), px(x), py(V.backYd));
      if (!(x % 2)) text(`${x > 0 ? '+' : ''}${x} m`, px(x), H - 5, 'center', '#3d3426');
    }
    text('back berm (downrange)', W / 2, py(V.backYd) - 5, 'center', '#3d3426');
    g.setLineDash([6, 4]); g.strokeStyle = 'rgba(255,255,255,0.85)'; line(px(-B.maxX), py(0), px(B.maxX), py(0)); g.setLineDash([]);
    // The view from the position that's being worked on (the selected row's).
    const at = sel >= 0 && info[sel] && info[sel].pos != null ? P[info[sel].pos] || P[0] : P[0], a = halfFov(), far = V.backYd * YARD_M;
    g.fillStyle = 'rgba(255,255,255,0.13)'; g.beginPath(); g.moveTo(px(at.x), py(at.yd));
    g.lineTo(px(at.x - Math.tan(a) * (far - at.yd * YARD_M)), py(V.backYd)); g.lineTo(px(at.x + Math.tan(a) * (far - at.yd * YARD_M)), py(V.backYd)); g.closePath(); g.fill();
    // Lines from the selected position to what's shot from there.
    if (sel >= 0 && info[sel] && info[sel].pos != null) {
      g.strokeStyle = 'rgba(46,125,50,0.55)'; g.setLineDash([4, 4]);
      rows.forEach((r, i) => { if (!info[i].move && !info[i].prop && info[i].pos === info[sel].pos && (info[sel].move || i === sel)) line(px(at.x), py(at.yd), px(r.x), py(r.yd)); });
      g.setLineDash([]);
    }
    // Labels go on last, nudged up or down so they don't sit on each other.
    const labels = [], label = (s, x, y, color = '#222', font = '11px system-ui, sans-serif') => labels.push({ s, x, y, color, font });
    // Shooting boxes (positions at the same spot share one box: "1·2·3").
    const boxes = new Map();
    const addBox = (r, num, i) => {
      const k = `${r.x},${r.yd}`, b = boxes.get(k) || { r, nums: [], stances: [], idx: [] };
      b.nums.push(num); b.idx.push(i); if (r.stance) b.stances.push(r.stance === 'kneel' ? 'kneel' : 'prone');
      if (r.type === 'walkto') b.r = r;
      boxes.set(k, b);
    };
    if (!rows.some((r, i) => info[i].move && info[i].pos === 0)) addBox({ type: 'position', x: 0, yd: 0 }, '1', -2); // (no row sets the start: the firing line)
    rows.forEach((r, i) => { if (info[i].move) addBox(r, info[i].label, i); });
    for (const b of boxes.values()) drawBox(V, b, label);
    // Props first, then targets and steel on top.
    const order = [...rows.keys()].filter(i => !info[i].move).sort((i, j) => (info[j].prop ? 1 : 0) - (info[i].prop ? 1 : 0));
    for (const i of order) {
      const r = rows[i], S = shape(V, r), L = info[i];
      g.save(); g.translate(S.cx, S.cy);
      if (L.prop) drawProp(g, r, S, label);
      else if (STEEL.includes(r.type)) {
        g.fillStyle = '#f5f5f0'; g.strokeStyle = r.stop ? '#b3261e' : '#555'; g.lineWidth = r.stop ? 3 : 1.2;
        g.beginPath(); g.arc(0, 0, S.w / 2, 0, 7); g.fill(); g.stroke();
      } else {
        g.rotate(((PAPER.includes(r.type) || r.type === 'noshoot') && r.type !== 'turn' && B.facings[r.face] ? -B.facings[r.face].deg : 0) * Math.PI / 180);
        const white = r.type === 'noshoot' || r.type === 'nsswing';
        g.fillStyle = white ? '#fafaf6' : ACTIVATED.includes(r.type) ? '#d9a04e' : '#c79a62';
        g.strokeStyle = white ? '#777' : '#6b4f2c'; g.lineWidth = 1;
        g.fillRect(-S.w / 2, -S.h / 2, S.w, S.h); g.strokeRect(-S.w / 2, -S.h / 2, S.w, S.h);
        if (PAPER.includes(r.type) && B.hardCover[r.hard]) { // the black-painted part
          g.fillStyle = '#161616';
          if (r.hard === 'left') g.fillRect(-S.w / 2, -S.h / 2, S.w / 3, S.h); else if (r.hard === 'right') g.fillRect(S.w / 6, -S.h / 2, S.w / 3, S.h); else g.fillRect(-S.w / 2, r.hard === 'top' ? -S.h / 2 : 0, S.w, S.h / 2);
        }
      }
      g.restore();
      if (r.type === 'run') { // where the mover runs to
        g.strokeStyle = '#8a5a1c'; g.setLineDash([5, 4]); line(S.cx, S.cy - 6, px(r.to ?? -r.x), S.cy - 6); g.setLineDash([]);
        label((r.to ?? -r.x) < r.x ? '◀' : '▶', px(r.to ?? -r.x), S.cy - 2, '#8a5a1c');
      }
      const unseen = !L.prop && !inView(P, info, i);
      const tag = `${L.label}${ACTIVATED.includes(r.type) ? ` ${SHORT[r.type] || ''} ← ${r.by || '?'}` : ''}${r.stop ? ' stop' : ''}`;
      if (tag) label(tag, S.cx, S.cy - S.h / 2 - 4, unseen ? '#b3261e' : '#222');
      if (unseen) { g.strokeStyle = '#d32f2f'; g.lineWidth = 2; g.strokeRect(S.cx - S.w / 2 - 4, S.cy - S.h / 2 - 4, S.w + 8, S.h + 8); }
      if (i === sel || i === hover) { g.strokeStyle = i === sel ? '#ffcc00' : 'rgba(255,255,255,0.8)'; g.lineWidth = 2; g.strokeRect(S.cx - S.w / 2 - 3, S.cy - S.h / 2 - 3, S.w + 6, S.h + 6); }
    }
    if (!rows.length) label('Empty stage: pick Paper (or anything) above, then click here where it goes.', W / 2, H / 2, '#2d261b', '600 15px system-ui, sans-serif');
    const placed = [];
    for (const l of labels) {
      g.font = l.font;
      const w = g.measureText(l.s).width + 4, hit = y => placed.some(q => l.x - w / 2 < q.x1 && l.x + w / 2 > q.x0 && y - 11 < q.y1 && y + 2 > q.y0);
      const y = [0, -12, 12, -24, 24].map(d => l.y + d).find(v => !hit(v)) ?? l.y;
      placed.push({ x0: l.x - w / 2, x1: l.x + w / 2, y0: y - 11, y1: y + 2 });
      text(l.s, l.x, y, 'center', l.color);
    }
  };
  // A shooting box (one or more positions on the same spot): a square of
  // boards, green (blue when you walk there shooting), with the numbers.
  const drawBox = (V, b, label) => {
    const { g } = V, S = shape(V, b.r), color = b.r.type === 'walkto' ? '#1565c0' : '#2e7d32';
    g.strokeStyle = color; g.lineWidth = 3;
    g.strokeRect(S.cx - S.w / 2, S.cy - S.h / 2, S.w, S.h);
    g.fillStyle = color; g.font = '700 12px system-ui, sans-serif'; g.textAlign = 'center';
    g.fillText(b.nums.join('·'), S.cx, S.cy + 4);
    if (b.nums.includes('1')) label('you start here', S.cx + S.w / 2 + 44, S.cy + 4, color);
    if (b.stances.length) label(b.stances.join(' / '), S.cx, S.cy + S.h / 2 + 12, color);
    const isSel = b.idx.includes(sel), isHover = b.idx.includes(hover);
    if (isSel || isHover) { g.strokeStyle = isSel ? '#ffcc00' : 'rgba(255,255,255,0.8)'; g.lineWidth = 2; g.strokeRect(S.cx - S.w / 2 - 4, S.cy - S.h / 2 - 4, S.w + 8, S.h + 8); }
  };
  const drawProp = (g, r, S, label) => {
    const wood = r.type === 'wall8' ? '#6f5530' : '#8d6e3f';
    if (r.type === 'barrel') { g.fillStyle = '#24569e'; g.beginPath(); g.arc(0, 0, S.w / 2, 0, 7); g.fill(); return; }
    if (r.type === 'clamshell') { g.strokeStyle = '#6d4c2f'; g.lineWidth = 2; g.setLineDash([4, 3]); g.strokeRect(-S.w / 2, -3, S.w, 6); g.setLineDash([]); return; }
    g.fillStyle = wood;
    if (r.type === 'porthigh' || r.type === 'portlow') { const gap = 0.6 / 2.44 * S.w; g.fillRect(-S.w / 2, -3, S.w / 2 - gap / 2, 6); g.fillRect(gap / 2, -3, S.w / 2 - gap / 2, 6); }
    else g.fillRect(-S.w / 2, -3, S.w, 6);
    const name = { wall8: '8 ft wall', porthigh: 'port', portlow: 'low port', barricade: 'barricade' }[r.type];
    if (name) label(name, S.cx, S.cy - 7, '#3d3426', '10px system-ui, sans-serif');
  };
  // What's under the pointer: a row index, -2 for the start box when no row
  // sets it, or -1.
  const hitTest = (V, mx, my) => {
    const info = rowInfo(rows);
    let best = -1, bestD = Infinity;
    rows.forEach((r, i) => {
      const S = shape(V, r), hw = Math.max(S.w, 16) / 2 + 3, hh = Math.max(S.h, 16) / 2 + 3;
      const dx = Math.abs(mx - S.cx), dy = Math.abs(my - S.cy);
      if (dx <= hw && dy <= hh) { const d = dx + dy + (info[i].prop ? 6 : 0); if (d < bestD) { bestD = d; best = i; } } // (targets win over the wall behind them)
    });
    if (best >= 0) return best;
    if (!rows.some((r, i) => info[i].move && info[i].pos === 0)) {
      const S = shape(V, { type: 'position', x: 0, yd: 0 });
      if (Math.abs(mx - S.cx) <= S.w / 2 + 4 && Math.abs(my - S.cy) <= S.h / 2 + 4) return -2;
    }
    return -1;
  };

  // ---- selection, the line under the map ----
  const describe = () => {
    const out = $('#b-sel');
    if (tool && sel < 0) { out.textContent = `Click on the map to add: ${TYPES[tool]}. (Esc or "Select / move" to stop adding.)`; return; }
    if (sel < 0 || !rows[sel]) {
      out.textContent = rows.length ? 'Click anything on the map to select it (its row below turns yellow), or drag it to move it. Pick what to add, then click an empty spot.' : 'Empty stage: pick Paper (or anything) above, then click on the map where it goes.';
      return;
    }
    const r = rows[sel], info = rowInfo(rows), L = info[sel], P = positionsOf(rows);
    const side = Math.abs(r.x) < 0.05 ? 'straight ahead' : `${Math.abs(r.x).toFixed(2)} m ${r.x < 0 ? 'left' : 'right'}`;
    const where = L.move ? `${L.pos ? `Shooting position ${L.label}` : 'Start box (position 1)'}: ${side}, ${r.yd} yd from the firing line` : `${L.label ? `${L.label} - ` : ''}${TYPES[r.type]}: ${side}, ${r.yd} yd`;
    const from = !L.move && !L.prop && P.length > 1 ? `, shot from position ${L.pos + 1}` : '';
    const by = ACTIVATED.includes(r.type) ? `, released by ${r.by || '(add steel first)'}` : '';
    const seen = !L.move && !L.prop && !inView(P, info, sel) ? ' - OUT OF VIEW from its position: move it into the light wedge, or add a shooting position.' : '';
    out.textContent = `${where}${from}${by}.${seen}${tool ? ` Click an empty spot to add: ${TYPES[tool]}.` : ''} Delete removes it; arrow keys nudge it.`;
  };
  const select = i => {
    sel = i;
    for (const tr of $('#b-rows').children) tr.classList.toggle('sel', Number(tr.dataset.i) === i);
    const tr = $(`#b-rows tr[data-i="${i}"]`), box = $('#b-list');
    if (tr && (tr.offsetTop < box.scrollTop || tr.offsetTop + tr.offsetHeight > box.scrollTop + box.clientHeight)) box.scrollTop = tr.offsetTop - box.clientHeight / 3;
    drawMap(); describe();
  };
  const rerender = () => { render(); drawMap(); describe(); };
  const setTool = t => {
    tool = t;
    for (const b of el.querySelectorAll('#b-tools [data-tool]')) b.classList.toggle('on', b.dataset.tool === t);
    const more = $('#b-more'), other = !!t && !TOOLS.includes(t);
    more.classList.toggle('on', other);
    if (!other) more.value = '';
    canvas.style.cursor = t ? 'crosshair' : 'default';
    describe();
  };
  const remove = i => { remember(); keepSteel(() => rows.splice(i, 1)); sel = -1; rerender(); };
  const nudge = (dx, dyd) => {
    const r = rows[sel], [lo, hi] = ydRange(r.type);
    remember();
    r.x = clamp(round(r.x + dx, 0.05), -B.maxX, B.maxX);
    r.yd = clamp(round(r.yd + dyd, 0.1), lo, hi);
    syncRow(sel); drawMap(); describe();
  };
  // A new row of the chosen type where you clicked: after the selected row
  // (so it's shot from the same position), or at the end. A new shooting
  // position always goes at the end (the targets you add next follow it).
  const addAt = (type, x, yd) => {
    const [lo, hi] = ydRange(type);
    const r = { type, x: clamp(round(x, B.snap.x), -B.maxX, B.maxX), yd: clamp(round(yd, B.snap.yd), lo, hi) };
    if (ACTIVATED.includes(type)) r.by = steelIds(rows)[0] || '';
    if (type === 'run') r.to = -r.x;
    const at = MOVES.includes(type) || sel < 0 ? rows.length : sel + 1;
    remember();
    keepSteel(() => rows.splice(at, 0, r));
    sel = at;
    rerender();
    if (yd < lo - 0.3) toast(`${TYPES[type]} can't be closer than ${lo} yd - put at ${lo} yd.`);
    if (ACTIVATED.includes(type) && !r.by) toast('This one is released by a steel target: add a popper or plate too, then pick it in its row.');
    return at;
  };

  // ---- pointer: click to add or select, drag to move ----
  const pointerAt = e => { const b = canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  canvas.onpointerdown = e => {
    if (e.button > 0) return;
    const V = view(), [mx, my] = pointerAt(e);
    let i = hitTest(V, mx, my), added = false;
    if (i === -1 && tool) { i = addAt(tool, V.xOf(mx), V.ydOf(my)); added = true; select(i); }
    else if (i === -1) { select(-1); return; }
    else if (i >= 0) select(i);
    const r = rows[i] || { x: 0, yd: 0 };
    drag = { i, x0: mx, y0: my, dx: r.x - V.xOf(mx), dyd: r.yd - V.ydOf(my), moved: false, fresh: added };
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  canvas.onpointermove = e => {
    const V = view(), [mx, my] = pointerAt(e);
    if (!drag) { // hover
      const h = hitTest(V, mx, my);
      if (h !== hover) { hover = h; drawMap(); }
      canvas.style.cursor = h !== -1 ? 'grab' : tool ? 'crosshair' : 'default';
      return;
    }
    if (!drag.moved && Math.hypot(mx - drag.x0, my - drag.y0) < 4) return;
    if (!drag.moved) {
      drag.moved = true;
      if (!drag.fresh) remember(); // (a row just added by this click is one undo step)
      if (drag.i === -2) { rows.unshift({ type: 'position', x: 0, yd: 0 }); drag.i = 0; render(); } // the start box, dragged: now a row
      // Rows on its stand (shared) come along.
      drag.followers = [];
      for (let k = drag.i + 1; k < rows.length && rows[k].shared; k++) drag.followers.push([k, rows[k].x - rows[drag.i].x, rows[k].yd - rows[drag.i].yd]);
      canvas.style.cursor = 'grabbing';
    }
    const r = rows[drag.i], [lo, hi] = ydRange(r.type), fine = e.shiftKey;
    r.x = clamp(round(V.xOf(mx) + drag.dx, fine ? B.snap.fineX : B.snap.x), -B.maxX, B.maxX);
    r.yd = clamp(round(V.ydOf(my) + drag.dyd, fine ? B.snap.fineYd : B.snap.yd), lo, hi);
    syncRow(drag.i);
    for (const [k, ox, oy] of drag.followers) { rows[k].x = clamp(round(r.x + ox, 0.01), -B.maxX, B.maxX); rows[k].yd = round(r.yd + oy, 0.01); syncRow(k); }
    sel = drag.i;
    drawMap(); describe();
  };
  canvas.onpointerup = canvas.onpointercancel = () => {
    if (drag?.moved) select(drag.i);
    drag = null;
  };
  canvas.onpointerleave = () => { if (!drag && hover !== -1) { hover = -1; drawMap(); } };

  // ---- the list's controls ----
  $('#b-rows').onchange = e => {
    const tr = e.target.closest('tr'), k = e.target.dataset.k;
    if (!tr || !k) return;
    const i = Number(tr.dataset.i), r = rows[i];
    remember();
    if (k === 'shared' && e.target.value) { // beside the row above on its stand: same distance, 0.5 m over
      const above = rows[i - 1];
      if (!above || !(above.type === 'paper' || above.type === 'noshoot')) { e.target.value = ''; hist.pop(); return toast('Put it right under a paper or no-shoot row first.'); }
      Object.assign(r, { shared: true, x: Math.min(B.maxX, Math.round((above.x + B.shareGap) * 100) / 100), yd: above.yd });
      return rerender();
    }
    if (k === 'over') { // a no-shoot in front of the paper above: set its x / yd / height from that paper
      const spot = B.nsCover.spots[e.target.value], above = rows.slice(0, i).reverse().find(p => PAPER.includes(p.type));
      if (!spot) return hist.pop();
      if (!above) { hist.pop(); return toast('Add a paper row above the no-shoot first.'); }
      Object.assign(r, { x: Math.round((above.x + spot.dx) * 100) / 100, yd: Math.round((above.yd - B.nsCover.front) * 10) / 10, h: spot.h });
      return rerender();
    }
    const set = () => { r[k] = k === 'left' || k === 'stop' || k === 'shared' ? !!e.target.value : k === 'type' || k === 'by' || k === 'hard' || k === 'stance' || k === 'h' || k === 'size' || k === 'ph' || k === 'face' ? e.target.value : Number(e.target.value); };
    if (k === 'type') keepSteel(set); else set(); // (a new type can renumber the steel; a new "released by" is the choice itself)
    sel = i;
    if (k === 'type') render(); // (activated paper gets its "released by" choice, the numbers change)
    drawMap(); describe();
  };
  $('#b-rows').onclick = e => {
    const d = e.target.closest('button')?.dataset;
    const tr = e.target.closest('tr');
    if (!d) { if (tr && Number(tr.dataset.i) !== sel) select(Number(tr.dataset.i)); return; }
    remember();
    if (d.del != null) { keepSteel(() => rows.splice(Number(d.del), 1)); sel = -1; }
    else if (d.up != null && d.up > 0) { const i = Number(d.up); keepSteel(() => { [rows[i - 1], rows[i]] = [rows[i], rows[i - 1]]; }); sel = i - 1; }
    else if (d.down != null && d.down < rows.length - 1) { const i = Number(d.down); keepSteel(() => { [rows[i], rows[i + 1]] = [rows[i + 1], rows[i]]; }); sel = i + 1; }
    else if (d.dup != null) { const i = Number(d.dup), r = rows[i]; keepSteel(() => rows.splice(i + 1, 0, { ...r, x: Math.min(B.maxX, Math.round((r.x + B.dupStep) * 100) / 100), shared: false })); sel = i + 1; }
    else { hist.pop(); return; }
    rerender();
  };
  $('#b-add').onclick = () => { const last = rows[rows.length - 1]; remember(); rows.push({ type: 'paper', x: last ? Math.min(B.maxX, last.x + 1.5) : 0, yd: last && !MOVES.includes(last.type) ? last.yd : 7 }); sel = rows.length - 1; rerender(); };
  $('#b-tools').onclick = e => { const b = e.target.closest('[data-tool]'); if (b) setTool(b.dataset.tool === tool && b.dataset.tool ? '' : b.dataset.tool); };
  $('#b-more').onchange = e => setTool(e.target.value);
  $('#b-undo').onclick = () => undo();
  $('#b-undo').disabled = true;
  $('#b-new').onclick = () => {
    remember();
    rows = []; sel = -1; setCurrent(null);
    $('#b-name').value = ''; $('#b-par').value = B.par; setStarts('');
    setTool('paper');
    rerender();
    toast('New empty stage: click on the map to add paper, or pick something else first.');
  };
  $('#b-save').onclick = () => {
    const name = $('#b-name').value.trim() || `My stage ${loadStages().length + 1}`;
    const par = Math.max(1, Number($('#b-par').value) || B.par);
    const ids = steelIds(rows);
    rows = rows.map(r => ({ type: r.type, x: clamp(r.x, -B.maxX, B.maxX), yd: clamp(r.yd, ...ydRange(r.type)),
      ...(ACTIVATED.includes(r.type) ? { by: ids.includes(r.by) ? r.by : ids[0] } : {}),
      ...(r.type === 'run' ? { to: clamp(r.to ?? -r.x, -B.maxX, B.maxX) } : {}),
      ...(PAPER.includes(r.type) && B.hardCover[r.hard] ? { hard: r.hard } : {}),
      ...(r.type === 'position' && STANCES.includes(r.stance) ? { stance: r.stance } : {}),
      ...(SWINGS.includes(r.type) && r.left ? { left: true } : {}),
      ...(r.type === 'plate' && Object.hasOwn(B.plateSizes, r.size || '') ? { size: r.size } : {}),
      ...(r.type === 'plate' && r.stop ? { stop: true } : {}),
      ...((r.type === 'paper' || r.type === 'noshoot') && r.shared ? { shared: true } : {}),
      ...(r.type === 'plate' && Object.hasOwn(B.plateHeights, r.ph || '') ? { ph: r.ph } : {}),
      ...((PAPER.includes(r.type) || r.type === 'noshoot') && Object.hasOwn(B.facings, r.face || '') ? { face: r.face } : {}),
      ...((PAPER.includes(r.type) || r.type === 'noshoot') && Object.hasOwn(B.heights, r.h || '') ? { h: r.h } : {}) }));
    if (!rows.some(r => !PROPS.includes(r.type) && r.type !== 'noshoot' && r.type !== 'nsswing' && !MOVES.includes(r.type))) return toast('Add at least one target to shoot.');
    if (rows.some(r => ACTIVATED.includes(r.type)) && !ids.length) return toast('A pop-up, turner, swinger, bobber, mover or clamshell needs a steel target to release it.');
    const stage = { name, par, rows, start: $('#b-start').value };
    const all = loadStages().filter(s => s.name !== name && s.name !== current?.name);
    all.push(stage);
    save(CONFIG.storage.stages, all);
    close();
    onSave(stage, current?.name);
  };
  $('#b-delete').onclick = () => {
    if (!current) return;
    save(CONFIG.storage.stages, loadStages().filter(s => s.name !== current.name));
    close();
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
    remember();
    rows = s.rows; sel = -1;
    $('#b-name').value = s.name;
    $('#b-par').value = s.par;
    setStarts(s.start);
    rerender();
    toast(`Loaded "${s.name}" - Save to keep it.`);
  };
  const close = () => { el.hidden = true; builderOpen = null; };
  $('#b-close').onclick = close;

  // Keys while it's open (main.js passes them on; not while typing in a box).
  builderOpen = {
    redraw: drawMap,
    // Tabbing into a row of the list selects it too.
    focusRow(e) { const tr = e.target.closest('tr'); if (tr && Number(tr.dataset.i) !== sel) select(Number(tr.dataset.i)); },
    key(e) {
      const k = e.key;
      if (k === 'Escape') { if (drag) return true; if (tool) setTool(''); else if (sel >= 0) select(-1); else close(); return true; }
      if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'z') { undo(); return true; }
      if (e.ctrlKey || e.metaKey || e.altKey || sel < 0) return false;
      if (k === 'Delete' || k === 'Backspace') { remove(sel); return true; }
      const step = e.shiftKey ? 5 : 1, n = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, 0.5], ArrowDown: [0, -0.5] }[k];
      if (n) { nudge(n[0] * step, n[1] * (e.shiftKey ? 2 : 1)); return true; }
      return false;
    },
  };
  el.hidden = false;
  setTool('');
  rerender(); // (after it's shown: the map sizes itself to the form)
}

// Keys for the open builder (main.js): true when it used the key.
export const builderKey = e => (builderOpen ? builderOpen.key(e) : false);
window.addEventListener('resize', () => builderOpen?.redraw());
document.getElementById('b-rows')?.addEventListener('focusin', e => builderOpen?.focusRow(e));

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || 0));

// Stage codes: 'DFS1.' + base64url(JSON). Checked on the way back in.
const CODE = 'DFS1.';
export function encodeStage(s) {
  const json = JSON.stringify({ n: s.name, p: s.par, s: s.start, r: s.rows.map(r => [r.type, r.x, r.yd, r.by || '', r.to ?? '', r.hard || '', r.stance || '', r.h || '', r.left ? 1 : '', r.size || '', r.stop ? 1 : '', r.ph || '', r.face || '', r.shared ? 1 : '']) });
  return CODE + btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeStage(code) {
  try {
    code = String(code).trim();
    if (!code.startsWith(CODE)) return null;
    const b64 = code.slice(CODE.length).replace(/-/g, '+').replace(/_/g, '/');
    const o = JSON.parse(decodeURIComponent(escape(atob(b64))));
    const rows = (o.r || []).filter(r => TYPES[r[0]]).slice(0, 60).map(([type, x, yd, by, to, hard, stance, h, left, size, stop, ph, face, shared]) => ({
      type, x: Number(x) || 0, yd: Number(yd) || 0, ...(by ? { by: String(by) } : {}), ...(to !== '' && to != null ? { to: Number(to) } : {}),
      ...(Object.hasOwn(CONFIG.builder.hardCover, hard) ? { hard } : {}), ...(STANCES.includes(stance) ? { stance } : {}), ...(Object.hasOwn(CONFIG.builder.heights, h || '') ? { h } : {}), ...(left ? { left: true } : {}), ...(Object.hasOwn(CONFIG.builder.plateSizes, String(size ?? '')) ? { size: String(size) } : {}), ...(stop ? { stop: true } : {}), ...(Object.hasOwn(CONFIG.builder.plateHeights, ph || '') ? { ph } : {}), ...(Object.hasOwn(CONFIG.builder.facings, face || '') ? { face } : {}), ...(shared ? { shared: true } : {}),
    }));
    if (!rows.length) return null;
    return { name: String(o.n || 'Shared stage').slice(0, 40), par: Number(o.p) || CONFIG.builder.par, start: o.s ? String(o.s).slice(0, 120) : '', rows };
  } catch { return null; }
}
