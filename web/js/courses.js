// courses.js — every drill, Dot Torture, and scenario the user can pick.
// ---------------------------------------------------------------------------
// type 'drill'     timed by the shot timer (run.js)
// type 'dots'      Dot Torture, untimed, stage by stage (dots.js)
// type 'scenario'  shoot / no-shoot judgment scene (scenario.js + scenarios.js)
// type 'popup'     pop-up reaction drill (popdrill.js)
// type 'knife'     parking-lot knife attack (knife.js)
// type 'flip'      flip-tile grid drills (flipdrill.js)
// type 'knife3d'   the knife attack in real 3D (knife3d.js, loaded on demand)
// type 'office3d'  active shooter in an office building, 3D (office3d.js, on demand)
// type 'stage'     USPSA-style stage on the 3D range: paper, no-shoots and steel
//                  at their own distances (stage.js scores it, range3d.js draws it)
//
// Drill fields (all optional except name/type/parTime):
//   layout         range layout to use; null = whatever the user picked (L).
//                  single / bay / popup / star switch to the 3D range when it's
//                  on (range.js TO_3D); 'range3d-*' layouts are always 3D.
//   requiredShots  run ends after this many rounds (0 = ends at the par beep)
//   requiredHits   run ends after this many hits (pop-ups, movers, steel)
//   maxShots       with requiredHits: out of ammo after this many rounds = fail
//   parTime        seconds from the beep
//   minAHits / minBodyHits / minHeadHits   pass criteria
//   perTargetMin   every bay target needs at least this many hits
//   order: 'ltr'   hits must go left to right across the bay targets
//   desc           one line shown in the drill panel

import { SCENARIOS } from './scenarios.js';

export const CATEGORIES = ['Fundamentals', 'Transitions', 'Movement', 'Pop-ups', 'Flip Grid', 'Steel', 'Stages', 'Precision', 'Judgment'];

const DRILLS = [
  // Fundamentals
  { name: 'Free Run', category: 'Fundamentals', layout: null, requiredShots: 0, parTime: 5.0,
    desc: 'Shoot anything until the par beep. L changes the targets.' },
  { name: 'Bill Drill', category: 'Fundamentals', layout: 'single', requiredShots: 6, parTime: 2.0,
    desc: '6 rounds on one target, all A zone ideally.' },
  { name: 'Doubles', category: 'Fundamentals', layout: 'single', requiredShots: 2, parTime: 1.0, minAHits: 2,
    desc: 'A fast pair. Both must be A-zone hits.' },
  { name: 'Par String (5)', category: 'Fundamentals', layout: 'single', requiredShots: 5, parTime: 3.0,
    desc: '5 rounds on one target inside par.' },
  { name: 'Head Box', category: 'Fundamentals', layout: 'single', requiredShots: 3, parTime: 3.0, minHeadHits: 3,
    desc: '3 rounds, all in the head box.' },
  { name: 'Mozambique', category: 'Fundamentals', layout: 'single', requiredShots: 3, parTime: 2.5,
    minBodyHits: 2, minHeadHits: 1, desc: '2 to the body, 1 to the head.' },

  // Transitions
  { name: 'Transitions 1-1-1', category: 'Transitions', layout: 'bay', requiredShots: 3, parTime: 2.0,
    perTargetMin: 1, order: 'ltr', desc: 'One round on each target, left to right.' },
  { name: 'Transitions 2-2-2', category: 'Transitions', layout: 'bay', requiredShots: 6, parTime: 3.5,
    perTargetMin: 2, order: 'ltr', desc: 'Two rounds on each target, left to right.' },
  { name: 'El Presidente (dry)', category: 'Transitions', layout: 'bay', requiredShots: 12, parTime: 10.0,
    perTargetMin: 4, desc: '2 on each target, reload, 2 on each again. Timer runs through the reload.' },

  // Movement
  { name: 'Movers', category: 'Movement', layout: 'movers', requiredHits: 4, maxShots: 10, parTime: 8.0,
    desc: 'Hit 4 moving targets. 10 rounds max.' },

  // Steel
  { name: 'Texas Star', category: 'Steel', layout: 'star', requiredHits: 5, maxShots: 15, parTime: 8.0,
    desc: 'Clear all 5 plates. It starts spinning after the first plate falls.' },
  { name: 'Plate Rack', category: 'Steel', layout: 'range3d-plates', requiredHits: 6, maxShots: 12, parTime: 6.0,
    desc: 'Six 8-inch plates on a rack at 10 yards (3D). Knock them all down.' },
  { name: 'Poppers', category: 'Steel', layout: 'range3d-poppers', requiredHits: 4, maxShots: 8, parTime: 4.0,
    desc: 'Four full-size poppers (3D). Every one has to fall.' },
];

const POPUPS = [
  { name: 'Pop-up Reaction', category: 'Pop-ups', type: 'popup', layout: 'popup',
    exposures: 10, together: 1, upTime: 2.5, gap: [0.8, 2.5], passPct: 80,
    desc: '10 targets, one at a time. Hit each before it drops.' },
  { name: 'Pop-up Pairs', category: 'Pop-ups', type: 'popup', layout: 'popup',
    exposures: 6, together: 2, upTime: 3.0, gap: [1.0, 2.5], passPct: 80,
    desc: 'Two targets at once. Hit both before they drop.' },
  { name: 'Pop-up Speed', category: 'Pop-ups', type: 'popup', layout: 'popup',
    exposures: 12, together: 1, upTime: [2.0, 0.8], gap: [0.6, 1.8], passPct: 75,
    desc: 'Each target stays up a little less than the one before.' },
];

const FLIP = [
  { name: 'Flip Grid', category: 'Flip Grid', type: 'flip', layout: 'grid', mode: 'flash',
    exposures: 15, together: 1, upTime: 1.6, gap: [0.5, 1.8], passPct: 80,
    desc: 'Plates spin to an orange target for a moment. Hit each before it spins back.' },
  { name: 'Flip Grid Pairs', category: 'Flip Grid', type: 'flip', layout: 'grid', mode: 'flash',
    exposures: 8, together: 2, upTime: 2.2, gap: [0.8, 2.0], passPct: 100, failOnMiss: true,
    desc: 'Two plates at a time. Hit both before they spin back: one that gets away fails the run.' },
  { name: 'Numbered Grid 1–12', category: 'Flip Grid', type: 'flip', layout: 'grid', mode: 'order', parTime: 12,
    desc: 'At the beep all plates spin to numbers. Shoot 1 to 12 in order. Wrong number = penalty.' },
  { name: 'Called Numbers', category: 'Flip Grid', type: 'flip', layout: 'grid', mode: 'called',
    calls: 10, gap: [0.7, 1.8], callPar: 1.5,
    desc: 'A voice calls a number; shoot that plate. The numbers reshuffle after every hit.' },
];

// Stages. Items: type 'paper' | 'noshoot' | 'popper' | 'mini' | 'plate', x in
// metres (left -, right +, from the shooting position), yd = distance in yards.
// No-shoots are listed after the paper they cover and sit a little in front;
// dy raises (+) or lowers (-) one, in metres. Plates may set h (stand height).
// Every paper needs 2 hits and every piece of steel has to fall (CONFIG.stage).
const STAGES = [
  { name: 'Mini Poppers', category: 'Steel', parTime: 5.0, maxShots: 10,
    desc: 'Five mini poppers at 10 yards (3D). Knock them all down.',
    stage: { items: [-2.4, -1.2, 0, 1.2, 2.4].map(x => ({ type: 'mini', x, yd: 10 })) } },
  { name: 'Paper and Steel', category: 'Stages', parTime: 8.0, maxShots: 16,
    desc: 'Two paper at 7 yd, two poppers, two plates. 2 hits per paper, all steel down.',
    stage: { items: [
      { type: 'plate', x: -3.6, yd: 10 },
      { type: 'paper', x: -1.6, yd: 7 },
      { type: 'popper', x: -0.6, yd: 13 },
      { type: 'popper', x: 0.8, yd: 13 },
      { type: 'paper', x: 1.8, yd: 7 },
      { type: 'plate', x: 3.8, yd: 10 },
    ] } },
  { name: 'No-Shoots', category: 'Stages', parTime: 8.0, maxShots: 14,
    desc: 'Three paper, each partly behind a white no-shoot, plus a mini popper. Hitting a no-shoot costs 10.',
    stage: { items: [
      { type: 'paper', x: -2.2, yd: 8 },
      { type: 'noshoot', x: -1.9, yd: 7.8, dy: -0.25 },
      { type: 'paper', x: 0, yd: 9 },
      { type: 'noshoot', x: -0.3, yd: 8.8, dy: 0.25 },
      { type: 'paper', x: 2.2, yd: 8 },
      { type: 'noshoot', x: 2.55, yd: 7.8, dy: -0.1 },
      { type: 'mini', x: -4.6, yd: 12 },
    ] } },
  { name: 'Long Course', category: 'Stages', parTime: 16.0, maxShots: 26,
    desc: 'Paper from 5 to 15 yards, plates, mini poppers and a far popper. 2 per paper, all steel down.',
    stage: { items: [
      { type: 'paper', x: -3.2, yd: 5 },
      { type: 'plate', x: -4.6, yd: 10 },
      { type: 'plate', x: -3.9, yd: 10 },
      { type: 'plate', x: -3.2, yd: 10 },
      { type: 'paper', x: -1.4, yd: 9 },
      { type: 'noshoot', x: -1.0, yd: 8.8, dy: -0.3 },
      { type: 'mini', x: -0.3, yd: 15 },
      { type: 'popper', x: 0.6, yd: 20 },
      { type: 'mini', x: 1.5, yd: 15 },
      { type: 'paper', x: 2.0, yd: 12 },
      { type: 'paper', x: 3.4, yd: 6 },
    ] } },
];

// The stage's items with their target ids: P1.. for paper, NS1.. for
// no-shoots, S1.. for steel. range3d.js and stage.js both use this.
export function stageTargets(stage) {
  let p = 0, n = 0, s = 0;
  return stage.items.map(it => ({
    ...it, id: it.type === 'paper' ? `P${++p}` : it.type === 'noshoot' ? `NS${++n}` : `S${++s}`,
    steel: it.type !== 'paper' && it.type !== 'noshoot',
  }));
}

const DOTS = [
  { name: 'Dot Torture', category: 'Precision', type: 'dots', layout: 'dots',
    desc: '50 rounds on 10 small dots, untimed. Every round must be in the right dot.' },
];

const SCENES = [
  { name: 'Active Shooter: Office Building (3D)', category: 'Judgment', type: 'office3d', layout: 'office3d',
    desc: 'Radio call, walk in past a wounded man, then clear a cubicle office: gunmen pop up, then a hostage-taker.' },
  { name: 'Parking Lot: Knife Attack (3D)', category: 'Judgment', type: 'knife3d', layout: 'lot3d',
    desc: 'The knife attack in realistic 3D: a man with a knife ~30 ft away. If he charges, stop him before he reaches you.' },
  { name: 'Parking Lot: Knife Attack', category: 'Judgment', type: 'knife', layout: 'lot',
    desc: 'A man with a knife, ~30 ft away in a parking lot. If he charges, stop him before he reaches you.' },
  { name: 'Random Scenario', category: 'Judgment', type: 'scenario', layout: 'scene', template: null,
    desc: 'A random scene from the list below.' },
  ...SCENARIOS.map(s => ({ name: s.name, category: 'Judgment', type: 'scenario', layout: 'scene', template: s.id, desc: s.desc })),
];

export const COURSES = [
  ...DRILLS.map(d => ({ type: 'drill', ...d })),
  ...POPUPS,
  ...FLIP,
  ...STAGES.map(c => ({ type: 'stage', layout: 'range3d-stage', ...c })),
  ...DOTS,
  ...SCENES,
];

// Dot Torture sequence (50 rounds). Each stage: which dots, rounds per dot on
// each draw, how many draws, and a note.
export const DOT_TORTURE = [
  { dots: [1], rounds: [5], draws: 1, note: 'Draw, 5 rounds slow fire' },
  { dots: [2], rounds: [1], draws: 5, note: 'Draw and fire 1 round, 5 times' },
  { dots: [3, 4], rounds: [1, 1], draws: 4, note: 'Draw, 1 on #3 and 1 on #4, 4 times' },
  { dots: [5], rounds: [5], draws: 1, note: 'Draw, 5 rounds strong hand only' },
  { dots: [6, 7], rounds: [2, 2], draws: 3, note: 'Draw, 2 on #6 and 2 on #7, 3 times' },
  { dots: [8], rounds: [5], draws: 1, note: 'Draw, 5 rounds weak hand only' },
  { dots: [9, 10], rounds: [1, 1], draws: 5, note: 'Draw, 1 on #9 and 1 on #10, 5 times' },
];
