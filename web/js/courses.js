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
//
// Drill fields (all optional except name/type/parTime):
//   layout         range layout to use; null = whatever the user picked (L)
//   requiredShots  run ends after this many rounds (0 = ends at the par beep)
//   requiredHits   run ends after this many hits (pop-ups, movers, steel)
//   maxShots       with requiredHits: out of ammo after this many rounds = fail
//   parTime        seconds from the beep
//   minAHits / minBodyHits / minHeadHits   pass criteria
//   perTargetMin   every bay target needs at least this many hits
//   order: 'ltr'   hits must go left to right across the bay targets
//   desc           one line shown in the drill panel

import { SCENARIOS } from './scenarios.js';

export const CATEGORIES = ['Fundamentals', 'Transitions', 'Movement', 'Pop-ups', 'Flip Grid', 'Steel', 'Precision', 'Judgment'];

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
    exposures: 8, together: 2, upTime: 2.2, gap: [0.8, 2.0], passPct: 80,
    desc: 'Two plates at a time. Hit both before they spin back.' },
  { name: 'Numbered Grid 1–12', category: 'Flip Grid', type: 'flip', layout: 'grid', mode: 'order', parTime: 12,
    desc: 'At the beep all plates spin to numbers. Shoot 1 to 12 in order. Wrong number = penalty.' },
  { name: 'Called Numbers', category: 'Flip Grid', type: 'flip', layout: 'grid', mode: 'called',
    calls: 10, gap: [0.7, 1.8], callPar: 1.5,
    desc: 'A voice calls a number; shoot that plate. The numbers reshuffle after every hit.' },
];

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
